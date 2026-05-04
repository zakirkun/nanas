package middleware

import (
	"log/slog"
	"net/http"
	"strings"
	"sync"

	"nanas/internal/auth"
	"nanas/internal/config"
	"nanas/internal/httpx"
	"nanas/internal/i18n"
	"nanas/internal/store"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/time/rate"
)

const KeyUserUUID = "user_uuid"

const KeyAPIKeyProj = "apikey_project"
const KeyAPIKeyRole = "apikey_role"
const KeyAPIKeyID = "apikey_id"
const KeyAPIKeyQuotaRPM = "apikey_quota_rpm"
const KeyLocales = "i18n_bundle"
const KeyStore = "store"

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		rid := c.GetHeader("X-Request-ID")
		if rid == "" {
			rid = uuid.NewString()
		}
		c.Writer.Header().Set("X-Request-ID", rid)
		c.Next()
	}
}

func RecoverJSON(bun *i18n.Bundle) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				slog.Error("panic", "err", err)
				httpx.Problem(c, bun, http.StatusInternalServerError, "INTERNAL_ERROR", nil)
				c.Abort()
			}
		}()
		c.Next()
	}
}

func OptionalJWT(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authz := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		authz = strings.TrimSpace(authz)
		if authz != "" && !strings.HasPrefix(authz, "sk_") {
			cl, err := auth.Parse(cfg, authz)
			if err == nil && cl.UserID != "" {
				id, err := uuid.Parse(cl.UserID)
				if err == nil {
					c.Set(KeyUserUUID, id)
				}
			}
		}
		c.Next()
	}
}

func RequireAuth(cfg config.Config, bun *i18n.Bundle) gin.HandlerFunc {
	return func(c *gin.Context) {
		st := c.MustGet(KeyStore).(*store.Store)
		authz := strings.TrimSpace(c.GetHeader("Authorization"))
		// Browsers cannot set custom headers on a native WebSocket handshake.
		// Allow ?access_token= as a fallback when no Authorization header is
		// present. The query value is treated identically to a Bearer token
		// (JWT or sk_ API key) and never leaks beyond this middleware.
		if authz == "" {
			if qtok := strings.TrimSpace(c.Query("access_token")); qtok != "" {
				authz = "Bearer " + qtok
			}
		}
		if strings.HasPrefix(authz, "Bearer ") {
			tok := strings.TrimSpace(strings.TrimPrefix(authz, "Bearer "))
			if strings.HasPrefix(tok, "sk_") {
				rec, err := st.ResolveAPIKey(c.Request.Context(), tok)
				if err != nil || rec.Revoked != nil {
					httpx.Problem(c, bun, http.StatusUnauthorized, "UNAUTHORIZED", nil)
					c.Abort()
					return
				}
				c.Set(KeyAPIKeyProj, rec.ProjectID)
				c.Set(KeyAPIKeyRole, rec.Role)
				c.Set(KeyAPIKeyID, rec.ID)
				if rec.QuotaRPM != nil {
					c.Set(KeyAPIKeyQuotaRPM, *rec.QuotaRPM)
				}
				c.Next()
				return
			}
			cl, err := auth.Parse(cfg, tok)
			if err != nil {
				httpx.Problem(c, bun, http.StatusUnauthorized, "UNAUTHORIZED", nil)
				c.Abort()
				return
			}
			id, err := uuid.Parse(cl.UserID)
			if err != nil {
				httpx.Problem(c, bun, http.StatusUnauthorized, "UNAUTHORIZED", nil)
				c.Abort()
				return
			}
			c.Set(KeyUserUUID, id)
			c.Next()
			return
		}
		httpx.Problem(c, bun, http.StatusUnauthorized, "UNAUTHORIZED", nil)
		c.Abort()
	}
}

func RequireJWT(cfg config.Config, bun *i18n.Bundle) gin.HandlerFunc {
	return func(c *gin.Context) {
		authz := strings.TrimSpace(c.GetHeader("Authorization"))
		if !strings.HasPrefix(authz, "Bearer ") {
			httpx.Problem(c, bun, http.StatusUnauthorized, "UNAUTHORIZED", nil)
			c.Abort()
			return
		}
		tok := strings.TrimSpace(strings.TrimPrefix(authz, "Bearer "))
		if strings.HasPrefix(tok, "sk_") {
			httpx.Problem(c, bun, http.StatusUnauthorized, "UNAUTHORIZED", nil)
			c.Abort()
			return
		}
		cl, err := auth.Parse(cfg, strings.TrimSpace(tok))
		if err != nil {
			httpx.Problem(c, bun, http.StatusUnauthorized, "UNAUTHORIZED", nil)
			c.Abort()
			return
		}
		id, err := uuid.Parse(cl.UserID)
		if err != nil {
			httpx.Problem(c, bun, http.StatusUnauthorized, "UNAUTHORIZED", nil)
			c.Abort()
			return
		}
		c.Set(KeyUserUUID, id)
		c.Next()
	}
}

// RequirePlatformRole gates platform-level admin endpoints by users.platform_role.
// Tier order: super_admin > staff > user.
func RequirePlatformRole(min string) gin.HandlerFunc {
	want := platformTier(min)
	return func(c *gin.Context) {
		bun := c.MustGet(KeyLocales).(*i18n.Bundle)
		st := c.MustGet(KeyStore).(*store.Store)
		uidVal, ok := c.Get(KeyUserUUID)
		if !ok {
			httpx.Problem(c, bun, http.StatusUnauthorized, "UNAUTHORIZED", nil)
			c.Abort()
			return
		}
		uid := uidVal.(uuid.UUID)
		u, err := st.UserByID(c.Request.Context(), uid)
		if err != nil {
			httpx.Problem(c, bun, http.StatusUnauthorized, "UNAUTHORIZED", nil)
			c.Abort()
			return
		}
		if platformTier(u.PlatformRole) < want {
			httpx.Problem(c, bun, http.StatusForbidden, "PLATFORM_FORBIDDEN", nil)
			c.Abort()
			return
		}
		c.Set("platform_user", u)
		c.Next()
	}
}

func platformTier(role string) int {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "super_admin":
		return 30
	case "staff":
		return 20
	case "user":
		return 10
	default:
		return 0
	}
}

func RequirePermission(atLeast string) gin.HandlerFunc {
	want := tier(strings.ToLower(strings.TrimSpace(atLeast)))
	return func(c *gin.Context) {
		bun := c.MustGet(KeyLocales).(*i18n.Bundle)
		st := c.MustGet(KeyStore).(*store.Store)
		pid, err := uuid.Parse(c.Param("pid"))
		if err != nil {
			httpx.Problem(c, bun, http.StatusBadRequest, "VALIDATION_ERROR", nil)
			c.Abort()
			return
		}
		var prank string
		if kpidVal, api := c.Get(KeyAPIKeyProj); api {
			kpid := kpidVal.(uuid.UUID)
			if kpid != pid {
				httpx.Problem(c, bun, http.StatusForbidden, "FORBIDDEN", nil)
				c.Abort()
				return
			}
			prank = rankFromRole(c.GetString(KeyAPIKeyRole))
		} else {
			uidVal, ok := c.Get(KeyUserUUID)
			if !ok {
				httpx.Problem(c, bun, http.StatusUnauthorized, "UNAUTHORIZED", nil)
				c.Abort()
				return
			}
			uid := uidVal.(uuid.UUID)
			owner, err := st.ProjectOwnerID(c.Request.Context(), pid)
			if err != nil {
				httpx.Problem(c, bun, http.StatusNotFound, "PROJECT_NOT_FOUND", nil)
				c.Abort()
				return
			}
			if owner == uid {
				prank = "admin"
			} else if r2, er := st.SubjectProjectRole(c.Request.Context(), pid, uid); er == nil {
				prank = strings.ToLower(r2)
			} else {
				prank = ""
			}
		}
		if tier(prank) < want {
			httpx.Problem(c, bun, http.StatusForbidden, "FORBIDDEN", nil)
			c.Abort()
			return
		}
		if disabled, _ := st.ProjectIsDisabled(c.Request.Context(), pid); disabled {
			httpx.Problem(c, bun, http.StatusForbidden, "PROJECT_DISABLED", nil)
			c.Abort()
			return
		}
		c.Set("project_id_route", pid)
		c.Next()
	}
}

func tier(role string) int {
	switch strings.ToLower(role) {
	case "admin":
		return 30
	case "developer":
		return 20
	case "viewer":
		return 10
	default:
		return 0
	}
}

func rankFromRole(apiRole string) string {
	switch strings.ToLower(strings.TrimSpace(apiRole)) {
	case "admin":
		return "admin"
	case "developer":
		return "developer"
	case "service":
		return "admin"
	case "viewer":
		return "viewer"
	default:
		return "viewer"
	}
}

func I18n(bun *i18n.Bundle) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(KeyLocales, bun)
		c.Next()
	}
}

// RateLimitApprox limits ~ requests per minute per client IP using a fixed burst.
func RateLimitApprox(rpm int) gin.HandlerFunc {
	if rpm <= 0 {
		rpm = 600
	}
	var mu sync.Mutex
	byIP := map[string]*rate.Limiter{}

	return func(c *gin.Context) {
		if c.Request.URL.Path == "/metrics" {
			c.Next()
			return
		}

		ip := c.ClientIP()
		mu.Lock()
		lim := byIP[ip]
		if lim == nil {
			lim = rate.NewLimiter(rate.Limit(float64(rpm)/60), min(120, rpm))
			byIP[ip] = lim
		}
		mu.Unlock()
		if !lim.Allow() {
			httpx.Problem(c, c.MustGet(KeyLocales).(*i18n.Bundle), http.StatusTooManyRequests, "RATE_LIMITED", nil)
			c.Abort()
			return
		}
		c.Next()
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
