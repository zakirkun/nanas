package realtime

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"nanas/internal/dsl/payload"

	"github.com/google/uuid"
	gws "github.com/gorilla/websocket"
)

// QueryMode controls whether the subscriber receives full row payloads or just
// the diff (only changed fields). PRD section 14 names these `full` and `diff`.
type QueryMode string

const (
	QueryModeDiff QueryMode = "diff"
	QueryModeFull QueryMode = "full"
)

// QuerySub is one SELECT-style subscription bound to a single websocket conn.
// We store it on the Hub so CDC notifications can route events to matching subs.
type QuerySub struct {
	ID      string
	Project uuid.UUID
	Conn    *gws.Conn
	Table   string
	Filter  string
	Mode    QueryMode
}

// queryStore keeps per-project query subscriptions. Lookups are O(N) over the
// project's subs; that is fine for small N, and the manager keeps subs sorted
// by table to allow fast filtering when N grows.
type queryStore struct {
	mu   sync.Mutex
	byID map[string]*QuerySub          // global lookup
	byPT map[string]map[string]*QuerySub // project_id -> table -> subs (key=sub.ID)
}

func newQueryStore() *queryStore {
	return &queryStore{
		byID: map[string]*QuerySub{},
		byPT: map[string]map[string]*QuerySub{},
	}
}

func (q *queryStore) add(sub *QuerySub) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.byID[sub.ID] = sub
	k := sub.Project.String() + ":" + sub.Table
	if q.byPT[k] == nil {
		q.byPT[k] = map[string]*QuerySub{}
	}
	q.byPT[k][sub.ID] = sub
}

func (q *queryStore) remove(id string) {
	q.mu.Lock()
	defer q.mu.Unlock()
	sub, ok := q.byID[id]
	if !ok {
		return
	}
	delete(q.byID, id)
	k := sub.Project.String() + ":" + sub.Table
	if set := q.byPT[k]; set != nil {
		delete(set, id)
		if len(set) == 0 {
			delete(q.byPT, k)
		}
	}
}

func (q *queryStore) removeByConn(conn *gws.Conn) {
	q.mu.Lock()
	var ids []string
	for id, sub := range q.byID {
		if sub.Conn == conn {
			ids = append(ids, id)
		}
	}
	q.mu.Unlock()
	for _, id := range ids {
		q.remove(id)
	}
}

func (q *queryStore) forTable(pid uuid.UUID, table string) []*QuerySub {
	q.mu.Lock()
	defer q.mu.Unlock()
	set := q.byPT[pid.String()+":"+table]
	out := make([]*QuerySub, 0, len(set))
	for _, sub := range set {
		out = append(out, sub)
	}
	return out
}

// QueryParseResult is the parser output for SELECT-style subscription queries.
type QueryParseResult struct {
	Table  string
	Filter string
}

var (
	reSelect = regexp.MustCompile(`(?is)^\s*SELECT\s+\*\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:WHERE\s+(.+?))?\s*;?\s*$`)
)

// ParseQuery accepts only `SELECT * FROM <ident> [WHERE …]`. Joins, ordering,
// and projections are intentionally rejected — this is a watch-style endpoint
// rather than ad-hoc SQL.
func ParseQuery(q string) (QueryParseResult, error) {
	m := reSelect.FindStringSubmatch(strings.TrimSpace(q))
	if m == nil {
		return QueryParseResult{}, fmt.Errorf("realtime: query must be `SELECT * FROM <table> [WHERE …]`")
	}
	res := QueryParseResult{Table: m[1]}
	if len(m) > 2 {
		res.Filter = strings.TrimSpace(m[2])
	}
	if res.Filter != "" {
		// Validate filter is parseable using the DSL evaluator. We discard the
		// result; the actual evaluation runs per-event.
		if _, err := payload.Apply(map[string]any{}, payload.Config{Filter: res.Filter}); err != nil {
			return QueryParseResult{}, err
		}
	}
	return res, nil
}

// BroadcastTableEvent fans out a CDC-style event to all SELECT subs matching
// the project+table whose filter accepts the row. The dispatched payload
// follows the PRD shape: `{op:"event", subscription_id, type, rows, timestamp}`.
func (h *Hub) BroadcastTableEvent(pid uuid.UUID, table string, op string, newRow, oldRow map[string]any) {
	if h.queries == nil {
		return
	}
	subs := h.queries.forTable(pid, table)
	if len(subs) == 0 {
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	row := newRow
	if row == nil {
		row = oldRow
	}
	for _, sub := range subs {
		if sub.Filter != "" {
			passed, _ := evalQueryFilter(sub.Filter, row)
			if !passed {
				continue
			}
		}
		out := map[string]any{
			"op":              "event",
			"subscription_id": sub.ID,
			"type":            strings.ToLower(op),
			"rows":            []any{row},
			"timestamp":       now,
		}
		if sub.Mode == QueryModeDiff && newRow != nil && oldRow != nil {
			diff := diffRows(oldRow, newRow)
			out["rows"] = []any{diff}
		}
		raw, _ := json.Marshal(out)
		_ = sub.Conn.WriteMessage(gws.TextMessage, raw)
	}
}

func evalQueryFilter(filter string, row map[string]any) (bool, error) {
	res, err := payload.Apply(row, payload.Config{Filter: filter})
	if err != nil {
		return false, err
	}
	return res.Passed, nil
}

func diffRows(oldRow, newRow map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range newRow {
		if !equalAny(oldRow[k], v) {
			out[k] = v
		}
	}
	return out
}

func equalAny(a, b any) bool {
	ab, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(ab) == string(bb)
}
