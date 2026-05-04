package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"nanas/internal/apierr"
	"nanas/internal/auth"
	"nanas/internal/cdc"
	"nanas/internal/config"
	"nanas/internal/datalane"
	"nanas/internal/dsl"
	"nanas/internal/graphqlapi"
	"nanas/internal/httpx"
	"nanas/internal/i18n"
	"nanas/internal/metrics"
	"nanas/internal/middleware"
	"nanas/internal/migrate"
	"nanas/internal/miniox"
	"nanas/internal/natsbus"
	"nanas/internal/provision"
	"nanas/internal/realtime"
	"nanas/internal/secrets"
	"nanas/internal/sigwebhook"
	"nanas/internal/store"
	"nanas/internal/telemetry"
	"nanas/internal/tenantdb"
	"nanas/internal/tenantddl"
	"nanas/internal/webui"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()
	shutdown := telemetry.MaybeInit(ctx, cfg.OtelEndpoint, cfg.OtelInsecure)
	defer shutdown()

	bun, err := i18n.Load(cfg.LocalesDir)
	if err != nil {
		slog.Error("i18n", "err", err)
		os.Exit(1)
	}

	pool, err := dbConnect(ctx, cfg)
	if err != nil {
		slog.Error("db", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := migrate.Up(ctx, pool); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}

	st := store.New(pool)
	hub := realtime.NewHub()
	dp := datalane.New(cfg)
	lastCron := sync.Map{}

	nbus, err := natsbus.Connect(ctx, cfg, natsbus.BusOpts{
		OnDispatch: func(b []byte) {
			var payload map[string]any
			_ = json.Unmarshal(b, &payload)
			if pidStr, ok := payload["project_id"].(string); ok {
				if pid, er := uuid.Parse(pidStr); er == nil {
					hub.Broadcast(pid, "triggers", payload)
				}
			}
			natsbus.LogDispatch(b)
		},
		OnDLQ: func(ic context.Context, pid uuid.UUID, raw []byte, reason string) {
			_ = st.AppendTriggerDLQ(ic, pid, reason, json.RawMessage(raw))
		},
	})
	if err != nil {
		slog.Warn("nats optional", "err", err)
	}
	if nbus != nil {
		defer nbus.Close()
		go cronTicker(ctx, st, nbus, &lastCron)
		go dbPollTicker(ctx, st, nbus, &lastCron)
		go retentionTicker(st)
	}

	cdcMgr := cdc.NewManager(cfg, st, hub, nbus)
	cdcMgr.Bootstrap(ctx)
	defer cdcMgr.Close()

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(middleware.RequestID(), middleware.I18n(bun), middleware.RecoverJSON(bun), middleware.AccessLog(), metrics.PrometheusHTTP(), middleware.RateLimitApprox(cfg.RateLimitPerMinute))
	if cfg.OtelEndpoint != "" {
		r.Use(otelgin.Middleware("nanas-control-plane"))
	}
	r.Use(func(c *gin.Context) { c.Set(middleware.KeyStore, st); c.Next() })

	r.GET("/metrics", metrics.Handler())

	r.GET("/healthz", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })
	r.GET("/readyz", func(c *gin.Context) {
		if err := pool.Ping(c.Request.Context()); err != nil {
			httpx.Problem(c, bun, 503, "INTERNAL_ERROR", nil)
			return
		}
		minioCtx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()
		if err := miniox.Ping(minioCtx, cfg); err != nil {
			httpx.Problem(c, bun, 503, "STORAGE_UNAVAILABLE", nil)
			return
		}
		c.JSON(200, gin.H{"status": "ready"})
	})

	r.StaticFile("/openapi.yaml", "./openapi.yaml")

	r.POST("/v1/ingress/:tid", func(c *gin.Context) {
		tid, err := uuid.Parse(c.Param("tid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "TRIGGER_ID_INVALID", nil)
			return
		}
		tr, er := st.TriggerForIngress(c.Request.Context(), tid)
		if er != nil || !strings.EqualFold(strings.TrimSpace(tr.Type), "http") {
			httpx.Problem(c, bun, 404, "HTTP_TRIGGER_NOT_FOUND", nil)
			return
		}
		want, _ := tr.Config["secret"].(string)
		signed, _ := tr.Config["signed"].(bool)
		raw, _ := c.GetRawData()
		if signed {
			header := strings.TrimSpace(c.GetHeader(sigwebhook.Header))
			skew := time.Duration(cfg.WebhookMaxSkewSeconds) * time.Second
			if err := sigwebhook.Verify(strings.TrimSpace(want), header, raw, time.Now(), skew); err != nil {
				if errors.Is(err, sigwebhook.ErrSignatureExpired) {
					httpx.Problem(c, bun, 401, "WEBHOOK_SIGNATURE_EXPIRED", nil)
					return
				}
				httpx.Problem(c, bun, 401, "WEBHOOK_SIGNATURE_INVALID", nil)
				return
			}
		} else {
			sec := strings.TrimSpace(c.GetHeader("X-Webhook-Secret"))
			if want == "" || sec != strings.TrimSpace(want) {
				httpx.Problem(c, bun, 401, "WEBHOOK_SECRET_MISMATCH", nil)
				return
			}
		}
		var extras map[string]any
		if len(raw) > 0 {
			_ = json.Unmarshal(raw, &extras)
		}
		payload := map[string]any{"trigger_id": tr.ID.String(), "project_id": tr.ProjectID.String(), "http": true}
		for k, v := range extras {
			payload[k] = v
		}
		if nbus != nil {
			_ = nbus.PublishTriggerDispatch(c.Request.Context(), payload)
		}
		hub.Broadcast(tr.ProjectID, "triggers", payload)
		c.JSON(202, gin.H{"queued": true})
	})

	r.POST("/internal/minio-events", func(c *gin.Context) {
		sec := strings.TrimSpace(c.GetHeader("X-Minio-Webhook-Secret"))
		if cfg.MinIOWebhookSecret == "" || sec != cfg.MinIOWebhookSecret {
			httpx.Problem(c, bun, http.StatusUnauthorized, "MINIO_WEBHOOK_UNAUTHORIZED", nil)
			return
		}
		raw, err := c.GetRawData()
		if err != nil || len(raw) == 0 {
			httpx.Problem(c, bun, 400, "OBJECT_EVENT_BODY_INVALID", nil)
			return
		}
		var root map[string]any
		if json.Unmarshal(raw, &root) != nil {
			httpx.Problem(c, bun, 400, "OBJECT_EVENT_PARSE_ERROR", nil)
			return
		}
		bucket, key := parseMinioWebhook(root)
		if bucket == "" || key == "" {
			httpx.Problem(c, bun, 400, "OBJECT_EVENT_PARSE_ERROR", nil)
			return
		}
		pid, err := st.ProjectIDByMinioBucket(c.Request.Context(), bucket)
		if err != nil {
			httpx.Problem(c, bun, 404, "OBJECT_BUCKET_UNKNOWN", nil)
			return
		}
		payload := map[string]any{"project_id": pid.String(), "type": "object", "bucket": bucket, "key": key}
		if nbus != nil {
			_ = nbus.PublishTriggerDispatch(c.Request.Context(), payload)
		}
		hub.Broadcast(pid, "objects", payload)
		c.JSON(200, gin.H{"ok": true})
	})

	r.POST("/auth/register", func(c *gin.Context) {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		u, err := st.CreateUser(c.Request.Context(), body.Email, string(hash), "user")
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "email", Message: bun.AsLocaleMsg("EMAIL_ALREADY_TAKEN")}})
			return
		}
		tok, err := auth.Sign(cfg, u.ID, u.Email)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"token": tok, "user": gin.H{"id": u.ID, "email": u.Email}})
	})

	r.POST("/auth/login", func(c *gin.Context) {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		u, ph, err := st.UserByEmail(c.Request.Context(), body.Email)
		if err != nil {
			httpx.Problem(c, bun, 401, "INVALID_CREDENTIALS", nil)
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(ph), []byte(body.Password)) != nil {
			httpx.Problem(c, bun, 401, "INVALID_CREDENTIALS", nil)
			return
		}
		tok, err := auth.Sign(cfg, u.ID, u.Email)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"token": tok})
	})

	v1 := r.Group("/v1", middleware.RequireAuth(cfg, bun), middleware.APIKeyQuota(), middleware.ProjectQuotaFromSettings(st))
	v1.POST("/projects", func(c *gin.Context) {
		uid := c.MustGet(middleware.KeyUserUUID).(uuid.UUID)
		var body struct {
			Name   string `json:"name"`
			Region string `json:"region"`
		}
		if err := c.BindJSON(&body); err != nil || strings.TrimSpace(body.Name) == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if body.Region == "" {
			body.Region = "default"
		}
		p, err := st.InsertProject(c.Request.Context(), uid, body.Name, body.Region)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		_ = st.Audit(c.Request.Context(), &p.ID, &uid, "project.create", p.Name, map[string]any{"id": p.ID})
		_ = st.UpsertProjectSettingsDefaults(c.Request.Context(), p.ID)
		provision.RunAsync(pool, cfg, p.ID)
		c.JSON(201, gin.H{"id": p.ID, "name": p.Name, "region": p.Region, "provision_status": p.ProvisionStatus})
	})

	v1.GET("/projects", middleware.RequireJWT(cfg, bun), func(c *gin.Context) {
		uid := c.MustGet(middleware.KeyUserUUID).(uuid.UUID)
		list, err := st.ProjectsAccessible(c.Request.Context(), uid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		out := make([]gin.H, 0, len(list))
		for _, p := range list {
			out = append(out, projectJSON(p))
		}
		c.JSON(200, gin.H{"projects": out})
	})

	v1.GET("/projects/:pid", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		p, err := st.ProjectByID(c.Request.Context(), pid)
		if err != nil {
			httpx.Problem(c, bun, 404, "PROJECT_NOT_FOUND", nil)
			return
		}
		c.JSON(200, projectJSON(p))
	})

	v1.POST("/projects/:pid/keys", middleware.RequirePermission("admin"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			Role string `json:"role"`
			Name string `json:"name"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if body.Role == "" {
			body.Role = "developer"
		}
		plain := "sk_" + strings.ReplaceAll(uuid.NewString(), "-", "") + "_" + uuid.NewString()[:8]
		rec, err := st.CreateAPIKey(c.Request.Context(), pid, body.Role, body.Name, plain)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(201, gin.H{"id": rec.ID, "key": plain, "role": rec.Role})
	})

	v1.GET("/projects/:pid/keys", middleware.RequirePermission("admin"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		rows, err := st.ListAPIKeys(c.Request.Context(), pid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"keys": rows})
	})

	v1.POST("/projects/:pid/keys/:kid/revoke", middleware.RequirePermission("admin"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		kid, err := uuid.Parse(c.Param("kid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		err = st.RevokeAPIKey(c.Request.Context(), pid, kid)
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Problem(c, bun, 404, "NOT_FOUND", nil)
			return
		}
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		var uid *uuid.UUID
		if v, ok := c.Get(middleware.KeyUserUUID); ok {
			u := v.(uuid.UUID)
			uid = &u
		}
		_ = st.Audit(c.Request.Context(), &pid, uid, "apikey.revoke", kid.String(), nil)
		c.JSON(200, gin.H{"revoked": true})
	})

	v1.PATCH("/projects/:pid/keys/:kid/quota", middleware.RequirePermission("admin"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		kid, err := uuid.Parse(c.Param("kid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		var body struct {
			RPM *int `json:"rpm"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if body.RPM != nil && *body.RPM <= 0 {
			httpx.Problem(c, bun, 400, "QUOTA_RPM_INVALID", nil)
			return
		}
		if err := st.SetAPIKeyQuota(c.Request.Context(), pid, kid, body.RPM); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.Problem(c, bun, 404, "NOT_FOUND", nil)
				return
			}
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		var actor *uuid.UUID
		if v, ok := c.Get(middleware.KeyUserUUID); ok {
			u := v.(uuid.UUID)
			actor = &u
		}
		_ = st.Audit(c.Request.Context(), &pid, actor, "apikey.quota", kid.String(), map[string]any{"rpm": body.RPM})
		c.JSON(200, gin.H{"id": kid, "quota_rpm": body.RPM})
	})

	v1.POST("/projects/:pid/members", middleware.RequirePermission("admin"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			Email string `json:"email"`
			Role  string `json:"role"`
		}
		if err := c.BindJSON(&body); err != nil || strings.TrimSpace(body.Email) == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if body.Role == "" {
			body.Role = "developer"
		}
		target, _, err := st.UserByEmail(c.Request.Context(), strings.TrimSpace(body.Email))
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Problem(c, bun, 404, "NOT_FOUND", nil)
			return
		}
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		owner, err := st.ProjectOwnerID(c.Request.Context(), pid)
		if err == nil && target.ID == owner {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if err := st.GrantProjectPermission(c.Request.Context(), pid, target.ID, body.Role, "project"); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		var uid *uuid.UUID
		if v, ok := c.Get(middleware.KeyUserUUID); ok {
			u := v.(uuid.UUID)
			uid = &u
		}
		_ = st.Audit(c.Request.Context(), &pid, uid, "member.grant", body.Email, map[string]any{"role": body.Role, "user_id": target.ID})
		c.JSON(201, gin.H{"user_id": target.ID, "role": body.Role})
	})

	v1.POST("/projects/:pid/functions", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			Name string `json:"name"`
		}
		if err := c.BindJSON(&body); err != nil || body.Name == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		var by *uuid.UUID
		if v, ok := c.Get(middleware.KeyUserUUID); ok {
			u := v.(uuid.UUID)
			by = &u
		}
		f, err := st.InsertFunction(c.Request.Context(), pid, body.Name, by)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		c.JSON(201, gin.H{"fn_id": f.ID, "name": f.Name})
	})

	v1.POST("/projects/:pid/functions/:fid/artifacts/presign", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, _ := uuid.Parse(c.Param("fid"))
		fn, err := st.FunctionByID(c.Request.Context(), fid)
		if err != nil || fn.ProjectID != pid {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		pv, err := st.ProjectByID(c.Request.Context(), pid)
		if err != nil || pv.MinioBucket == nil || strings.TrimSpace(pv.ProvisionStatus) != "ready" {
			httpx.Problem(c, bun, 400, "PROVISIONING_PENDING", nil)
			return
		}
		var body struct {
			Version string `json:"version"`
			Expires int    `json:"expires"`
		}
		if err := c.BindJSON(&body); err != nil || body.Version == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		key := "artifacts/" + pid.String() + "/" + fid.String() + "/" + strings.TrimSpace(body.Version) + ".tar.gz"
		if err := miniox.ValidateObjectKey(key); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "key", Message: bun.AsLocaleMsg("OBJECT_KEY_INVALID")}})
			return
		}
		ex := time.Duration(body.Expires) * time.Second
		if ex <= 0 {
			ex = time.Hour
		}
		url, err := miniox.PresignPut(c.Request.Context(), cfg, *pv.MinioBucket, key, ex)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"upload_url": url, "method": "PUT", "bucket": *pv.MinioBucket, "artifact_key": key})
	})

	v1.POST("/projects/:pid/functions/:fid/versions", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, _ := uuid.Parse(c.Param("fid"))
		fn, err := st.FunctionByID(c.Request.Context(), fid)
		if err != nil || fn.ProjectID != pid {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		var body struct {
			Version     string `json:"version"`
			URI         string `json:"source_uri"`
			Runtime     string `json:"runtime"`
			Sum         string `json:"checksum"`
			ArtifactKey string `json:"artifact_key"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if body.Version == "" {
			body.Version = "v1"
		}
		key := strings.TrimSpace(body.ArtifactKey)
		if body.URI == "" {
			body.URI = "minio://" + key
			if strings.TrimPrefix(body.URI, "minio://") == "" {
				body.URI = "minio://artifact/" + fid.String() + "/" + body.Version + ".tar.gz"
			}
		}
		if key != "" && !strings.Contains(body.URI, key) && strings.HasPrefix(body.URI, "minio://") {
			body.URI = "minio://" + key
		}
		if body.Runtime == "" {
			body.Runtime = "go"
		}
		if body.Sum == "" {
			body.Sum = "sha256:unknown"
		}
		v, err := st.InsertVersionQueued(c.Request.Context(), fid, body.Version, body.URI, body.Runtime, body.Sum)
		if err != nil {
			var pe *pgconn.PgError
			if errors.As(err, &pe) && pe.Code == "23505" {
				httpx.Problem(c, bun, 409, "VERSION_IMMUTABLE", nil)
				return
			}
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		bj, er := st.InsertBuildJob(c.Request.Context(), v.ID, key)
		if er != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		go simulateBuild(context.Background(), st, v.ID, bj.ID)
		c.JSON(201, gin.H{"version_id": v.ID, "version": v.Version, "build_job_id": bj.ID, "build_status": "queued"})
	})

	v1.GET("/projects/:pid/functions/:fid/versions/:vid/build", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, _ := uuid.Parse(c.Param("fid"))
		fn, err := st.FunctionByID(c.Request.Context(), fid)
		if err != nil || fn.ProjectID != pid {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		vid, err := uuid.Parse(c.Param("vid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		ppid, fid2, ver, rt, chk, bs, uri, er := st.FunctionVersionSummary(c.Request.Context(), vid)
		if er != nil || ppid != pid || fid2 != fid {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		bj, _ := st.LatestBuildJobForVersion(c.Request.Context(), vid)
		c.JSON(200, gin.H{
			"version_id":   vid,
			"version":      ver,
			"runtime":      rt,
			"checksum":     chk,
			"build_status": bs,
			"source_uri":   uri,
			"build_job_id": bj.ID,
			"job_status":   bj.Status,
			"job_log":      bj.Log,
		})
	})

	v1.POST("/projects/:pid/functions/:fid/deploy", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, _ := uuid.Parse(c.Param("fid"))
		fn, err := st.FunctionByID(c.Request.Context(), fid)
		if err != nil || fn.ProjectID != pid {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		var body struct {
			Version string `json:"version"`
			Region  string `json:"region"`
		}
		_ = c.BindJSON(&body)
		if body.Version == "" && fn.CurrentVersion != nil {
			body.Version = *fn.CurrentVersion
		}
		if body.Version == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		var vid uuid.UUID
		var bstat string
		if err := st.Pool().QueryRow(c.Request.Context(),
			`SELECT id, build_status FROM function_versions WHERE fn_id=$1 AND version=$2`, fid, body.Version).Scan(&vid, &bstat); err != nil {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		if strings.ToLower(strings.TrimSpace(bstat)) != "complete" {
			httpx.Problem(c, bun, 409, "BUILD_PENDING", []apierr.FieldErr{{Field: "build_status", Message: bun.AsLocaleMsg("FIELD_BUILD_NOT_READY")}})
			return
		}
		if body.Region == "" {
			body.Region = "default"
		}
		d, err := st.InsertDeployment(c.Request.Context(), vid, body.Region)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		pp, err := st.ProjectByID(c.Request.Context(), pid)
		if err != nil || pp.MinioBucket == nil {
			httpx.Problem(c, bun, 400, "PROVISIONING_PENDING", nil)
			return
		}
		dbURL, err := tenantdb.ConnectionURL(c.Request.Context(), cfg, st, pid)
		if err != nil {
			httpx.Problem(c, bun, 400, "PROVISIONING_PENDING", nil)
			return
		}
		pid2, fn2, sv, er := st.DeploymentArtifacts(c.Request.Context(), d.ID)
		if er != nil || pid2 != pid || fn2 != fid {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		dpEnv := map[string]string{
			"TENANT_DATABASE_URL": dbURL,
			"MINIO_ENDPOINT":      cfg.MinioEndpoint,
			"MINIO_BUCKET":        *pp.MinioBucket,
			"TENANT_MINIO_BUCKET": *pp.MinioBucket,
			"MINIO_USE_SSL":       strconv.FormatBool(cfg.MinioUseSSL),
		}
		artKey := strings.TrimPrefix(strings.TrimPrefix(sv.SourceURI, "minio://"), "/")
		if err := dp.Deploy(c.Request.Context(), datalane.DeployPayload{
			DeploymentID: d.ID.String(),
			TenantEnv:    dpEnv,
			Runtime:      sv.Runtime,
			ArtifactKey:  artKey,
			Checksum:     sv.Checksum,
		}); err != nil {
			_ = st.MarkDeploymentFailed(c.Request.Context(), d.ID, err.Error())
			_ = st.AppendFunctionLog(c.Request.Context(), &pid, &d.ID, "error", "dataplane deploy failed")
			httpx.Problem(c, bun, 502, "GATEWAY_ERROR", nil)
			return
		}
		_ = st.AppendFunctionLog(c.Request.Context(), &pid, &d.ID, "info", "deployment active (+ dataplane)")
		c.JSON(200, gin.H{"deployment_id": d.ID, "status": d.Status})
	})

	v1.POST("/projects/:pid/functions/:fid/deployments/rollback", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, _ := uuid.Parse(c.Param("fid"))
		fn, err := st.FunctionByID(c.Request.Context(), fid)
		if err != nil || fn.ProjectID != pid {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		active, err := st.RollbackFunctionDeployment(c.Request.Context(), pid, fid)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		_ = st.AppendFunctionLog(c.Request.Context(), &pid, &active.ID, "info", "rollback applied")
		c.JSON(200, gin.H{"deployment_id": active.ID, "status": active.Status})
	})

	v1.POST("/projects/:pid/functions/:fid/invoke", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, _ := uuid.Parse(c.Param("fid"))
		fn, err := st.FunctionByID(c.Request.Context(), fid)
		if err != nil || fn.ProjectID != pid {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		var body struct {
			Input map[string]any `json:"input"`
		}
		_ = c.BindJSON(&body)
		ip := datalane.InvokePayload{Input: body.Input}
		if drow, er := st.LatestActiveDeploymentForFunction(c.Request.Context(), fid); er == nil {
			ip.DeploymentID = drow.ID.String()
			pp, er2 := st.ProjectByID(c.Request.Context(), pid)
			dbURL, er3 := tenantdb.ConnectionURL(c.Request.Context(), cfg, st, pid)
			if er2 == nil && pp.MinioBucket != nil && er3 == nil {
				_, _, sv, er4 := st.DeploymentArtifacts(c.Request.Context(), drow.ID)
				if er4 == nil {
					ip.TenantEnv = map[string]string{
						"TENANT_DATABASE_URL": dbURL,
						"MINIO_ENDPOINT":      cfg.MinioEndpoint,
						"MINIO_BUCKET":        *pp.MinioBucket,
						"TENANT_MINIO_BUCKET": *pp.MinioBucket,
						"MINIO_USE_SSL":       strconv.FormatBool(cfg.MinioUseSSL),
					}
					ip.Runtime = sv.Runtime
					ip.Checksum = sv.Checksum
					ip.ArtifactKey = strings.TrimPrefix(strings.TrimPrefix(sv.SourceURI, "minio://"), "/")
				}
			}
		}
		invStart := time.Now()
		out, err := dp.Invoke(c.Request.Context(), ip)
		result := "ok"
		if err != nil {
			result = "error"
			metrics.RecordInvocation(pid.String(), fn.Name, result, time.Since(invStart))
			httpx.Problem(c, bun, 502, "GATEWAY_ERROR", nil)
			return
		}
		metrics.RecordInvocation(pid.String(), fn.Name, result, time.Since(invStart))
		c.JSON(200, gin.H{"status": out.Status, "output": out.Output})
	})

	v1.POST("/projects/:pid/db/migrate", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			SQL string `json:"sql"`
		}
		if err := c.BindJSON(&body); err != nil || strings.TrimSpace(body.SQL) == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if _, err := tenantddl.ValidateMigrateSQL(body.SQL); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "sql", Message: bun.AsLocaleMsg("SQL_EXECUTION_FAILED")}})
			return
		}
		if err := tenantdb.MigrateStatements(c.Request.Context(), cfg, st, pid, body.SQL); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "sql", Message: bun.AsLocaleMsg("SQL_EXECUTION_FAILED")}})
			return
		}
		c.JSON(200, gin.H{"applied": true})
	})

	v1.POST("/projects/:pid/db/query", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			SQL     string `json:"sql"`
			Params  []any  `json:"params"`
			Explain bool   `json:"explain"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if body.Explain {
			explain, er := tenantdb.ExplainAnalyzeJSON(c.Request.Context(), cfg, st, pid, body.SQL, body.Params)
			if er != nil {
				httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "sql", Message: bun.AsLocaleMsg("SQL_EXECUTION_FAILED")}})
				return
			}
			deployIDQuery := strings.TrimSpace(c.Query("deployment_id"))
			var depUUID *uuid.UUID
			if deployIDQuery != "" {
				if u, parseErr := uuid.Parse(deployIDQuery); parseErr == nil {
					depUUID = &u
				}
			}
			_ = st.AppendFunctionLogExplain(c.Request.Context(), &pid, depUUID, "info", "explain profile", explain)
			c.JSON(200, gin.H{"explain": explain})
			return
		}
		rows, tag, err := tenantdb.Query(c.Request.Context(), cfg, st, pid, body.SQL, body.Params)
		if err != nil {
			metrics.RecordDBQuery(pid.String(), "error")
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "sql", Message: bun.AsLocaleMsg("SQL_EXECUTION_FAILED")}})
			return
		}
		metrics.RecordDBQuery(pid.String(), "ok")
		if rows != nil {
			c.JSON(200, gin.H{"rows": rows})
			return
		}
		c.JSON(200, gin.H{"result": tag.String()})
	})

	v1.POST("/projects/:pid/storage/upload", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		p, err := st.ProjectByID(c.Request.Context(), pid)
		if err != nil || p.MinioBucket == nil {
			httpx.Problem(c, bun, 400, "PROVISIONING_PENDING", nil)
			return
		}
		var body struct {
			Key     string `json:"key"`
			Expires int    `json:"expires"`
		}
		if err := c.BindJSON(&body); err != nil || body.Key == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		ex := time.Duration(body.Expires) * time.Second
		if ex <= 0 {
			ex = time.Hour
		}
		if err := miniox.ValidateObjectKey(body.Key); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "key", Message: bun.AsLocaleMsg("OBJECT_KEY_INVALID")}})
			return
		}
		url, err := miniox.PresignPut(c.Request.Context(), cfg, *p.MinioBucket, body.Key, ex)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		_ = st.UpsertObject(c.Request.Context(), pid, *p.MinioBucket, body.Key, 0, "")
		c.JSON(200, gin.H{"upload_url": url, "method": "PUT", "bucket": *p.MinioBucket})
	})

	v1.POST("/projects/:pid/storage/download", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		p, err := st.ProjectByID(c.Request.Context(), pid)
		if err != nil || p.MinioBucket == nil {
			httpx.Problem(c, bun, 400, "PROVISIONING_PENDING", nil)
			return
		}
		var body struct {
			Key     string `json:"key"`
			Expires int    `json:"expires"`
		}
		if err := c.BindJSON(&body); err != nil || body.Key == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		ex := time.Duration(body.Expires) * time.Second
		if ex <= 0 {
			ex = time.Hour
		}
		if err := miniox.ValidateObjectKey(body.Key); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "key", Message: bun.AsLocaleMsg("OBJECT_KEY_INVALID")}})
			return
		}
		url, err := miniox.PresignGet(c.Request.Context(), cfg, *p.MinioBucket, body.Key, ex)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"download_url": url, "method": "GET", "bucket": *p.MinioBucket})
	})

	v1.POST("/projects/:pid/triggers", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			Type   string         `json:"type"`
			Target string         `json:"target_fn"`
			Config map[string]any `json:"config"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		tid, err := uuid.Parse(body.Target)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		tr, err := st.InsertTrigger(c.Request.Context(), pid, body.Type, tid, body.Config)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		payload := map[string]any{"trigger_id": tr.ID.String(), "project_id": pid.String()}
		if nbus != nil {
			_ = nbus.PublishTriggerDispatch(c.Request.Context(), payload)
		}
		c.JSON(201, gin.H{"trigger_id": tr.ID, "status": "active"})
	})

	v1.POST("/projects/:pid/triggers/:tid/test-fire", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		tid, err := uuid.Parse(c.Param("tid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "TRIGGER_ID_INVALID", nil)
			return
		}
		payload := map[string]any{"trigger_id": tid.String(), "project_id": pid.String(), "manual": true}
		if nbus != nil {
			_ = nbus.PublishTriggerDispatch(c.Request.Context(), payload)
		}
		hub.Broadcast(pid, "triggers", payload)
		c.JSON(202, gin.H{"queued": true})
	})

	v1.GET("/projects/:pid/triggers/dlq", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		rows, err := st.ListTriggerDLQ(c.Request.Context(), pid, 100)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"events": rows})
	})

	v1.PATCH("/projects/:pid/settings/data-allowlist", middleware.RequirePermission("admin"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			Tables []string `json:"tables"`
		}
		if err := c.BindJSON(&body); err != nil || len(body.Tables) == 0 {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		b, err := json.Marshal(body.Tables)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if err := st.PatchProjectSettingsAllowlistJSON(c.Request.Context(), pid, b); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"tables": body.Tables})
	})

	v1.GET("/projects/:pid/data/tables/:table/rows", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		name := c.Param("table")
		ps, err := st.SettingsForProject(c.Request.Context(), pid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		n, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
		rows, err := tenantdb.SelectAllowedTable(c.Request.Context(), cfg, st, pid, name, ps.TableAllowlist, n)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "table", Message: bun.AsLocaleMsg("TABLE_ACCESS_DENIED")}})
			return
		}
		c.JSON(200, gin.H{"rows": rows})
	})

	v1.POST("/projects/:pid/settings/tenant-secrets", middleware.RequirePermission("admin"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		raw, err := c.GetRawData()
		if err != nil || len(raw) == 0 {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		ct, nonce, err := secrets.EncryptOptional(cfg.TenantSecretKey, raw)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		if len(ct) == 0 {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "key", Message: bun.AsLocaleMsg("TENANT_SECRET_KEY_REQUIRED")}})
			return
		}
		if err := st.PersistTenantSecretsEnvelope(c.Request.Context(), pid, ct, nonce); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"stored": true})
	})

	v1.GET("/projects/:pid/realtime/ws", middleware.RequirePermission("viewer"), realtime.HandleWS(hub))
	v1.GET("/projects/:pid/realtime/sse", middleware.RequirePermission("viewer"), realtime.HandleSSE(hub))

	v1.POST("/projects/:pid/transform", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			Rows       []map[string]any `json:"rows"`
			MapFields  []string         `json:"map"`
			FilterExpr string           `json:"filter"`
			ReduceSum  string           `json:"reduce_sum_field"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		var out []map[string]any
		for _, row := range body.Rows {
			if ok, ferr := dsl.FilterNumeric(row, body.FilterExpr); ferr != nil {
				httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
				return
			} else if ok {
				out = append(out, dsl.MapRow(row, body.MapFields))
			}
		}
		resp := gin.H{"project_id": pid, "mapped": out}
		if body.ReduceSum != "" {
			resp["sum"] = dsl.ReduceSum(out, body.ReduceSum)
		}
		c.JSON(200, resp)
	})

	v1.GET("/projects/:pid/observability/logs", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
		var depUUID *uuid.UUID
		if dq := strings.TrimSpace(c.Query("deployment_id")); dq != "" {
			if u, err := uuid.Parse(dq); err == nil {
				depUUID = &u
			}
		}
		var fromT, toT *time.Time
		if fq := strings.TrimSpace(c.Query("from")); fq != "" {
			if ts, er := time.Parse(time.RFC3339, fq); er == nil {
				fromT = &ts
			}
		}
		if tq := strings.TrimSpace(c.Query("to")); tq != "" {
			if ts, er := time.Parse(time.RFC3339, tq); er == nil {
				toT = &ts
			}
		}
		rows, err := st.LogsForProjectFiltered(c.Request.Context(), pid, depUUID, fromT, toT, int32(limit))
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"logs": rows})
	})

	v1.GET("/projects/:pid/audit", middleware.RequirePermission("admin"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		rows, err := st.AuditList(c.Request.Context(), pid, 100)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"events": rows})
	})

	v1.GET("/projects/:pid/graphql/schema", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		sdl, err := graphqlapi.ProjectSDL(c.Request.Context(), cfg, st, pid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{
			"project_id": pid,
			"schema":     sdl,
			"engine":     "graphql-go",
		})
	})

	v1.POST("/projects/:pid/graphql", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			Query string `json:"query"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if strings.TrimSpace(body.Query) == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "query", Message: bun.AsLocaleMsg("GRAPHQL_QUERY_REQUIRED")}})
			return
		}
		schema, err := graphqlapi.ProjectSchema(c.Request.Context(), cfg, st, pid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		r := graphqlapi.Execute(schema, body.Query)
		raw, err := graphqlapi.ResultJSON(r)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.Data(200, "application/json", raw)
	})

	v1.POST("/projects/:pid/wasm/preview", middleware.RequirePermission("developer"), func(c *gin.Context) {
		httpx.Problem(c, bun, http.StatusNotImplemented, "WASM_PHASE2", nil)
	})

	mp := v1.Group("/marketplace", middleware.RequireJWT(cfg, bun))
	mp.POST("/packages", func(c *gin.Context) {
		uid := c.MustGet(middleware.KeyUserUUID).(uuid.UUID)
		var body struct {
			Slug    string `json:"slug"`
			Title   string `json:"title"`
			Desc    string `json:"description"`
			Visible string `json:"visibility"`
		}
		if err := c.BindJSON(&body); err != nil || body.Slug == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if body.Visible == "" {
			body.Visible = "public"
		}
		p, err := st.UpsertMarketplacePackage(c.Request.Context(), uid, body.Slug, body.Title, body.Desc, body.Visible)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(201, gin.H{"id": p.ID, "slug": p.Slug, "title": p.Title})
	})
	mp.GET("/packages", func(c *gin.Context) {
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
		rows, err := st.ListMarketplacePackages(c.Request.Context(), int32(limit), int32(offset))
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		out := make([]gin.H, 0, len(rows))
		for _, p := range rows {
			out = append(out, gin.H{"id": p.ID, "slug": p.Slug, "title": p.Title, "latest_version": p.Version})
		}
		c.JSON(200, gin.H{"packages": out})
	})
	mp.GET("/packages/:slug", func(c *gin.Context) {
		p, err := st.MarketplaceGet(c.Request.Context(), c.Param("slug"))
		if err != nil {
			httpx.Problem(c, bun, 404, "PACKAGE_NOT_FOUND", nil)
			return
		}
		c.JSON(200, gin.H{"id": p.ID, "slug": p.Slug, "title": p.Title, "version": p.Version})
	})
	mp.POST("/packages/:slug/versions", func(c *gin.Context) {
		uid := c.MustGet(middleware.KeyUserUUID).(uuid.UUID)
		pkg, err := st.MarketplaceGet(c.Request.Context(), c.Param("slug"))
		if err != nil {
			httpx.Problem(c, bun, 404, "PACKAGE_NOT_FOUND", nil)
			return
		}
		publisher, err := st.MarketplacePackagePublisher(c.Request.Context(), pkg.Slug)
		if err != nil || publisher != uid {
			httpx.Problem(c, bun, http.StatusForbidden, "FORBIDDEN", nil)
			return
		}
		var body struct {
			Version   string `json:"version"`
			SourceURI string `json:"source_uri"`
			Runtime   string `json:"runtime"`
			Checksum  string `json:"checksum"`
			Notes     string `json:"notes"`
		}
		if err := c.BindJSON(&body); err != nil || strings.TrimSpace(body.Version) == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if !store.ValidSemver(body.Version) {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "version", Message: bun.AsLocaleMsg("MARKETPLACE_VERSION_INVALID")}})
			return
		}
		row, er := st.InsertMarketplaceVersion(c.Request.Context(), pkg.ID, strings.TrimPrefix(body.Version, "v"), body.SourceURI, body.Runtime, body.Checksum, body.Notes)
		if er != nil {
			var pe *pgconn.PgError
			if errors.As(er, &pe) && pe.Code == "23505" {
				httpx.Problem(c, bun, 409, "MARKETPLACE_VERSION_EXISTS", nil)
				return
			}
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(201, gin.H{
			"id":         row.ID,
			"package":    pkg.Slug,
			"version":    row.Version,
			"runtime":    row.Runtime,
			"source_uri": row.SourceURI,
			"checksum":   row.Checksum,
			"notes":      row.Notes,
			"created_at": row.CreatedAt,
		})
	})
	mp.GET("/packages/:slug/versions", func(c *gin.Context) {
		pkg, err := st.MarketplaceGet(c.Request.Context(), c.Param("slug"))
		if err != nil {
			httpx.Problem(c, bun, 404, "PACKAGE_NOT_FOUND", nil)
			return
		}
		rows, er := st.ListMarketplaceVersions(c.Request.Context(), pkg.ID)
		if er != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		out := make([]gin.H, 0, len(rows))
		for _, r := range rows {
			out = append(out, gin.H{
				"version":    r.Version,
				"runtime":    r.Runtime,
				"source_uri": r.SourceURI,
				"checksum":   r.Checksum,
				"notes":      r.Notes,
				"created_at": r.CreatedAt,
			})
		}
		c.JSON(200, gin.H{"package": pkg.Slug, "versions": out})
	})
	mp.GET("/packages/:slug/versions/:version", func(c *gin.Context) {
		pkg, err := st.MarketplaceGet(c.Request.Context(), c.Param("slug"))
		if err != nil {
			httpx.Problem(c, bun, 404, "PACKAGE_NOT_FOUND", nil)
			return
		}
		r, er := st.MarketplaceVersionGet(c.Request.Context(), pkg.ID, c.Param("version"))
		if er != nil {
			httpx.Problem(c, bun, 404, "MARKETPLACE_VERSION_NOT_FOUND", nil)
			return
		}
		c.JSON(200, gin.H{
			"package":    pkg.Slug,
			"version":    r.Version,
			"runtime":    r.Runtime,
			"source_uri": r.SourceURI,
			"checksum":   r.Checksum,
			"notes":      r.Notes,
			"created_at": r.CreatedAt,
		})
	})

	v1.POST("/projects/:pid/marketplace/install", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			Slug    string `json:"slug"`
			Version string `json:"version"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		pkg, err := st.MarketplaceGet(c.Request.Context(), body.Slug)
		if err != nil {
			httpx.Problem(c, bun, 404, "PACKAGE_NOT_FOUND", nil)
			return
		}
		resolved, er := st.ResolveInstallVersion(c.Request.Context(), pkg.ID, body.Version)
		if er != nil {
			httpx.Problem(c, bun, 404, "MARKETPLACE_VERSION_NOT_FOUND", nil)
			return
		}
		if err := st.MarketplaceInstall(c.Request.Context(), pkg.ID, pid, resolved); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		var actor *uuid.UUID
		if v, ok := c.Get(middleware.KeyUserUUID); ok {
			u := v.(uuid.UUID)
			actor = &u
		}
		_ = st.AppendMarketplaceInstallLog(c.Request.Context(), pkg.ID, pid, resolved, actor)
		_ = st.Audit(c.Request.Context(), &pid, actor, "marketplace.install", pkg.Slug, map[string]any{"version": resolved})
		c.JSON(200, gin.H{"installed": true, "package": pkg.Slug, "version": resolved})
	})

	v1.POST("/projects/:pid/functions/:fid/entrypoint", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, err := uuid.Parse(c.Param("fid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		fn, err := st.FunctionByID(c.Request.Context(), fid)
		if err != nil || fn.ProjectID != pid {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		var body struct {
			AuthMode string `json:"auth_mode"`
			Enabled  *bool  `json:"enabled"`
		}
		_ = c.BindJSON(&body)
		mode := strings.ToLower(strings.TrimSpace(body.AuthMode))
		if mode == "" {
			mode = "project_key"
		}
		if mode != "public" && mode != "signed" && mode != "project_key" {
			httpx.Problem(c, bun, 400, "ENTRYPOINT_BAD_AUTH_MODE", nil)
			return
		}
		enabled := true
		if body.Enabled != nil {
			enabled = *body.Enabled
		}
		var token *string
		if mode == "signed" {
			t := strings.ReplaceAll(uuid.NewString(), "-", "") + strings.ReplaceAll(uuid.NewString(), "-", "")[:16]
			token = &t
		}
		row, er := st.UpsertFunctionEntrypoint(c.Request.Context(), pid, fid, mode, token, enabled)
		if er != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, entrypointJSON(row, fn, st, c.Request.Context(), cfg.PublicAPIBaseURL))
	})

	v1.GET("/projects/:pid/functions/:fid/entrypoint", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, err := uuid.Parse(c.Param("fid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		fn, err := st.FunctionByID(c.Request.Context(), fid)
		if err != nil || fn.ProjectID != pid {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		row, er := st.FunctionEntrypoint(c.Request.Context(), fid)
		if er != nil {
			httpx.Problem(c, bun, 404, "ENTRYPOINT_NOT_FOUND", nil)
			return
		}
		c.JSON(200, entrypointJSON(row, fn, st, c.Request.Context(), cfg.PublicAPIBaseURL))
	})

	admin := r.Group("/admin", middleware.RequireJWT(cfg, bun), middleware.RequirePlatformRole("staff"))
	admin.GET("/users", func(c *gin.Context) {
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
		rows, err := st.ListUsers(c.Request.Context(), int32(limit), int32(offset))
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		out := make([]gin.H, 0, len(rows))
		for _, u := range rows {
			out = append(out, gin.H{
				"id":            u.ID,
				"email":         u.Email,
				"role":          u.Role,
				"platform_role": u.PlatformRole,
				"created_at":    u.CreatedAt,
			})
		}
		c.JSON(200, gin.H{"users": out})
	})

	admin.PATCH("/users/:id", middleware.RequirePlatformRole("super_admin"), func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		var body struct {
			PlatformRole string `json:"platform_role"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		role := strings.ToLower(strings.TrimSpace(body.PlatformRole))
		if role != "super_admin" && role != "staff" && role != "user" {
			httpx.Problem(c, bun, 400, "ROLE_INVALID", nil)
			return
		}
		if err := st.UpdateUserPlatformRole(c.Request.Context(), id, role); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.Problem(c, bun, 404, "NOT_FOUND", nil)
				return
			}
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		actor := c.MustGet(middleware.KeyUserUUID).(uuid.UUID)
		_ = st.Audit(c.Request.Context(), nil, &actor, "platform.user.role_update", id.String(), map[string]any{"platform_role": role})
		c.JSON(200, gin.H{"id": id, "platform_role": role})
	})

	admin.GET("/projects", func(c *gin.Context) {
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
		rows, err := st.ListProjectsAll(c.Request.Context(), int32(limit), int32(offset))
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		out := make([]gin.H, 0, len(rows))
		for _, p := range rows {
			out = append(out, projectJSON(p))
		}
		c.JSON(200, gin.H{"projects": out})
	})

	admin.POST("/projects/:pid/disable", func(c *gin.Context) {
		pid, err := uuid.Parse(c.Param("pid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if err := st.SetProjectDisabled(c.Request.Context(), pid, true); err != nil {
			httpx.Problem(c, bun, 404, "PROJECT_NOT_FOUND", nil)
			return
		}
		actor := c.MustGet(middleware.KeyUserUUID).(uuid.UUID)
		_ = st.Audit(c.Request.Context(), &pid, &actor, "platform.project.disable", pid.String(), nil)
		c.JSON(200, gin.H{"id": pid, "disabled": true})
	})

	admin.POST("/projects/:pid/enable", func(c *gin.Context) {
		pid, err := uuid.Parse(c.Param("pid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if err := st.SetProjectDisabled(c.Request.Context(), pid, false); err != nil {
			httpx.Problem(c, bun, 404, "PROJECT_NOT_FOUND", nil)
			return
		}
		actor := c.MustGet(middleware.KeyUserUUID).(uuid.UUID)
		_ = st.Audit(c.Request.Context(), &pid, &actor, "platform.project.enable", pid.String(), nil)
		c.JSON(200, gin.H{"id": pid, "disabled": false})
	})

	v1.POST("/projects/:pid/cdc/subscriptions", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			FunctionID string `json:"function_id"`
			Table      string `json:"table"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		fid, err := uuid.Parse(body.FunctionID)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "function_id", Message: bun.AsLocaleMsg("VALIDATION_ERROR")}})
			return
		}
		fn, err := st.FunctionByID(c.Request.Context(), fid)
		if err != nil || fn.ProjectID != pid {
			httpx.Problem(c, bun, 404, "CDC_FUNCTION_NOT_FOUND", nil)
			return
		}
		table := strings.TrimSpace(body.Table)
		if err := cdcMgr.InstallTriggerForTable(c.Request.Context(), pid, table); err != nil {
			if errors.Is(err, store.ErrCDCInvalidTable) {
				httpx.Problem(c, bun, 400, "CDC_TABLE_INVALID", nil)
				return
			}
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "table", Message: bun.AsLocaleMsg("SQL_EXECUTION_FAILED")}})
			return
		}
		row, er := st.InsertCDCSubscription(c.Request.Context(), pid, fid, table)
		if er != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		cdcMgr.Ensure(pid)
		c.JSON(201, gin.H{"id": row.ID, "function_id": row.FunctionID, "table": row.Table, "channel": row.Channel, "created_at": row.CreatedAt})
	})

	v1.GET("/projects/:pid/cdc/subscriptions", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		rows, err := st.ListCDCSubscriptions(c.Request.Context(), pid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		out := make([]gin.H, 0, len(rows))
		for _, r := range rows {
			out = append(out, gin.H{"id": r.ID, "function_id": r.FunctionID, "table": r.Table, "channel": r.Channel, "created_at": r.CreatedAt})
		}
		c.JSON(200, gin.H{"subscriptions": out})
	})

	v1.DELETE("/projects/:pid/cdc/subscriptions/:id", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if err := st.DeleteCDCSubscription(c.Request.Context(), pid, id); err != nil {
			httpx.Problem(c, bun, 404, "NOT_FOUND", nil)
			return
		}
		remaining, _ := st.ListCDCSubscriptions(c.Request.Context(), pid)
		if len(remaining) == 0 {
			cdcMgr.Stop(pid)
		}
		c.JSON(200, gin.H{"deleted": true})
	})

	r.Any("/fn/:project_slug/:fn_slug", publicEntrypointHandler(cfg, st, dp, hub, bun))
	r.Any("/fn/:project_slug/:fn_slug/*subpath", publicEntrypointHandler(cfg, st, dp, hub, bun))

	// Embedded SPA: serves the React UI from `internal/webui/dist`. Asset
	// requests are matched first; any unknown non-API path falls back to the
	// SPA's index.html so client-side routes (`/login`, `/app/...`) work on
	// hard refresh. API-shaped paths are still returned as 404 Problem JSON.
	webHandler := webui.Handler()
	r.GET("/", gin.WrapH(webHandler))
	r.GET("/assets/*filepath", gin.WrapH(webHandler))
	r.GET("/favicon.svg", gin.WrapH(webHandler))
	r.GET("/favicon.ico", gin.WrapH(webHandler))
	r.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path
		if c.Request.Method == http.MethodGet &&
			!strings.HasPrefix(p, "/v1/") &&
			!strings.HasPrefix(p, "/auth/") &&
			!strings.HasPrefix(p, "/admin/") &&
			!strings.HasPrefix(p, "/fn/") &&
			!strings.HasPrefix(p, "/internal/") &&
			p != "/healthz" && p != "/readyz" && p != "/metrics" && p != "/openapi.yaml" {
			webHandler.ServeHTTP(c.Writer, c.Request)
			return
		}
		httpx.Problem(c, bun, http.StatusNotFound, "NOT_FOUND", nil)
	})

	slog.Info("api", "addr", cfg.HTTPAddr)
	if err := r.Run(cfg.HTTPAddr); err != nil {
		slog.Error("http", "err", err)
		os.Exit(1)
	}
}

func projectJSON(p store.Project) gin.H {
	out := gin.H{
		"id":               p.ID,
		"name":             p.Name,
		"owner_id":         p.OwnerID,
		"region":           p.Region,
		"provision_status": p.ProvisionStatus,
		"disabled":         p.Disabled,
		"created_at":       p.CreatedAt,
	}
	if p.Slug != nil {
		out["slug"] = *p.Slug
	} else {
		out["slug"] = nil
	}
	if p.TenantDBName != nil {
		out["tenant_db_name"] = *p.TenantDBName
	} else {
		out["tenant_db_name"] = nil
	}
	if p.MinioBucket != nil {
		out["minio_bucket"] = *p.MinioBucket
	} else {
		out["minio_bucket"] = nil
	}
	if p.ProvisionError != nil {
		out["provision_error"] = *p.ProvisionError
	} else {
		out["provision_error"] = nil
	}
	return out
}

func entrypointJSON(row store.FunctionEntrypointRow, fn store.FunctionRow, st *store.Store, ctx context.Context, base string) gin.H {
	out := gin.H{
		"id":         row.ID,
		"function":   fn.Name,
		"auth_mode":  row.AuthMode,
		"enabled":    row.Enabled,
		"created_at": row.CreatedAt,
		"updated_at": row.UpdatedAt,
	}
	if row.SecretToken != nil && row.AuthMode == "signed" {
		out["secret_token"] = *row.SecretToken
	}
	if p, err := st.ProjectByID(ctx, row.ProjectID); err == nil && p.Slug != nil && fn.Slug != nil {
		out["public_url"] = strings.TrimRight(base, "/") + "/fn/" + *p.Slug + "/" + *fn.Slug
		out["project_slug"] = *p.Slug
		out["function_slug"] = *fn.Slug
	}
	return out
}

func publicEntrypointHandler(cfg config.Config, st *store.Store, dp *datalane.Client, hub *realtime.Hub, bun *i18n.Bundle) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectSlug := strings.ToLower(strings.TrimSpace(c.Param("project_slug")))
		fnSlug := strings.ToLower(strings.TrimSpace(c.Param("fn_slug")))
		if projectSlug == "" || fnSlug == "" {
			httpx.Problem(c, bun, 404, "ENTRYPOINT_NOT_FOUND", nil)
			return
		}
		p, err := st.ProjectBySlug(c.Request.Context(), projectSlug)
		if err != nil {
			httpx.Problem(c, bun, 404, "ENTRYPOINT_NOT_FOUND", nil)
			return
		}
		if p.Disabled {
			httpx.Problem(c, bun, http.StatusForbidden, "PROJECT_DISABLED", nil)
			return
		}
		fn, err := st.FunctionByProjectSlug(c.Request.Context(), p.ID, fnSlug)
		if err != nil {
			httpx.Problem(c, bun, 404, "ENTRYPOINT_NOT_FOUND", nil)
			return
		}
		ep, err := st.FunctionEntrypoint(c.Request.Context(), fn.ID)
		if err != nil {
			httpx.Problem(c, bun, 404, "ENTRYPOINT_NOT_FOUND", nil)
			return
		}
		if !ep.Enabled {
			httpx.Problem(c, bun, http.StatusForbidden, "ENTRYPOINT_DISABLED", nil)
			return
		}
		switch ep.AuthMode {
		case "public":
		case "signed":
			if ep.SecretToken == nil {
				httpx.Problem(c, bun, http.StatusUnauthorized, "ENTRYPOINT_AUTH_REQUIRED", nil)
				return
			}
			if sigHeader := strings.TrimSpace(c.GetHeader(sigwebhook.Header)); sigHeader != "" {
				bodyBytes, _ := c.GetRawData()
				skew := time.Duration(cfg.WebhookMaxSkewSeconds) * time.Second
				if err := sigwebhook.Verify(*ep.SecretToken, sigHeader, bodyBytes, time.Now(), skew); err != nil {
					if errors.Is(err, sigwebhook.ErrSignatureExpired) {
						httpx.Problem(c, bun, http.StatusUnauthorized, "WEBHOOK_SIGNATURE_EXPIRED", nil)
						return
					}
					httpx.Problem(c, bun, http.StatusUnauthorized, "WEBHOOK_SIGNATURE_INVALID", nil)
					return
				}
				c.Request.Body = newBodyReader(bodyBytes)
			} else {
				provided := strings.TrimSpace(c.GetHeader("X-Entrypoint-Token"))
				if provided == "" {
					provided = strings.TrimSpace(c.Query("token"))
				}
				if provided == "" || provided != *ep.SecretToken {
					httpx.Problem(c, bun, http.StatusUnauthorized, "ENTRYPOINT_AUTH_REQUIRED", nil)
					return
				}
			}
		case "project_key":
			authz := strings.TrimSpace(c.GetHeader("Authorization"))
			tok := strings.TrimSpace(strings.TrimPrefix(authz, "Bearer "))
			if !strings.HasPrefix(tok, "sk_") {
				httpx.Problem(c, bun, http.StatusUnauthorized, "ENTRYPOINT_AUTH_REQUIRED", nil)
				return
			}
			rec, er := st.ResolveAPIKey(c.Request.Context(), tok)
			if er != nil || rec.ProjectID != p.ID {
				httpx.Problem(c, bun, http.StatusUnauthorized, "ENTRYPOINT_AUTH_REQUIRED", nil)
				return
			}
		default:
			httpx.Problem(c, bun, http.StatusForbidden, "ENTRYPOINT_DISABLED", nil)
			return
		}

		var input map[string]any
		if c.Request.ContentLength > 0 {
			_ = c.ShouldBindJSON(&input)
		}
		ip := datalane.InvokePayload{Input: input}
		if drow, er := st.LatestActiveDeploymentForFunction(c.Request.Context(), fn.ID); er == nil {
			ip.DeploymentID = drow.ID.String()
			pp, er2 := st.ProjectByID(c.Request.Context(), p.ID)
			dbURL, er3 := tenantdb.ConnectionURL(c.Request.Context(), cfg, st, p.ID)
			if er2 == nil && pp.MinioBucket != nil && er3 == nil {
				_, _, sv, er4 := st.DeploymentArtifacts(c.Request.Context(), drow.ID)
				if er4 == nil {
					ip.TenantEnv = map[string]string{
						"TENANT_DATABASE_URL": dbURL,
						"MINIO_ENDPOINT":      cfg.MinioEndpoint,
						"MINIO_BUCKET":        *pp.MinioBucket,
						"TENANT_MINIO_BUCKET": *pp.MinioBucket,
						"MINIO_USE_SSL":       strconv.FormatBool(cfg.MinioUseSSL),
					}
					ip.Runtime = sv.Runtime
					ip.Checksum = sv.Checksum
					ip.ArtifactKey = strings.TrimPrefix(strings.TrimPrefix(sv.SourceURI, "minio://"), "/")
				}
			}
		}
		invStart := time.Now()
		out, err := dp.Invoke(c.Request.Context(), ip)
		result := "ok"
		if err != nil {
			result = "error"
			metrics.RecordInvocation(p.ID.String(), fn.Name, result, time.Since(invStart))
			httpx.Problem(c, bun, 502, "GATEWAY_ERROR", nil)
			return
		}
		metrics.RecordInvocation(p.ID.String(), fn.Name, result, time.Since(invStart))
		hub.Broadcast(p.ID, "entrypoint", gin.H{"function": fn.Name, "status": out.Status})
		c.JSON(200, gin.H{"status": out.Status, "output": out.Output})
	}
}

func simulateBuild(bg context.Context, st *store.Store, vid, jobID uuid.UUID) {
	_ = st.AppendBuildJobLine(bg, jobID, "[build] queued")
	time.Sleep(450 * time.Millisecond)
	_ = st.AppendBuildJobLine(bg, jobID, "[build] stub validation ok")
	_ = st.UpdateVersionBuildStatus(bg, vid, "complete")
	_ = st.FinishBuildJob(bg, jobID, "succeeded", "simulated pipeline finished")
}

func newBodyReader(b []byte) io.ReadCloser {
	return io.NopCloser(bytes.NewReader(b))
}

func parseMinioWebhook(root map[string]any) (bucket, key string) {
	if recs, ok := root["Records"].([]any); ok && len(recs) > 0 {
		if r0, ok := recs[0].(map[string]any); ok {
			if s3, ok := r0["s3"].(map[string]any); ok {
				if b, ok := s3["bucket"].(map[string]any); ok {
					if n, ok := b["name"].(string); ok {
						bucket = n
					}
				}
				if o, ok := s3["object"].(map[string]any); ok {
					if k, ok := o["key"].(string); ok {
						key = k
					}
				}
			}
		}
	}
	if bucket == "" {
		if s, ok := root["bucket"].(string); ok {
			bucket = s
		}
	}
	if key == "" {
		if s, ok := root["key"].(string); ok {
			key = s
		}
	}
	return bucket, key
}

func cronTicker(bg context.Context, st *store.Store, nbus *natsbus.Bus, last *sync.Map) {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-bg.Done():
			return
		case <-t.C:
			if nbus == nil {
				continue
			}
			items, err := st.ListTriggersByTypeAll(context.Background(), "cron")
			if err != nil {
				continue
			}
			for _, tr := range items {
				sec := int64(60)
				if v, ok := tr.Config["every_seconds"]; ok {
					if f, ok2 := v.(float64); ok2 {
						sec = int64(f)
					}
				}
				if sec < 10 {
					sec = 10
				}
				key := tr.ID.String()
				if raw, ok := last.Load(key); ok {
					if time.Since(raw.(time.Time)) < time.Duration(sec)*time.Second {
						continue
					}
				}
				payload := map[string]any{"trigger_id": tr.ID.String(), "project_id": tr.ProjectID.String(), "cron": true}
				_ = nbus.PublishTriggerDispatch(context.Background(), payload)
				last.Store(key, time.Now())
			}
		}
	}
}

func dbPollTicker(bg context.Context, st *store.Store, nbus *natsbus.Bus, last *sync.Map) {
	t := time.NewTicker(45 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-bg.Done():
			return
		case <-t.C:
			if nbus == nil {
				continue
			}
			items, err := st.ListTriggersByTypeAll(context.Background(), "db_poll")
			if err != nil {
				continue
			}
			for _, tr := range items {
				sec := int64(120)
				if v, ok := tr.Config["poll_seconds"]; ok {
					if f, ok2 := v.(float64); ok2 {
						sec = int64(f)
					}
				}
				if sec < 30 {
					sec = 30
				}
				key := "db:" + tr.ID.String()
				if raw, ok := last.Load(key); ok {
					if time.Since(raw.(time.Time)) < time.Duration(sec)*time.Second {
						continue
					}
				}
				payload := map[string]any{"trigger_id": tr.ID.String(), "project_id": tr.ProjectID.String(), "db_poll": true}
				_ = nbus.PublishTriggerDispatch(context.Background(), payload)
				last.Store(key, time.Now())
			}
		}
	}
}

func retentionTicker(st *store.Store) {
	t := time.NewTicker(1 * time.Hour)
	defer t.Stop()
	for range t.C {
		_ = st.PruneLogsOlderThanSettings(context.Background())
	}
}

func dbConnect(ctx context.Context, cfg config.Config) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, cfg.DatabaseURL)
}
