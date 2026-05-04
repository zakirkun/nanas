// Package payload implements the small declarative transform DSL the platform
// uses for trigger payload shaping (PRD section 7) and SQL-like realtime
// subscription filters (PRD section 14, implemented as a shim in Phase 8).
//
// The DSL is intentionally tiny:
//
//   {
//     "map":    ["id","amount","customer_id"],   // optional projection
//     "filter": "amount > 0 AND status = 'open'",// optional boolean expr
//     "reduce": { "op":"sum", "field":"amount" } // optional fold (rare)
//   }
//
// The filter grammar is a subset of SQL — equality, comparison, AND/OR,
// IN, IS NULL, parentheses. Field names are dotted JSON paths (a.b.c).
// Strings use single quotes, numbers and booleans are bare.
//
// All evaluation is local: the input is a JSON-shaped Go map (or the rows of
// a CDC notification). No SQL is executed against the tenant DB.
package payload

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// Config is the JSON shape stored in `triggers.config.payload_transform`.
type Config struct {
	Map    []string `json:"map,omitempty"`
	Filter string   `json:"filter,omitempty"`
	Reduce *Reduce  `json:"reduce,omitempty"`
}

// Reduce defines a single fold over an input array. Only `sum`/`count`/`max`/
// `min`/`avg` are supported.
type Reduce struct {
	Op    string `json:"op"`
	Field string `json:"field,omitempty"`
}

// Result is the outcome of applying a Config to a payload.
type Result struct {
	// Output holds the projected payload. When the DSL is empty, Output equals
	// the original payload.
	Output map[string]any
	// Passed reports whether the filter (if any) accepted the payload. When the
	// filter is empty, Passed is always true.
	Passed bool
	// Reduced is non-nil when the Config carries a Reduce op and the payload's
	// `rows` field (or the payload itself if it is an array) has been folded.
	Reduced any
}

// Apply evaluates the DSL against the payload. Errors are only returned for
// truly malformed configurations (parse errors, unknown reduce op); a payload
// that fails the filter merely returns Passed=false, never an error.
func Apply(payload map[string]any, cfg Config) (Result, error) {
	out := payload
	if len(cfg.Map) > 0 {
		out = project(payload, cfg.Map)
	}
	passed := true
	if strings.TrimSpace(cfg.Filter) != "" {
		ok, err := evalFilter(payload, cfg.Filter)
		if err != nil {
			return Result{}, err
		}
		passed = ok
	}
	res := Result{Output: out, Passed: passed}
	if cfg.Reduce != nil {
		v, err := applyReduce(payload, *cfg.Reduce)
		if err != nil {
			return Result{}, err
		}
		res.Reduced = v
	}
	return res, nil
}

// FromJSON parses a raw JSON object (e.g. `triggers.config.payload_transform`)
// into a Config. Empty input returns the zero Config.
func FromJSON(raw []byte) (Config, error) {
	var c Config
	if len(raw) == 0 {
		return c, nil
	}
	if err := json.Unmarshal(raw, &c); err != nil {
		return c, fmt.Errorf("payload dsl: %w", err)
	}
	return c, nil
}

func project(payload map[string]any, fields []string) map[string]any {
	out := make(map[string]any, len(fields))
	for _, f := range fields {
		v, ok := getPath(payload, f)
		if !ok {
			continue
		}
		out[f] = v
	}
	return out
}

func getPath(m map[string]any, path string) (any, bool) {
	if path == "" {
		return nil, false
	}
	parts := strings.Split(path, ".")
	var cur any = m
	for _, p := range parts {
		mm, ok := cur.(map[string]any)
		if !ok {
			return nil, false
		}
		cur, ok = mm[p]
		if !ok {
			return nil, false
		}
	}
	return cur, true
}

func applyReduce(payload map[string]any, r Reduce) (any, error) {
	op := strings.ToLower(strings.TrimSpace(r.Op))
	if op == "" {
		return nil, errors.New("reduce.op required")
	}
	rows, ok := getPath(payload, "rows")
	if !ok {
		// Allow reduce over the payload itself if it's an array under "data" or
		// the top-level entry key.
		rows, _ = payload["data"]
	}
	arr, _ := rows.([]any)
	if op == "count" {
		return float64(len(arr)), nil
	}
	if r.Field == "" {
		return nil, errors.New("reduce.field required for non-count ops")
	}
	var sum float64
	var count int
	var minV, maxV *float64
	for _, row := range arr {
		mm, _ := row.(map[string]any)
		raw, ok := getPath(mm, r.Field)
		if !ok {
			continue
		}
		v, ok := toFloat(raw)
		if !ok {
			continue
		}
		sum += v
		count++
		if minV == nil || v < *minV {
			vv := v
			minV = &vv
		}
		if maxV == nil || v > *maxV {
			vv := v
			maxV = &vv
		}
	}
	switch op {
	case "sum":
		return sum, nil
	case "avg":
		if count == 0 {
			return 0.0, nil
		}
		return sum / float64(count), nil
	case "max":
		if maxV == nil {
			return nil, nil
		}
		return *maxV, nil
	case "min":
		if minV == nil {
			return nil, nil
		}
		return *minV, nil
	}
	return nil, fmt.Errorf("reduce.op %q not supported", op)
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		if f, err := n.Float64(); err == nil {
			return f, true
		}
	case string:
		if f, err := strconv.ParseFloat(n, 64); err == nil {
			return f, true
		}
	case bool:
		if n {
			return 1, true
		}
		return 0, true
	}
	return 0, false
}
