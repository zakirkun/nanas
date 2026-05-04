// Package cdc starts per-project PostgreSQL LISTEN/NOTIFY listeners that forward
// row-level events to the trigger dispatch pipeline and realtime hub.
package cdc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	"nanas/internal/config"
	"nanas/internal/natsbus"
	"nanas/internal/realtime"
	"nanas/internal/store"
	"nanas/internal/tenantdb"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const NotifyChannel = "nanas_cdc"
const triggerFnName = "nanas_cdc_notify"

var reIdent = regexp.MustCompile(`(?i)^[a-z_][a-z0-9_]*$`)

// Manager keeps one listener per project. Listeners are created on demand and torn down
// when no subscriptions remain.
type Manager struct {
	cfg config.Config
	st  *store.Store
	hub *realtime.Hub
	bus *natsbus.Bus

	mu        sync.Mutex
	listeners map[uuid.UUID]context.CancelFunc
}

func NewManager(cfg config.Config, st *store.Store, hub *realtime.Hub, bus *natsbus.Bus) *Manager {
	return &Manager{
		cfg:       cfg,
		st:        st,
		hub:       hub,
		bus:       bus,
		listeners: map[uuid.UUID]context.CancelFunc{},
	}
}

// Bootstrap starts listeners for every project that already has subscriptions.
func (m *Manager) Bootstrap(ctx context.Context) {
	ids, err := m.st.ProjectIDsWithCDC(ctx)
	if err != nil {
		slog.Warn("cdc bootstrap", "err", err)
		return
	}
	for _, id := range ids {
		m.Ensure(id)
	}
}

// Ensure starts a listener for the given project if one is not already running.
func (m *Manager) Ensure(projectID uuid.UUID) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.listeners[projectID]; ok {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.listeners[projectID] = cancel
	go m.run(ctx, projectID)
}

// Stop tears down a listener for the given project. Safe to call when no listener exists.
func (m *Manager) Stop(projectID uuid.UUID) {
	m.mu.Lock()
	cancel := m.listeners[projectID]
	delete(m.listeners, projectID)
	m.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

// Close stops all listeners.
func (m *Manager) Close() {
	m.mu.Lock()
	for _, cancel := range m.listeners {
		cancel()
	}
	m.listeners = map[uuid.UUID]context.CancelFunc{}
	m.mu.Unlock()
}

// InstallTriggerForTable installs (idempotent) a row-level trigger on the tenant table
// that calls the shared nanas_cdc_notify function emitting JSON via pg_notify.
func (m *Manager) InstallTriggerForTable(ctx context.Context, projectID uuid.UUID, table string) error {
	t := strings.TrimSpace(table)
	if !reIdent.MatchString(t) {
		return store.ErrCDCInvalidTable
	}
	url, err := tenantdb.ConnectionURL(ctx, m.cfg, m.st, projectID)
	if err != nil {
		return err
	}
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)

	createFn := `CREATE OR REPLACE FUNCTION ` + triggerFnName + `() RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'new', to_jsonb(NEW),
    'old', to_jsonb(OLD),
    'ts', extract(epoch from now())
  );
  PERFORM pg_notify('` + NotifyChannel + `', payload::text);
  RETURN COALESCE(NEW, OLD);
END
$$ LANGUAGE plpgsql;`

	if _, err := conn.Exec(ctx, createFn); err != nil {
		return err
	}

	triggerName := fmt.Sprintf("nanas_cdc_%s", t)
	dropTrig := fmt.Sprintf(`DROP TRIGGER IF EXISTS %q ON %q`, triggerName, t)
	createTrig := fmt.Sprintf(`CREATE TRIGGER %q AFTER INSERT OR UPDATE OR DELETE ON %q FOR EACH ROW EXECUTE FUNCTION %s()`, triggerName, t, triggerFnName)

	if _, err := conn.Exec(ctx, dropTrig); err != nil {
		return err
	}
	if _, err := conn.Exec(ctx, createTrig); err != nil {
		return err
	}
	return nil
}

func (m *Manager) run(ctx context.Context, projectID uuid.UUID) {
	backoff := time.Second
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		if err := m.listen(ctx, projectID); err != nil {
			if errors.Is(err, context.Canceled) {
				return
			}
			slog.Warn("cdc listen", "project", projectID, "err", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < 30*time.Second {
				backoff *= 2
			}
			continue
		}
		backoff = time.Second
	}
}

func (m *Manager) listen(ctx context.Context, projectID uuid.UUID) error {
	url, err := tenantdb.ConnectionURL(ctx, m.cfg, m.st, projectID)
	if err != nil {
		return err
	}
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		return err
	}
	defer conn.Close(context.Background())

	if _, err := conn.Exec(ctx, fmt.Sprintf(`LISTEN %s`, NotifyChannel)); err != nil {
		return err
	}
	for {
		notif, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}
		var payload map[string]any
		if json.Unmarshal([]byte(notif.Payload), &payload) != nil {
			continue
		}
		table, _ := payload["table"].(string)
		if strings.TrimSpace(table) == "" {
			continue
		}
		// Phase 8 — also route the row to SELECT-style realtime subscribers.
		newRow, _ := payload["new"].(map[string]any)
		oldRow, _ := payload["old"].(map[string]any)
		opStr, _ := payload["op"].(string)
		m.hub.BroadcastTableEvent(projectID, table, opStr, newRow, oldRow)

		subs, err := m.st.CDCSubscriptionsForLookup(ctx, projectID, table)
		if err != nil || len(subs) == 0 {
			continue
		}
		for _, sub := range subs {
			out := map[string]any{
				"project_id":  projectID.String(),
				"trigger_id":  sub.ID.String(),
				"function_id": sub.FunctionID.String(),
				"type":        "cdc",
				"table":       table,
				"op":          payload["op"],
				"new":         payload["new"],
				"old":         payload["old"],
				"observed_at": payload["ts"],
			}
			if m.bus != nil {
				_ = m.bus.PublishTriggerDispatch(ctx, out)
			}
			m.hub.Broadcast(projectID, "cdc", out)
		}
	}
}
