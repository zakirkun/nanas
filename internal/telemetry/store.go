package telemetry

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// SpanRecord captures a single span in a shape suitable for the UI flamegraph.
// We keep this independent of the OpenTelemetry SDK so the trace store can be
// populated either from an OTLP exporter, the Gin middleware, or manually
// instrumented code paths.
type SpanRecord struct {
	TraceID      string         `json:"trace_id"`
	SpanID       string         `json:"span_id"`
	ParentSpanID string         `json:"parent_span_id,omitempty"`
	Name         string         `json:"name"`
	Kind         string         `json:"kind"`
	StartedAt    time.Time      `json:"started_at"`
	EndedAt      time.Time      `json:"ended_at"`
	DurationNS   int64          `json:"duration_ns"`
	StatusCode   string         `json:"status_code"`
	Attributes   map[string]any `json:"attributes"`
	ProjectID    *uuid.UUID     `json:"project_id,omitempty"`
}

// SpanStore is the abstraction the API layer talks to. The default impl is an
// in-memory ring buffer; a Postgres-backed version is plugged in when
// `TRACE_STORE=db` to give operators an opt-in persistence option without
// adding a hard dependency on Loki/Tempo.
type SpanStore interface {
	Append(SpanRecord)
	List(projectID *uuid.UUID, limit int) []SpanRecord
	Get(traceID string) []SpanRecord
}

// memSpanStore is a simple ring buffer keyed by insertion order. Reads scan the
// buffer; for the MVP this is plenty (we cap at ~10k spans which is several
// minutes of traffic on a typical project).
type memSpanStore struct {
	mu      sync.RWMutex
	spans   []SpanRecord
	cap     int
	headIdx int
}

// NewMemSpanStore returns an in-memory store with the given capacity.
// Capacity defaults to 10_000 if non-positive.
func NewMemSpanStore(capacity int) SpanStore {
	if capacity <= 0 {
		capacity = 10_000
	}
	return &memSpanStore{spans: make([]SpanRecord, 0, capacity), cap: capacity}
}

func (m *memSpanStore) Append(r SpanRecord) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.spans) < m.cap {
		m.spans = append(m.spans, r)
		return
	}
	m.spans[m.headIdx] = r
	m.headIdx = (m.headIdx + 1) % m.cap
}

func (m *memSpanStore) List(projectID *uuid.UUID, limit int) []SpanRecord {
	if limit <= 0 {
		limit = 100
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	// Walk from newest to oldest. We collect at most one row per trace so the
	// caller renders a "list of traces" rather than a flat span list.
	seen := map[string]bool{}
	out := make([]SpanRecord, 0, limit)
	for i := len(m.spans) - 1; i >= 0 && len(out) < limit; i-- {
		s := m.spans[i]
		if projectID != nil && (s.ProjectID == nil || *s.ProjectID != *projectID) {
			continue
		}
		if seen[s.TraceID] {
			continue
		}
		seen[s.TraceID] = true
		out = append(out, s)
	}
	return out
}

func (m *memSpanStore) Get(traceID string) []SpanRecord {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]SpanRecord, 0, 8)
	for _, s := range m.spans {
		if s.TraceID == traceID {
			out = append(out, s)
		}
	}
	return out
}

// Default is the global span store used by the Gin middleware below. main.go
// can swap this out for a DB-backed store.
var Default SpanStore = NewMemSpanStore(10_000)
