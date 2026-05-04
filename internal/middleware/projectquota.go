package middleware

import (
	"net/http"
	"sync"

	"nanas/internal/httpx"
	"nanas/internal/i18n"
	"nanas/internal/store"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/time/rate"
)

// ProjectQuotaFromSettings caps requests per minute per project (from project_settings.api_quota_rpm).
func ProjectQuotaFromSettings(st *store.Store) gin.HandlerFunc {
	var mu sync.Mutex
	by := map[uuid.UUID]*rate.Limiter{}
	return func(c *gin.Context) {
		pidStr := c.Param("pid")
		if pidStr == "" {
			c.Next()
			return
		}
		pid, err := uuid.Parse(pidStr)
		if err != nil {
			c.Next()
			return
		}
		ps, err := st.SettingsForProject(c.Request.Context(), pid)
		if err != nil {
			c.Next()
			return
		}
		rpm := ps.APIQuotaRPM
		if rpm <= 0 {
			rpm = 600
		}
		mu.Lock()
		lim := by[pid]
		if lim == nil {
			lim = rate.NewLimiter(rate.Limit(float64(rpm)/60), min(120, rpm))
			by[pid] = lim
		}
		mu.Unlock()
		if !lim.Allow() {
			bun := c.MustGet(KeyLocales).(*i18n.Bundle)
			c.Header("Retry-After", "1")
			httpx.Problem(c, bun, http.StatusTooManyRequests, "RATE_LIMITED", nil)
			c.Abort()
			return
		}
		c.Next()
	}
}

// APIKeyQuota enforces quota_rpm set on each API key. Skipped when no API key is present
// or when quota_rpm is unset (the project quota still applies).
func APIKeyQuota() gin.HandlerFunc {
	var mu sync.Mutex
	by := map[uuid.UUID]*rate.Limiter{}
	return func(c *gin.Context) {
		idAny, ok := c.Get(KeyAPIKeyID)
		if !ok {
			c.Next()
			return
		}
		quotaAny, ok := c.Get(KeyAPIKeyQuotaRPM)
		if !ok {
			c.Next()
			return
		}
		rpm := quotaAny.(int)
		if rpm <= 0 {
			c.Next()
			return
		}
		id := idAny.(uuid.UUID)
		mu.Lock()
		lim := by[id]
		if lim == nil {
			lim = rate.NewLimiter(rate.Limit(float64(rpm)/60), min(120, rpm))
			by[id] = lim
		}
		mu.Unlock()
		if !lim.Allow() {
			bun := c.MustGet(KeyLocales).(*i18n.Bundle)
			c.Header("Retry-After", "1")
			httpx.Problem(c, bun, http.StatusTooManyRequests, "RATE_LIMITED", nil)
			c.Abort()
			return
		}
		c.Next()
	}
}
