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

// normalizeTenantQuerySQL trims whitespace and trailing semicolons so a single statement
// sent as "SELECT 1;" is allowed; semicolons elsewhere still imply multiple statements.
func normalizeTenantQuerySQL(sqlText string) (string, error) {
	s := strings.TrimSpace(sqlText)
	for strings.HasSuffix(s, ";") {
		s = strings.TrimSpace(strings.TrimSuffix(s, ";"))
	}
	if s == "" {
		return "", fmt.Errorf("empty sql")
	}
	if strings.Contains(s, ";") {
		return "", fmt.Errorf("multiple statements blocked")
	}
	return s, nil
}

func Query(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID, sqlText string, args []any) ([]map[string]any, pgconn.CommandTag, error) {
	pool, err := poolForProject(ctx, cfg, st, projectID)
	if err != nil {
		return nil, pgconn.CommandTag{}, err
	}
	defer pool.Close()

	sqlNorm, err := normalizeTenantQuerySQL(sqlText)
	if err != nil {
		return nil, pgconn.CommandTag{}, err
	}
	trim := strings.ToLower(sqlNorm)
	if err := validateTenantQuery(trim); err != nil {
		return nil, pgconn.CommandTag{}, err
	}

	if strings.HasPrefix(trim, "select") {
		rows, err := pool.Query(ctx, sqlNorm, args...)
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

	tag, err := pool.Exec(ctx, sqlNorm, args...)
	return nil, tag, err
}

var reIdent = regexp.MustCompile(`(?i)^[a-z_][a-z0-9_]*$`)

// ValidSQLIdentifier matches unquoted Postgres identifiers used across tenant APIs.
func ValidSQLIdentifier(s string) bool {
	return reIdent.MatchString(strings.TrimSpace(s))
}

// NormalizeAllowlistTables trims, validates identifiers, and de-duplicates case-insensitively.
func NormalizeAllowlistTables(in []string) ([]string, error) {
	seen := map[string]struct{}{}
	var out []string
	for _, raw := range in {
		t := strings.TrimSpace(raw)
		if t == "" {
			continue
		}
		if !ValidSQLIdentifier(t) {
			return nil, fmt.Errorf("invalid table name %q", t)
		}
		key := strings.ToLower(t)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, t)
	}
	return out, nil
}

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

// ListPublicBaseTables returns physical table names in public schema that match safe identifier rules.
func ListPublicBaseTables(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID) ([]string, error) {
	pool, err := poolForProject(ctx, cfg, st, projectID)
	if err != nil {
		return nil, err
	}
	defer pool.Close()
	rows, err := pool.Query(ctx,
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		 ORDER BY table_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		if ValidSQLIdentifier(name) {
			out = append(out, name)
		}
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
	sqlNorm, err := normalizeTenantQuerySQL(selectSQL)
	if err != nil {
		return nil, err
	}
	trim := strings.ToLower(sqlNorm)
	if !strings.HasPrefix(trim, "select") {
		return nil, fmt.Errorf("only single select for explain")
	}
	pool, err := poolForProject(ctx, cfg, st, projectID)
	if err != nil {
		return nil, err
	}
	defer pool.Close()
	explain := "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sqlNorm
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

// ListDatabaseNames returns non-template databases visible from the tenant connection.
func ListDatabaseNames(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID) ([]string, error) {
	pool, err := poolForProject(ctx, cfg, st, projectID)
	if err != nil {
		return nil, err
	}
	defer pool.Close()
	rows, err := pool.Query(ctx,
		`SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

// ValidateDatabaseAllowlist keeps only databases that exist on the cluster (case-insensitive match).
func ValidateDatabaseAllowlist(requested []string, cluster []string) ([]string, error) {
	clusterByLower := make(map[string]string, len(cluster))
	for _, c := range cluster {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		clusterByLower[strings.ToLower(c)] = c
	}
	seen := map[string]struct{}{}
	var out []string
	for _, raw := range requested {
		r := strings.TrimSpace(raw)
		if r == "" {
			continue
		}
		canonical, ok := clusterByLower[strings.ToLower(r)]
		if !ok {
			return nil, fmt.Errorf("database %q not found on cluster", r)
		}
		key := strings.ToLower(canonical)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, canonical)
	}
	return out, nil
}
