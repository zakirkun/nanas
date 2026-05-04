package middleware

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
)

// AccessLog emits one structured slog line per request after completion.
func AccessLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		c.Next()

		ms := time.Since(start).Milliseconds()
		ridv := c.Writer.Header().Get("X-Request-ID")
		if ridv == "" {
			ridv = c.GetHeader("X-Request-ID")
		}

		slog.Info("http",
			"method", c.Request.Method,
			"path", path,
			"status", c.Writer.Status(),
			"latency_ms", ms,
			"request_id", ridv,
			"client_ip", c.ClientIP(),
		)
	}
}
