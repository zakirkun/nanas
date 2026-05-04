package telemetry

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// CaptureHTTP is a Gin middleware that records one span per HTTP request into
// the SpanStore. It is intentionally lightweight and complementary to the
// OpenTelemetry exporter (`otelgin`) — the OTLP path stays the source of truth
// for upstream collectors, while this in-process store powers the platform's
// trace UI without requiring an external backend.
//
// projectIDFromCtx extracts the active project so the trace list can be
// filtered per-project. We look for the same Gin keys the rest of the API
// uses ("project_id_route") falling back to the "pid" path param.
func CaptureHTTP(store SpanStore) gin.HandlerFunc {
	if store == nil {
		store = Default
	}
	return func(c *gin.Context) {
		start := time.Now()
		traceID := c.GetHeader("X-Trace-ID")
		if traceID == "" {
			traceID = newID()
		}
		c.Writer.Header().Set("X-Trace-ID", traceID)
		spanID := newID()
		parent := c.GetHeader("X-Parent-Span-ID")
		c.Set("trace_id", traceID)
		c.Set("span_id", spanID)
		c.Next()
		end := time.Now()

		rec := SpanRecord{
			TraceID:      traceID,
			SpanID:       spanID,
			ParentSpanID: parent,
			Name:         c.Request.Method + " " + sanitisePath(c),
			Kind:         "server",
			StartedAt:    start,
			EndedAt:      end,
			DurationNS:   end.Sub(start).Nanoseconds(),
			StatusCode:   statusFromCode(c.Writer.Status()),
			Attributes: map[string]any{
				"http.method": c.Request.Method,
				"http.path":   c.FullPath(),
				"http.status": c.Writer.Status(),
				"user_agent":  c.Request.UserAgent(),
			},
		}
		if v, ok := c.Get("project_id_route"); ok {
			if u, ok := v.(uuid.UUID); ok {
				rec.ProjectID = &u
			}
		}
		store.Append(rec)
	}
}

func sanitisePath(c *gin.Context) string {
	full := c.FullPath()
	if full != "" {
		return full
	}
	return c.Request.URL.Path
}

func statusFromCode(code int) string {
	switch {
	case code >= 500:
		return "error"
	case code >= 400:
		return "warn"
	default:
		return "ok"
	}
}

func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return strings.ToLower(hex.EncodeToString(b[:]))
}
