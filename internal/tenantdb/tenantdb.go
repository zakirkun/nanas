package tenantdb

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"nanas/internal/config"
	"nanas/internal/store"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func poolForProject(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID) (*pgxpool.Pool, error) {
	p, err := st.ProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if strings.ToLower(strings.TrimSpace(p.ProvisionStatus)) != "ready" || p.TenantDBName == nil {
		return nil, fmt.Errorf("tenant not ready")
	}
	host := cfg.TenantDBHost
	raw := cfg.DatabaseURL
	at := strings.Index(raw, "@")
	if at < 0 {
		return nil, fmt.Errorf("bad DATABASE_URL")
	}
	creds := strings.TrimPrefix(raw[:at], "postgres://")
	rest := raw[at+1:]
	slash := strings.Index(rest, "/")
	if slash < 0 {
		return nil, fmt.Errorf("bad DATABASE_URL tail")
	}
	hostPortOrig := rest[:slash]
	hostPort := hostPortOrig
	if host != "" {
		if strings.Contains(host, ":") {
			hostPort = host
		} else {
			if colon := strings.Index(hostPortOrig, ":"); colon >= 0 {
				hostPort = host + hostPortOrig[colon:]
			} else {
				hostPort = host + ":5432"
			}
		}
	}
	tail := rest[slash:] // "/nanas?sslmode=..."
	q := ""
	if qi := strings.Index(tail, "?"); qi >= 0 {
		q = tail[qi:]
	}
	url := fmt.Sprintf("postgres://%s@%s/%s%s", creds, hostPort, *p.TenantDBName, q)
	return pgxpool.New(ctx, url)
}

// ConnectionURL returns postgres URL for the tenant database (same rules as poolForProject).
func ConnectionURL(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID) (string, error) {
	p, err := st.ProjectByID(ctx, projectID)
	if err != nil {
		return "", err
	}
	if strings.ToLower(strings.TrimSpace(p.ProvisionStatus)) != "ready" || p.TenantDBName == nil {
		return "", fmt.Errorf("tenant not ready")
	}
	host := cfg.TenantDBHost
	raw := cfg.DatabaseURL
	at := strings.Index(raw, "@")
	if at < 0 {
		return "", fmt.Errorf("bad DATABASE_URL")
	}
	creds := strings.TrimPrefix(raw[:at], "postgres://")
	rest := raw[at+1:]
	slash := strings.Index(rest, "/")
	if slash < 0 {
		return "", fmt.Errorf("bad DATABASE_URL tail")
	}
	hostPortOrig := rest[:slash]
	hostPort := hostPortOrig
	if host != "" {
		if strings.Contains(host, ":") {
			hostPort = host
		} else {
			if colon := strings.Index(hostPortOrig, ":"); colon >= 0 {
				hostPort = host + hostPortOrig[colon:]
			} else {
				hostPort = host + ":5432"
			}
		}
	}
	tail := rest[slash:]
	q := ""
	if qi := strings.Index(tail, "?"); qi >= 0 {
		q = tail[qi:]
	}
	return fmt.Sprintf("postgres://%s@%s/%s%s", creds, hostPort, *p.TenantDBName, q), nil
}

func Query(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID, sqlText string, args []any) ([]map[string]any, pgconn.CommandTag, error) {
	pool, err := poolForProject(ctx, cfg, st, projectID)
	if err != nil {
		return nil, pgconn.CommandTag{}, err
	}
	defer pool.Close()

	trim := strings.ToLower(strings.TrimSpace(sqlText))
	if strings.Contains(trim, ";") {
		return nil, pgconn.CommandTag{}, fmt.Errorf("multiple statements blocked")
	}
	if err := validateTenantQuery(trim); err != nil {
		return nil, pgconn.CommandTag{}, err
	}

	if strings.HasPrefix(trim, "select") {
		rows, err := pool.Query(ctx, sqlText, args...)
		if err != nil {
			return nil, pgconn.CommandTag{}, err
		}
		defer rows.Close()
		var cols []string
		for _, fd := range rows.FieldDescriptions() {
			cols = append(cols, string(fd.Name))
		}
		var result []map[string]any
		for rows.Next() {
			vals, err := rows.Values()
			if err != nil {
				return nil, pgconn.CommandTag{}, err
			}
			m := map[string]any{}
			for i, col := range cols {
				m[col] = vals[i]
			}
			result = append(result, m)
		}
		return result, pgconn.CommandTag{}, rows.Err()
	}

	tag, err := pool.Exec(ctx, sqlText, args...)
	return nil, tag, err
}

var reIdent = regexp.MustCompile(`(?i)^[a-z_][a-z0-9_]*$`)

func validateTenantQuery(trim string) error {
	blocked := []string{
		"create ", "alter ", "drop ", "truncate ", "grant ", "revoke ",
		"copy ", "\\copy", "vacuum", "analyze", "listen ", "notify ",
	}
	for _, prefix := range blocked {
		if strings.HasPrefix(trim, prefix) || strings.Contains(trim, " "+strings.TrimSpace(prefix)+" ") {
			return fmt.Errorf("statement not allowed on query endpoint")
		}
	}
	allowed := []string{"select", "insert", "update", "delete"}
	for _, prefix := range allowed {
		if strings.HasPrefix(trim, prefix) {
			return nil
		}
	}
	return fmt.Errorf("only select/insert/update/delete statements allowed")
}

// ColumnInfo describes a table column captured from the tenant information_schema.
type ColumnInfo struct {
	Name     string
	DataType string
	Nullable bool
}

// TableColumns returns the columns of a tenant table from information_schema.columns.
func TableColumns(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID, table string) ([]ColumnInfo, error) {
	t := strings.TrimSpace(table)
	if !reIdent.MatchString(t) {
		return nil, fmt.Errorf("invalid table name")
	}
	pool, err := poolForProject(ctx, cfg, st, projectID)
	if err != nil {
		return nil, err
	}
	defer pool.Close()
	rows, err := pool.Query(ctx,
		`SELECT column_name, data_type, is_nullable='YES'
		 FROM information_schema.columns
		 WHERE table_schema='public' AND table_name=$1
		 ORDER BY ordinal_position`, t)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ColumnInfo
	for rows.Next() {
		var c ColumnInfo
		if err := rows.Scan(&c.Name, &c.DataType, &c.Nullable); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// SelectAllowedTable runs SELECT limited to identifier table name validated against allowlist JSON array.
func SelectAllowedTable(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID, table string, allowlistJSON json.RawMessage, limit int) ([]map[string]any, error) {
	t := strings.TrimSpace(table)
	if !reIdent.MatchString(t) {
		return nil, fmt.Errorf("invalid table name")
	}
	var allowed []string
	if err := json.Unmarshal(allowlistJSON, &allowed); err != nil || len(allowed) == 0 {
		return nil, fmt.Errorf("allowlist empty or invalid")
	}
	ok := false
	for _, a := range allowed {
		if strings.EqualFold(strings.TrimSpace(a), t) {
			ok = true
			break
		}
	}
	if !ok {
		return nil, fmt.Errorf("table not in allowlist")
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := fmt.Sprintf(`SELECT * FROM "%s" LIMIT %d`, t, limit)
	rows, _, err := Query(ctx, cfg, st, projectID, q, nil)
	return rows, err
}

// ExplainAnalyzeJSON runs EXPLAIN for a SELECT-only statement (caller must whitelist).
func ExplainAnalyzeJSON(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID, selectSQL string, args []any) (json.RawMessage, error) {
	trim := strings.ToLower(strings.TrimSpace(selectSQL))
	if strings.Contains(trim, ";") || !strings.HasPrefix(trim, "select ") {
		return nil, fmt.Errorf("only single select for explain")
	}
	pool, err := poolForProject(ctx, cfg, st, projectID)
	if err != nil {
		return nil, err
	}
	defer pool.Close()
	explain := "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + selectSQL
	rows, err := pool.Query(ctx, explain, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("no explain row")
	}
	var raw []byte
	if err := rows.Scan(&raw); err != nil {
		return nil, err
	}
	return json.RawMessage(raw), rows.Err()
}
