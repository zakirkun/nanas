package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
	payloaddsl "nanas/internal/dsl/payload"
	"nanas/internal/graphqlapi"
	"nanas/internal/httpx"
	"nanas/internal/i18n"
	"nanas/internal/integrations/email"
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
		OnAsyncInvoke: func(b []byte) {
			asyncInvokeFromNATS(st, cfg, dp, hub, b)
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
	r.Use(middleware.RequestID(), middleware.I18n(bun), middleware.RecoverJSON(bun), middleware.AccessLog(), metrics.PrometheusHTTP(), middleware.RateLimitApprox(cfg.RateLimitPerMinute), telemetry.CaptureHTTP(telemetry.Default))
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

	// Phase 1 lists: power the Function Explorer (PRD section 4) and Trigger
	// Manager (PRD section 7). Read paths require viewer role.
	v1.GET("/projects/:pid/functions", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
		rows, err := st.ListFunctionsByProject(c.Request.Context(), pid, int32(limit), int32(offset))
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		out := rows
		if out == nil {
			out = []store.FunctionListRow{}
		}
		c.JSON(200, gin.H{"functions": out, "limit": limit, "offset": offset})
	})

	v1.GET("/projects/:pid/functions/:fid", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, err := uuid.Parse(c.Param("fid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		f, err := st.FunctionByIDInProject(c.Request.Context(), pid, fid)
		if err != nil {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		ep, _ := st.FunctionEntrypoint(c.Request.Context(), fid)
		c.JSON(200, gin.H{
			"fn_id":           f.ID,
			"name":            f.Name,
			"slug":            f.Slug,
			"current_version": f.CurrentVersion,
			"created_at":      f.CreatedAt,
			"entrypoint":      gin.H{"enabled": ep.Enabled, "auth_mode": ep.AuthMode},
		})
	})

	v1.GET("/projects/:pid/functions/:fid/versions", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, err := uuid.Parse(c.Param("fid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if _, err := st.FunctionByIDInProject(c.Request.Context(), pid, fid); err != nil {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		rows, err := st.ListVersionsByFunction(c.Request.Context(), fid, int32(limit))
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		out := rows
		if out == nil {
			out = []store.FunctionVersionListRow{}
		}
		c.JSON(200, gin.H{"versions": out})
	})

	v1.GET("/projects/:pid/functions/:fid/deployments", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, err := uuid.Parse(c.Param("fid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if _, err := st.FunctionByIDInProject(c.Request.Context(), pid, fid); err != nil {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		rows, err := st.ListDeploymentsForFunctionVerbose(c.Request.Context(), fid, int32(limit))
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		out := rows
		if out == nil {
			out = []store.DeploymentListRow{}
		}
		c.JSON(200, gin.H{"deployments": out})
	})

	// /v1/deployments/:did is project-agnostic so we register it on the auth'd
	// v1 group without RequirePermission — instead we cross-check the project
	// the user has access to via SubjectProjectRole.
	v1.GET("/deployments/:did", func(c *gin.Context) {
		did, err := uuid.Parse(c.Param("did"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		row, pid, err := st.DeploymentByID(c.Request.Context(), did)
		if err != nil {
			httpx.Problem(c, bun, 404, "DEPLOYMENT_NOT_FOUND", nil)
			return
		}
		if !canReadProject(c, st, pid) {
			httpx.Problem(c, bun, http.StatusForbidden, "FORBIDDEN", nil)
			return
		}
		c.JSON(200, gin.H{"deployment": row})
	})

	v1.GET("/projects/:pid/triggers", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		rows, err := st.ListTriggersWithStats(c.Request.Context(), pid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		out := rows
		if out == nil {
			out = []store.TriggerListRow{}
		}
		c.JSON(200, gin.H{"triggers": out})
	})

	v1.GET("/projects/:pid/triggers/:tid", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		tid, err := uuid.Parse(c.Param("tid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "TRIGGER_ID_INVALID", nil)
			return
		}
		row, err := st.TriggerByIDInProject(c.Request.Context(), pid, tid)
		if err != nil {
			httpx.Problem(c, bun, 404, "TRIGGER_NOT_FOUND", nil)
			return
		}
		c.JSON(200, gin.H{"trigger": row})
	})

	v1.PATCH("/projects/:pid/triggers/:tid", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		tid, err := uuid.Parse(c.Param("tid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "TRIGGER_ID_INVALID", nil)
			return
		}
		var body struct {
			Enabled *bool `json:"enabled"`
		}
		if err := c.BindJSON(&body); err != nil || body.Enabled == nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if err := st.SetTriggerEnabled(c.Request.Context(), pid, tid, *body.Enabled); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"id": tid, "enabled": *body.Enabled})
	})

	// Phase 6 — DSL dry-run (PRD section 7).
	// Lets the trigger composer preview the result of `payload_transform` (map +
	// filter + reduce) on a sample event without creating any data.
	v1.POST("/projects/:pid/triggers/:tid/dryrun", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		tid, err := uuid.Parse(c.Param("tid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "TRIGGER_ID_INVALID", nil)
			return
		}
		row, err := st.TriggerByIDInProject(c.Request.Context(), pid, tid)
		if err != nil {
			httpx.Problem(c, bun, 404, "TRIGGER_NOT_FOUND", nil)
			return
		}
		var body struct {
			EventPayload map[string]any  `json:"event_payload"`
			Override     json.RawMessage `json:"transform"`
		}
		_ = c.BindJSON(&body)
		raw := body.Override
		if len(raw) == 0 {
			// Use the trigger's stored config.payload_transform when no override.
			cfg := map[string]any{}
			_ = json.Unmarshal(row.Config, &cfg)
			if pt, ok := cfg["payload_transform"]; ok {
				raw, _ = json.Marshal(pt)
			}
		}
		spec, err := payloaddsl.FromJSON(raw)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "transform", Message: bun.AsLocaleMsg("VALIDATION_ERROR")}})
			return
		}
		res, err := payloaddsl.Apply(body.EventPayload, spec)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "transform", Message: bun.AsLocaleMsg("VALIDATION_ERROR")}})
			return
		}
		c.JSON(200, gin.H{
			"output":  res.Output,
			"passed":  res.Passed,
			"reduced": res.Reduced,
		})
	})

	v1.GET("/projects/:pid/triggers/:tid/status", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		tid, err := uuid.Parse(c.Param("tid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "TRIGGER_ID_INVALID", nil)
			return
		}
		row, err := st.TriggerByIDInProject(c.Request.Context(), pid, tid)
		if err != nil {
			httpx.Problem(c, bun, 404, "TRIGGER_NOT_FOUND", nil)
			return
		}
		c.JSON(200, gin.H{
			"trigger_id":           row.ID,
			"enabled":              row.Enabled,
			"dispatch_count":       row.DispatchCount,
			"dlq_count":            row.DLQCount,
			"last_fired_at":        row.LastFiredAt,
			"last_dispatch_status": row.LastDispatchStatus,
		})
	})

	// Phase 4 — In-browser code authoring (PRD wireframe #1).
	// Drafts are persisted server-side per function so editors are never lost,
	// and the source endpoint packages an authored set of files into a tar.gz
	// that lives in MinIO under the same artifacts/ path the build pipeline reads.
	v1.GET("/projects/:pid/functions/:fid/draft", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, err := uuid.Parse(c.Param("fid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if _, err := st.FunctionByIDInProject(c.Request.Context(), pid, fid); err != nil {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		d, err := st.GetFunctionDraft(c.Request.Context(), fid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{
			"fn_id":      d.FnID,
			"files":      d.Files,
			"env":        d.Env,
			"runtime":    d.Runtime,
			"updated_at": d.UpdatedAt,
		})
	})

	v1.POST("/projects/:pid/functions/:fid/draft", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, err := uuid.Parse(c.Param("fid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if _, err := st.FunctionByIDInProject(c.Request.Context(), pid, fid); err != nil {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		var body struct {
			Files   []sourceFile      `json:"files"`
			Env     map[string]string `json:"env"`
			Runtime string            `json:"runtime"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if err := validateSourceFiles(body.Files); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "files", Message: bun.AsLocaleMsg("VALIDATION_ERROR")}})
			return
		}
		filesJSON, _ := json.Marshal(body.Files)
		envJSON, _ := json.Marshal(body.Env)
		var by *uuid.UUID
		if v, ok := c.Get(middleware.KeyUserUUID); ok {
			u := v.(uuid.UUID)
			by = &u
		}
		if _, err := st.SaveFunctionDraft(c.Request.Context(), fid, filesJSON, envJSON, body.Runtime, by); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"saved": true, "files": len(body.Files)})
	})

	v1.POST("/projects/:pid/functions/:fid/source", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		fid, err := uuid.Parse(c.Param("fid"))
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		fn, err := st.FunctionByIDInProject(c.Request.Context(), pid, fid)
		if err != nil {
			httpx.Problem(c, bun, 404, "FUNCTION_NOT_FOUND", nil)
			return
		}
		pv, err := st.ProjectByID(c.Request.Context(), pid)
		if err != nil || pv.MinioBucket == nil || strings.TrimSpace(pv.ProvisionStatus) != "ready" {
			httpx.Problem(c, bun, 400, "PROVISIONING_PENDING", nil)
			return
		}
		var body struct {
			Version string       `json:"version"`
			Files   []sourceFile `json:"files"`
		}
		if err := c.BindJSON(&body); err != nil || strings.TrimSpace(body.Version) == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if err := validateSourceFiles(body.Files); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "files", Message: bun.AsLocaleMsg("VALIDATION_ERROR")}})
			return
		}
		tarball, sum, err := buildSourceTarball(body.Files)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		key := "artifacts/" + pid.String() + "/" + fid.String() + "/" + strings.TrimSpace(body.Version) + ".tar.gz"
		if err := miniox.ValidateObjectKey(key); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "files", Message: bun.AsLocaleMsg("OBJECT_KEY_INVALID")}})
			return
		}
		if err := miniox.PutBytes(c.Request.Context(), cfg, *pv.MinioBucket, key, tarball, "application/gzip"); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		_ = st.UpsertObject(c.Request.Context(), pid, *pv.MinioBucket, key, int64(len(tarball)), "")
		c.JSON(200, gin.H{
			"function_id":  fn.ID,
			"artifact_key": key,
			"checksum":     "sha256:" + sum,
			"size":         len(tarball),
		})
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
		// Phase 5 (PRD section 6) — accept the full deploy spec. Older callers
		// that only sent {version, region} continue to work; the new fields are
		// all optional with sensible defaults.
		var body struct {
			Version         string            `json:"version"`
			Region          string            `json:"region"`
			Strategy        string            `json:"strategy"`
			Resources       map[string]any    `json:"resources"`
			Env             map[string]string `json:"env"`
			HealthCheckPath string            `json:"health_check_path"`
			TimeoutMS       int               `json:"timeout_ms"`
		}
		_ = c.BindJSON(&body)
		if body.Version == "" && fn.CurrentVersion != nil {
			body.Version = *fn.CurrentVersion
		}
		if body.Version == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		switch strings.ToLower(strings.TrimSpace(body.Strategy)) {
		case "", "rolling", "canary", "recreate":
			body.Strategy = strings.ToLower(strings.TrimSpace(body.Strategy))
			if body.Strategy == "" {
				body.Strategy = "rolling"
			}
		default:
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "strategy", Message: bun.AsLocaleMsg("VALIDATION_ERROR")}})
			return
		}
		if body.TimeoutMS <= 0 {
			body.TimeoutMS = 5000
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
		// Persist deploy spec onto the row + flip status -> deploying so the
		// UI sees the transition while the dataplane call runs.
		resourcesJSON, _ := json.Marshal(body.Resources)
		envJSON, _ := json.Marshal(body.Env)
		var hp *string
		if body.HealthCheckPath != "" {
			s := body.HealthCheckPath
			hp = &s
		}
		_ = st.MarkDeploymentDeploying(c.Request.Context(), d.ID, body.Strategy, resourcesJSON, envJSON, hp, body.TimeoutMS)

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
		// User-provided env vars take precedence over baseline tenant env.
		for k, v := range body.Env {
			if k != "" {
				dpEnv[k] = v
			}
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
			_ = st.UpdateFunctionLastDeployment(c.Request.Context(), fid, "failed", time.Now())
			_ = st.AppendFunctionLog(c.Request.Context(), &pid, &d.ID, "error", "dataplane deploy failed")
			httpx.Problem(c, bun, 502, "GATEWAY_ERROR", nil)
			return
		}
		_ = st.MarkDeploymentActive(c.Request.Context(), d.ID)
		_ = st.UpdateFunctionLastDeployment(c.Request.Context(), fid, "active", time.Now())
		_ = st.AppendFunctionLog(c.Request.Context(), &pid, &d.ID, "info", "deployment active (+ dataplane)")
		c.JSON(200, gin.H{"deployment_id": d.ID, "status": "active"})
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
		ip := buildInvokePayload(c.Request.Context(), st, cfg, pid, fid, body.Input)
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

	v1.POST("/projects/:pid/functions/:fid/invoke/async", middleware.RequirePermission("developer"), func(c *gin.Context) {
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
		enqueueID := uuid.New()
		env := map[string]any{
			"enqueue_id":   enqueueID.String(),
			"project_id":   pid.String(),
			"function_id":  fid.String(),
			"function":     fn.Name,
			"input":        body.Input,
			"enqueued_at":  time.Now().UTC().Format(time.RFC3339Nano),
			"dispatch_via": "http",
		}
		if err := st.AppendPlatformEvent(c.Request.Context(), &pid, "function.invoke.async", env); err != nil {
			slog.Warn("async_invoke_event", "err", err)
		}
		if nbus != nil {
			_ = nbus.PublishAsyncFunctionInvoke(c.Request.Context(), map[string]any{
				"enqueue_id":  enqueueID.String(),
				"project_id":  pid.String(),
				"function_id": fid.String(),
				"input":       body.Input,
			})
		} else {
			go runAsyncInvokeJob(context.Background(), st, cfg, dp, hub, pid, fid, enqueueID.String(), body.Input, fn.Name)
		}
		c.JSON(202, gin.H{"enqueue_id": enqueueID.String(), "status": "queued"})
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
		act := routeActorUUID(c)
		if err := tenantdb.MigrateStatements(c.Request.Context(), cfg, st, pid, body.SQL); err != nil {
			msg := err.Error()
			_ = st.InsertDbMigration(c.Request.Context(), pid, body.SQL, act, "failed", &msg)
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "sql", Message: bun.AsLocaleMsg("SQL_EXECUTION_FAILED")}})
			return
		}
		_ = st.InsertDbMigration(c.Request.Context(), pid, body.SQL, act, "applied", nil)
		c.JSON(200, gin.H{"applied": true})
	})

	v1.GET("/projects/:pid/migrations", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		rows, err := st.ListDbMigrations(c.Request.Context(), pid, int32(limit))
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"migrations": rows})
	})

	v1.GET("/projects/:pid/db/databases", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		dbNames, err := tenantdb.ListDatabaseNames(c.Request.Context(), cfg, st, pid)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		ps, err := st.SettingsForProject(c.Request.Context(), pid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		var allow []string
		if len(ps.DatabaseAllowlist) > 0 {
			_ = json.Unmarshal(ps.DatabaseAllowlist, &allow)
		}
		c.JSON(200, gin.H{"databases": dbNames, "allowlist": allow})
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

	// Phase 12 — bucket browser endpoints (PRD section 10).
	v1.GET("/projects/:pid/storage/objects", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		p, err := st.ProjectByID(c.Request.Context(), pid)
		if err != nil || p.MinioBucket == nil {
			httpx.Problem(c, bun, 400, "PROVISIONING_PENDING", nil)
			return
		}
		bucket := strings.TrimSpace(c.DefaultQuery("bucket", *p.MinioBucket))
		if bucket != *p.MinioBucket {
			// We only expose the project's own bucket; other buckets in the
			// MinIO instance are off-limits.
			httpx.Problem(c, bun, http.StatusForbidden, "FORBIDDEN", nil)
			return
		}
		prefix := strings.TrimSpace(c.Query("prefix"))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "200"))
		objects, err := miniox.List(c.Request.Context(), cfg, bucket, prefix, limit)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"bucket": bucket, "objects": objects})
	})

	v1.DELETE("/projects/:pid/storage/objects/*key", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		p, err := st.ProjectByID(c.Request.Context(), pid)
		if err != nil || p.MinioBucket == nil {
			httpx.Problem(c, bun, 400, "PROVISIONING_PENDING", nil)
			return
		}
		key := strings.TrimPrefix(c.Param("key"), "/")
		if err := miniox.ValidateObjectKey(key); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "key", Message: bun.AsLocaleMsg("OBJECT_KEY_INVALID")}})
			return
		}
		if err := miniox.Remove(c.Request.Context(), cfg, *p.MinioBucket, key); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		var actor *uuid.UUID
		if v, ok := c.Get(middleware.KeyUserUUID); ok {
			u := v.(uuid.UUID)
			actor = &u
		}
		_ = st.Audit(c.Request.Context(), &pid, actor, "object.delete", key, nil)
		c.JSON(200, gin.H{"deleted": true, "key": key})
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
		event := map[string]any{"trigger_id": tid.String(), "project_id": pid.String(), "manual": true}
		// Phase 6 — apply payload_transform if configured. The dispatched event
		// receives the projected/filtered output; if the filter rejects the
		// event we still record dispatch_count + last_dispatch_status="filtered"
		// so the UI can surface that.
		dispatched := dispatchTriggerWithDSL(c.Request.Context(), st, hub, nbus, tid, pid, event)
		if dispatched {
			c.JSON(202, gin.H{"queued": true})
			return
		}
		c.JSON(202, gin.H{"queued": false, "filtered": true})
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

	// Phase 16 — Project-scoped integrations (email via SendGrid).
	v1.GET("/projects/:pid/integrations", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		rows, err := st.ListProjectIntegrations(c.Request.Context(), pid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"integrations": rows})
	})
	v1.POST("/projects/:pid/integrations/email", middleware.RequirePermission("admin"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			APIKey       string `json:"api_key"`
			DefaultFrom  string `json:"default_from"`
			DefaultReply string `json:"default_reply"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		cfgBlob := map[string]any{}
		if strings.TrimSpace(body.DefaultFrom) != "" {
			cfgBlob["default_from"] = strings.TrimSpace(body.DefaultFrom)
		}
		if strings.TrimSpace(body.DefaultReply) != "" {
			cfgBlob["default_reply"] = strings.TrimSpace(body.DefaultReply)
		}
		raw, _ := json.Marshal(cfgBlob)
		if err := st.UpsertEmailIntegration(c.Request.Context(), pid, "sendgrid", body.APIKey, cfg.TenantSecretKey, raw); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		_ = st.Audit(c.Request.Context(), &pid, routeActorUUID(c), "integration.email.upsert", "sendgrid", nil)
		c.JSON(200, gin.H{"adapter": "sendgrid", "status": "saved"})
	})
	v1.POST("/projects/:pid/integrations/email/send", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			To      string `json:"to"`
			From    string `json:"from"`
			Subject string `json:"subject"`
			HTML    string `json:"html"`
		}
		if err := c.BindJSON(&body); err != nil || strings.TrimSpace(body.To) == "" || strings.TrimSpace(body.Subject) == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		key, err := st.SendGridAPIKey(c.Request.Context(), pid, cfg.TenantSecretKey)
		if err != nil || key == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		rows, _ := st.ListProjectIntegrations(c.Request.Context(), pid)
		from := strings.TrimSpace(body.From)
		if from == "" {
			for _, r := range rows {
				if r.Adapter == "sendgrid" {
					var meta map[string]any
					_ = json.Unmarshal(r.Config, &meta)
					if v, ok := meta["default_from"].(string); ok {
						from = strings.TrimSpace(v)
					}
					break
				}
			}
		}
		if from == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if err := email.SendGrid(key, from, body.To, body.Subject, body.HTML); err != nil {
			slog.Warn("sendgrid", "err", err)
			httpx.Problem(c, bun, 502, "GATEWAY_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"sent": true})
	})

	// Phase 13 — Roles matrix + retention settings (PRD section 12).
	v1.GET("/projects/:pid/permissions", middleware.RequirePermission("admin"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		rows, err := st.ListProjectPermissions(c.Request.Context(), pid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		owner, _ := st.ProjectOwnerID(c.Request.Context(), pid)
		out := rows
		if out == nil {
			out = []store.PermissionRow{}
		}
		c.JSON(200, gin.H{"permissions": out, "owner_id": owner})
	})

	v1.GET("/projects/:pid/settings/retention", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		log, trace, err := st.RetentionSettings(c.Request.Context(), pid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"logs_days": log, "traces_days": trace})
	})

	v1.PATCH("/projects/:pid/settings/retention", middleware.RequirePermission("admin"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			LogsDays   *int `json:"logs_days"`
			TracesDays *int `json:"traces_days"`
		}
		if err := c.BindJSON(&body); err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if body.LogsDays != nil && (*body.LogsDays < 1 || *body.LogsDays > 365) {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "logs_days", Message: bun.AsLocaleMsg("VALIDATION_ERROR")}})
			return
		}
		if body.TracesDays != nil && (*body.TracesDays < 1 || *body.TracesDays > 90) {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "traces_days", Message: bun.AsLocaleMsg("VALIDATION_ERROR")}})
			return
		}
		if err := st.PatchRetentionSettings(c.Request.Context(), pid, body.LogsDays, body.TracesDays); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"logs_days": body.LogsDays, "traces_days": body.TracesDays})
	})

	v1.GET("/projects/:pid/settings/data-allowlist", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		ps, err := st.SettingsForProject(c.Request.Context(), pid)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		var tables []string
		if len(ps.TableAllowlist) > 0 {
			_ = json.Unmarshal(ps.TableAllowlist, &tables)
		}
		if tables == nil {
			tables = []string{}
		}
		c.JSON(200, gin.H{"tables": tables})
	})

	v1.PATCH("/projects/:pid/settings/data-allowlist", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			Tables []string `json:"tables"`
		}
		if err := c.BindJSON(&body); err != nil || body.Tables == nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		normalized, err := tenantdb.NormalizeAllowlistTables(body.Tables)
		if err != nil {
			em := err.Error()
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{
				Field:   "tables",
				Message: apierr.LocaleMsg{ID: em, EN: em},
			}})
			return
		}
		b, err := json.Marshal(normalized)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		if err := st.PatchProjectSettingsAllowlistJSON(c.Request.Context(), pid, b); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"tables": normalized})
	})

	v1.PATCH("/projects/:pid/settings/database-allowlist", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		var body struct {
			Databases []string `json:"databases"`
		}
		if err := c.BindJSON(&body); err != nil || body.Databases == nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		cluster, err := tenantdb.ListDatabaseNames(c.Request.Context(), cfg, st, pid)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		normalized, err := tenantdb.ValidateDatabaseAllowlist(body.Databases, cluster)
		if err != nil {
			em := err.Error()
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{
				Field:   "databases",
				Message: apierr.LocaleMsg{ID: em, EN: em},
			}})
			return
		}
		raw, err := json.Marshal(normalized)
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		if err := st.PatchProjectSettingsDatabaseAllowlistJSON(c.Request.Context(), pid, raw); err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"databases": normalized})
	})

	v1.GET("/projects/:pid/data/catalog/tables", middleware.RequirePermission("developer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		tables, err := tenantdb.ListPublicBaseTables(c.Request.Context(), cfg, st, pid)
		if err != nil {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", []apierr.FieldErr{{Field: "tenant", Message: bun.AsLocaleMsg("SQL_EXECUTION_FAILED")}})
			return
		}
		c.JSON(200, gin.H{"tables": tables})
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
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
		if limit <= 0 || limit > 500 {
			limit = 100
		}
		rows, err := st.AuditList(c.Request.Context(), pid, int32(limit))
		if err != nil {
			httpx.Problem(c, bun, 500, "INTERNAL_ERROR", nil)
			return
		}
		c.JSON(200, gin.H{"events": rows})
	})

	// Phase 10 — Trace store endpoints (PRD section 16). The list route is
	// per-project (viewer); the by-id route is project-agnostic but cross-checks
	// the trace's project against the caller before returning spans.
	v1.GET("/projects/:pid/observability/traces", middleware.RequirePermission("viewer"), func(c *gin.Context) {
		pid := c.MustGet("project_id_route").(uuid.UUID)
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		traces := telemetry.Default.List(&pid, limit)
		c.JSON(200, gin.H{"traces": traces})
	})

	v1.GET("/observability/traces", func(c *gin.Context) {
		traceID := strings.TrimSpace(c.Query("trace_id"))
		if traceID == "" {
			httpx.Problem(c, bun, 400, "VALIDATION_ERROR", nil)
			return
		}
		spans := telemetry.Default.Get(traceID)
		if len(spans) == 0 {
			httpx.Problem(c, bun, 404, "NOT_FOUND", nil)
			return
		}
		// Authorisation: when any captured span carries a project, only allow
		// users with access to that project. Spans without a project_id are
		// visible to any signed-in user (e.g. /v1/projects list).
		var projectGate *uuid.UUID
		for _, s := range spans {
			if s.ProjectID != nil {
				p := *s.ProjectID
				projectGate = &p
				break
			}
		}
		if projectGate != nil && !canReadProject(c, st, *projectGate) {
			httpx.Problem(c, bun, http.StatusForbidden, "FORBIDDEN", nil)
			return
		}
		c.JSON(200, gin.H{"trace": gin.H{"trace_id": traceID, "spans": spans}})
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

// dispatchTriggerWithDSL applies the optional payload_transform DSL stored on a
// trigger to `event`, then publishes the result to NATS + the realtime hub.
// Returns true when the event was dispatched, false when the filter rejected
// it. Either way it stamps the trigger's dispatch counters.
func dispatchTriggerWithDSL(
	ctx context.Context,
	st *store.Store,
	hub *realtime.Hub,
	nbus *natsbus.Bus,
	tid uuid.UUID,
	pid uuid.UUID,
	event map[string]any,
) bool {
	now := time.Now()
	row, err := st.TriggerByIDInProject(ctx, pid, tid)
	if err != nil {
		_ = st.RecordTriggerDispatch(ctx, tid, "missing", now)
		return false
	}
	cfg := map[string]any{}
	_ = json.Unmarshal(row.Config, &cfg)
	transformRaw, _ := json.Marshal(cfg["payload_transform"])
	dsl, _ := payloaddsl.FromJSON(transformRaw)
	res, err := payloaddsl.Apply(event, dsl)
	if err != nil {
		_ = st.RecordTriggerDispatch(ctx, tid, "error", now)
		return false
	}
	if !res.Passed {
		_ = st.RecordTriggerDispatch(ctx, tid, "filtered", now)
		return false
	}
	out := res.Output
	if out == nil {
		out = event
	} else {
		// Preserve trigger_id & project_id so downstream consumers can route.
		out["trigger_id"] = tid.String()
		out["project_id"] = pid.String()
	}
	if nbus != nil {
		_ = nbus.PublishTriggerDispatch(ctx, out)
	}
	hub.Broadcast(pid, "triggers", out)
	_ = st.RecordTriggerDispatch(ctx, tid, "ok", now)
	return true
}

// sourceFile is the unit of in-browser code authoring (Phase 4). The path is
// relative to the artifact root (no leading slash, no `..`); the content is the
// raw text that will be written into the tar.gz uploaded to MinIO.
type sourceFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func validateSourceFiles(files []sourceFile) error {
	if len(files) == 0 {
		return errors.New("no files supplied")
	}
	for _, f := range files {
		path := strings.TrimSpace(f.Path)
		if path == "" {
			return errors.New("empty file path")
		}
		if strings.HasPrefix(path, "/") || strings.Contains(path, "..") || strings.Contains(path, "\\") {
			return fmt.Errorf("unsafe file path: %s", path)
		}
		if len(f.Content) > 1<<20 {
			return fmt.Errorf("file %s exceeds 1MiB", path)
		}
	}
	return nil
}

// buildSourceTarball packages the authored files into an in-memory tar.gz and
// returns the bytes plus a hex-encoded SHA-256 checksum (without the prefix).
func buildSourceTarball(files []sourceFile) ([]byte, string, error) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	now := time.Now()
	for _, f := range files {
		hdr := &tar.Header{
			Name:    f.Path,
			Mode:    0644,
			Size:    int64(len(f.Content)),
			ModTime: now,
		}
		if err := tw.WriteHeader(hdr); err != nil {
			return nil, "", err
		}
		if _, err := tw.Write([]byte(f.Content)); err != nil {
			return nil, "", err
		}
	}
	if err := tw.Close(); err != nil {
		return nil, "", err
	}
	if err := gz.Close(); err != nil {
		return nil, "", err
	}
	sum := sha256.Sum256(buf.Bytes())
	return buf.Bytes(), hex.EncodeToString(sum[:]), nil
}

// canReadProject lets project-agnostic endpoints (e.g. GET /v1/deployments/:id)
// gate access on the project the resource ultimately belongs to.
// JWT users must own or be a member of the project; API keys must be scoped to
// the same project.
func canReadProject(c *gin.Context, st *store.Store, pid uuid.UUID) bool {
	if v, ok := c.Get(middleware.KeyAPIKeyProj); ok {
		if u, ok := v.(uuid.UUID); ok {
			return u == pid
		}
	}
	uidVal, ok := c.Get(middleware.KeyUserUUID)
	if !ok {
		return false
	}
	uid, ok := uidVal.(uuid.UUID)
	if !ok {
		return false
	}
	if owner, err := st.ProjectOwnerID(c.Request.Context(), pid); err == nil && owner == uid {
		return true
	}
	if role, err := st.SubjectProjectRole(c.Request.Context(), pid, uid); err == nil && role != "" {
		return true
	}
	if u, err := st.UserByID(c.Request.Context(), uid); err == nil {
		if u.PlatformRole == "super_admin" || u.PlatformRole == "staff" {
			return true
		}
	}
	return false
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

func routeActorUUID(c *gin.Context) *uuid.UUID {
	v, ok := c.Get(middleware.KeyUserUUID)
	if !ok {
		return nil
	}
	id, ok := v.(uuid.UUID)
	if !ok {
		return nil
	}
	return &id
}

func buildInvokePayload(ctx context.Context, st *store.Store, cfg config.Config, pid, fid uuid.UUID, input map[string]any) datalane.InvokePayload {
	ip := datalane.InvokePayload{Input: input}
	if drow, er := st.LatestActiveDeploymentForFunction(ctx, fid); er == nil {
		ip.DeploymentID = drow.ID.String()
		pp, er2 := st.ProjectByID(ctx, pid)
		dbURL, er3 := tenantdb.ConnectionURL(ctx, cfg, st, pid)
		if er2 == nil && pp.MinioBucket != nil && er3 == nil {
			_, _, sv, er4 := st.DeploymentArtifacts(ctx, drow.ID)
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
	return ip
}

func runAsyncInvokeJob(ctx context.Context, st *store.Store, cfg config.Config, dp *datalane.Client, hub *realtime.Hub, pid, fid uuid.UUID, enqueueID string, input map[string]any, fnName string) {
	ip := buildInvokePayload(ctx, st, cfg, pid, fid, input)
	invStart := time.Now()
	out, err := dp.Invoke(ctx, ip)
	result := "ok"
	if err != nil {
		result = "error"
	}
	metrics.RecordInvocation(pid.String(), fnName, result, time.Since(invStart))
	detail := map[string]any{"enqueue_id": enqueueID, "function_id": fid.String()}
	if err != nil {
		detail["status"] = "error"
		detail["error"] = err.Error()
	} else {
		detail["status"] = out.Status
		detail["output"] = out.Output
	}
	_ = st.AppendPlatformEvent(ctx, &pid, "function.invoke.async.result", detail)
	if hub != nil {
		hub.Broadcast(pid, "entrypoint", detail)
	}
}

func asyncInvokeFromNATS(st *store.Store, cfg config.Config, dp *datalane.Client, hub *realtime.Hub, raw []byte) {
	var m struct {
		ProjectID  string         `json:"project_id"`
		FunctionID string         `json:"function_id"`
		EnqueueID  string         `json:"enqueue_id"`
		Input      map[string]any `json:"input"`
	}
	if json.Unmarshal(raw, &m) != nil {
		return
	}
	pid, e1 := uuid.Parse(m.ProjectID)
	fid, e2 := uuid.Parse(m.FunctionID)
	if e1 != nil || e2 != nil {
		return
	}
	fn, err := st.FunctionByID(context.Background(), fid)
	if err != nil || fn.ProjectID != pid {
		return
	}
	runAsyncInvokeJob(context.Background(), st, cfg, dp, hub, pid, fid, m.EnqueueID, m.Input, fn.Name)
}

func dbConnect(ctx context.Context, cfg config.Config) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, cfg.DatabaseURL)
}
