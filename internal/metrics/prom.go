package metrics

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var reqTotal = promauto.NewCounterVec(
	prometheus.CounterOpts{
		Namespace: "nanas",
		Subsystem: "http",
		Name:      "requests_total",
		Help:      "HTTP requests counted by route template, method and status.",
	},
	[]string{"method", "route", "code"},
)

var reqLatency = promauto.NewHistogramVec(
	prometheus.HistogramOpts{
		Namespace: "nanas",
		Subsystem: "http",
		Name:      "request_duration_seconds",
		Help:      "HTTP request latency in seconds.",
		Buckets:   prometheus.DefBuckets,
	},
	[]string{"method", "route"},
)

var invocationsTotal = promauto.NewCounterVec(
	prometheus.CounterOpts{
		Namespace: "nanas",
		Name:      "invocations_total",
		Help:      "Function invocations counted by project, function, and result.",
	},
	[]string{"project", "function", "result"},
)

var invocationSeconds = promauto.NewHistogramVec(
	prometheus.HistogramOpts{
		Namespace: "nanas",
		Name:      "invocation_seconds",
		Help:      "Function invocation latency in seconds.",
		Buckets:   prometheus.DefBuckets,
	},
	[]string{"project", "function"},
)

var dbQueriesTotal = promauto.NewCounterVec(
	prometheus.CounterOpts{
		Namespace: "nanas",
		Name:      "db_query_total",
		Help:      "Tenant database queries counted by project and result.",
	},
	[]string{"project", "result"},
)

// RecordInvocation increments the invocation counter and observes latency.
// The function label is capped to 80 characters to avoid label cardinality blowups.
func RecordInvocation(projectID, functionName, result string, dur time.Duration) {
	if len(functionName) > 80 {
		functionName = functionName[:80]
	}
	invocationsTotal.WithLabelValues(projectID, functionName, result).Inc()
	invocationSeconds.WithLabelValues(projectID, functionName).Observe(dur.Seconds())
}

// RecordDBQuery increments the tenant DB query counter.
func RecordDBQuery(projectID, result string) {
	dbQueriesTotal.WithLabelValues(projectID, result).Inc()
}

// PrometheusHTTP records method, route template, status code, and latency after each request.
func PrometheusHTTP() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		code := strconv.Itoa(c.Writer.Status())
		route := c.FullPath()
		if route == "" {
			route = "(unknown)"
		}
		reqTotal.WithLabelValues(c.Request.Method, route, code).Inc()
		reqLatency.WithLabelValues(c.Request.Method, route).Observe(time.Since(start).Seconds())
	}
}

// Handler is the Prometheus scrape endpoint (/metrics).
func Handler() gin.HandlerFunc {
	h := promhttp.Handler()
	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}
