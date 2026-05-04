package telemetry

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestMemSpanStoreAppendList(t *testing.T) {
	s := NewMemSpanStore(8)
	pid := uuid.New()
	for i := 0; i < 5; i++ {
		s.Append(SpanRecord{
			TraceID:   "t" + uuid.NewString()[:6],
			SpanID:    uuid.NewString()[:6],
			Name:      "x",
			StartedAt: time.Now(),
			EndedAt:   time.Now(),
			ProjectID: &pid,
		})
	}
	if got := s.List(&pid, 10); len(got) != 5 {
		t.Fatalf("expected 5 traces, got %d", len(got))
	}
	if got := s.List(nil, 10); len(got) != 5 {
		t.Fatalf("expected 5 traces (nil project filter), got %d", len(got))
	}
}

func TestMemSpanStoreRingBuffer(t *testing.T) {
	s := NewMemSpanStore(3)
	for i := 0; i < 6; i++ {
		s.Append(SpanRecord{TraceID: "t", SpanID: "s"})
	}
	got := s.Get("t")
	if len(got) != 3 {
		t.Fatalf("ring buffer kept %d spans, want 3", len(got))
	}
}
