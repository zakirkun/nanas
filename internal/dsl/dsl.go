package dsl

import (
	"fmt"
	"strings"
)

func MapRow(row map[string]any, fields []string) map[string]any {
	out := map[string]any{}
	for _, f := range fields {
		if v, ok := row[f]; ok {
			out[f] = v
		}
	}
	return out
}

func FilterNumeric(row map[string]any, expr string) (bool, error) {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return true, nil
	}
	// MVP: very small guard — only allow simple "field op number" with known field names [a-z_]
	parts := strings.Fields(expr)
	if len(parts) != 3 {
		return false, fmt.Errorf("unsupported filter")
	}
	field := parts[0]
	op := parts[1]
	var num float64
	if _, err := fmt.Sscanf(parts[2], "%f", &num); err != nil {
		return false, err
	}
	v, ok := row[field]
	if !ok {
		return false, nil
	}
	switch n := v.(type) {
	case float64:
		return cmp(n, op, num), nil
	case int32:
		return cmp(float64(n), op, num), nil
	case int64:
		return cmp(float64(n), op, num), nil
	case int:
		return cmp(float64(n), op, num), nil
	default:
		return false, nil
	}
}

func cmp(a float64, op string, b float64) bool {
	switch op {
	case ">":
		return a > b
	case "<":
		return a < b
	case ">=":
		return a >= b
	case "<=":
		return a <= b
	case "==":
		return a == b
	default:
		return false
	}
}

func ReduceSum(rows []map[string]any, field string) float64 {
	var s float64
	for _, row := range rows {
		switch n := row[field].(type) {
		case float64:
			s += n
		case int:
			s += float64(n)
		case int64:
			s += float64(n)
		}
	}
	return s
}
