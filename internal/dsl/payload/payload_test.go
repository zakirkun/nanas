package payload

import (
	"testing"
)

func TestApplyMap(t *testing.T) {
	in := map[string]any{
		"id":          float64(1),
		"amount":      float64(99),
		"customer_id": "c1",
		"secret":      "do-not-leak",
	}
	r, err := Apply(in, Config{Map: []string{"id", "amount"}})
	if err != nil {
		t.Fatal(err)
	}
	if !r.Passed {
		t.Fatalf("expected passed=true with no filter")
	}
	if r.Output["id"] != float64(1) || r.Output["amount"] != float64(99) {
		t.Fatalf("projection wrong: %v", r.Output)
	}
	if _, ok := r.Output["secret"]; ok {
		t.Fatalf("secret leaked through projection")
	}
}

func TestApplyFilter(t *testing.T) {
	cases := []struct {
		name   string
		filter string
		in     map[string]any
		passed bool
	}{
		{"gt true", "amount > 0", map[string]any{"amount": float64(5)}, true},
		{"gt false", "amount > 100", map[string]any{"amount": float64(5)}, false},
		{"and true", "amount > 0 AND status = 'open'", map[string]any{"amount": 5.0, "status": "open"}, true},
		{"and false", "amount > 0 AND status = 'open'", map[string]any{"amount": 5.0, "status": "closed"}, false},
		{"or true", "amount = 0 OR status = 'open'", map[string]any{"amount": 5.0, "status": "open"}, true},
		{"in true", "status IN ('open','pending')", map[string]any{"status": "pending"}, true},
		{"in false", "status IN ('open','pending')", map[string]any{"status": "closed"}, false},
		{"not in", "status NOT IN ('closed','archived')", map[string]any{"status": "open"}, true},
		{"is null", "deleted_at IS NULL", map[string]any{"deleted_at": nil}, true},
		{"is not null", "deleted_at IS NOT NULL", map[string]any{"deleted_at": "2026-01-01"}, true},
		{"nested", "user.role = 'admin'", map[string]any{"user": map[string]any{"role": "admin"}}, true},
		{"parens", "(amount > 0 OR amount = 0) AND status = 'open'", map[string]any{"amount": 0.0, "status": "open"}, true},
		{"not", "NOT (status = 'closed')", map[string]any{"status": "open"}, true},
		{"neq", "status != 'closed'", map[string]any{"status": "open"}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r, err := Apply(tc.in, Config{Filter: tc.filter})
			if err != nil {
				t.Fatal(err)
			}
			if r.Passed != tc.passed {
				t.Fatalf("filter %q on %v: got passed=%v want %v", tc.filter, tc.in, r.Passed, tc.passed)
			}
		})
	}
}

func TestApplyReduce(t *testing.T) {
	in := map[string]any{
		"rows": []any{
			map[string]any{"amount": float64(10)},
			map[string]any{"amount": float64(20)},
			map[string]any{"amount": float64(30)},
		},
	}
	cases := []struct {
		op     string
		want   float64
		fields string
	}{
		{"sum", 60, "amount"},
		{"avg", 20, "amount"},
		{"max", 30, "amount"},
		{"min", 10, "amount"},
		{"count", 3, ""},
	}
	for _, tc := range cases {
		t.Run(tc.op, func(t *testing.T) {
			r, err := Apply(in, Config{Reduce: &Reduce{Op: tc.op, Field: tc.fields}})
			if err != nil {
				t.Fatal(err)
			}
			got, ok := r.Reduced.(float64)
			if !ok {
				t.Fatalf("reduce %s: not a number: %T", tc.op, r.Reduced)
			}
			if got != tc.want {
				t.Fatalf("reduce %s: got %v want %v", tc.op, got, tc.want)
			}
		})
	}
}

func TestFilterMalformed(t *testing.T) {
	bad := []string{
		"amount >",
		"NOT IN (1)",
		"(unbalanced",
		"x IS NOT 'value'",
	}
	for _, b := range bad {
		if _, err := Apply(map[string]any{"x": 1.0}, Config{Filter: b}); err == nil {
			t.Fatalf("expected parse error for %q", b)
		}
	}
}
