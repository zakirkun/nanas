package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) Pool() *pgxpool.Pool { return s.pool }

type User struct {
	ID           uuid.UUID
	Email        string
	Role         string
	PlatformRole string
	CreatedAt    time.Time
}

// CreateUser inserts a new user. The first user inserted is automatically promoted to platform_role=super_admin.
func (s *Store) CreateUser(ctx context.Context, email, passwordHash, role string) (User, error) {
	var u User
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var existing int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&existing); err != nil {
		return User{}, err
	}
	platformRole := "user"
	if existing == 0 {
		platformRole = "super_admin"
	}

	err = tx.QueryRow(ctx,
		`INSERT INTO users(email,password_hash,role,platform_role) VALUES($1,$2,$3,$4)
		 RETURNING id,email,role,platform_role,created_at`,
		email, passwordHash, role, platformRole,
	).Scan(&u.ID, &u.Email, &u.Role, &u.PlatformRole, &u.CreatedAt)
	if err != nil {
		return User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return u, nil
}

func (s *Store) UserByEmail(ctx context.Context, email string) (User, string, error) {
	var u User
	var ph string
	err := s.pool.QueryRow(ctx,
		`SELECT id,email,role,COALESCE(platform_role,'user'),created_at,password_hash FROM users WHERE lower(email)=lower($1)`, email).
		Scan(&u.ID, &u.Email, &u.Role, &u.PlatformRole, &u.CreatedAt, &ph)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", pgx.ErrNoRows
	}
	return u, ph, err
}

func (s *Store) UserByID(ctx context.Context, id uuid.UUID) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`SELECT id,email,role,COALESCE(platform_role,'user'),created_at FROM users WHERE id=$1`, id).
		Scan(&u.ID, &u.Email, &u.Role, &u.PlatformRole, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, pgx.ErrNoRows
	}
	return u, err
}

func (s *Store) UpdateUserPlatformRole(ctx context.Context, id uuid.UUID, role string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET platform_role=$2 WHERE id=$1`, id, role)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *Store) ListUsers(ctx context.Context, limit, offset int32) ([]User, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id,email,role,COALESCE(platform_role,'user'),created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
		limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.PlatformRole, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) ListProjectsAll(ctx context.Context, limit, offset int32) ([]Project, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id,name,owner_id,region,slug,tenant_db_name,minio_bucket,provision_status,provision_error,COALESCE(disabled,false),created_at
		 FROM projects ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.OwnerID, &p.Region, &p.Slug, &p.TenantDBName, &p.MinioBucket,
			&p.ProvisionStatus, &p.ProvisionError, &p.Disabled, &p.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

func (s *Store) SetProjectDisabled(ctx context.Context, id uuid.UUID, disabled bool) error {
	tag, err := s.pool.Exec(ctx, `UPDATE projects SET disabled=$2 WHERE id=$1`, id, disabled)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *Store) ProjectIsDisabled(ctx context.Context, id uuid.UUID) (bool, error) {
	var disabled bool
	err := s.pool.QueryRow(ctx, `SELECT COALESCE(disabled,false) FROM projects WHERE id=$1`, id).Scan(&disabled)
	return disabled, err
}

type Project struct {
	ID              uuid.UUID
	Name            string
	OwnerID         uuid.UUID
	Region          string
	Slug            *string
	TenantDBName    *string
	MinioBucket     *string
	ProvisionStatus string
	ProvisionError  *string
	Disabled        bool
	CreatedAt       time.Time
}

func (s *Store) InsertProject(ctx context.Context, owner uuid.UUID, name, region string) (Project, error) {
	slug := slugify(name)
	var p Project
	err := s.pool.QueryRow(ctx,
		`INSERT INTO projects(name,owner_id,region,slug,provision_status) VALUES($1,$2,$3,$4,'pending')
		 RETURNING id,name,owner_id,region,slug,tenant_db_name,minio_bucket,provision_status,provision_error,COALESCE(disabled,false),created_at`,
		name, owner, region, slug,
	).Scan(&p.ID, &p.Name, &p.OwnerID, &p.Region, &p.Slug, &p.TenantDBName, &p.MinioBucket,
		&p.ProvisionStatus, &p.ProvisionError, &p.Disabled, &p.CreatedAt)
	return p, err
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		case r == ' ' || r == '-' || r == '_':
			if !prevDash && b.Len() > 0 {
				b.WriteByte('-')
				prevDash = true
			}
		}
	}
	out := strings.TrimSuffix(b.String(), "-")
	if out == "" {
		out = "project"
	}
	if len(out) > 48 {
		out = out[:48]
	}
	return out
}

func (s *Store) UpdateProjectProvisioning(ctx context.Context, id uuid.UUID, status string, tenantDB, bucket *string, errMsg *string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE projects SET provision_status=$2, tenant_db_name=COALESCE($3,tenant_db_name),
		  minio_bucket=COALESCE($4,minio_bucket), provision_error=$5 WHERE id=$1`,
		id, status, tenantDB, bucket, errMsg)
	return err
}

func (s *Store) ProjectByID(ctx context.Context, id uuid.UUID) (Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx,
		`SELECT id,name,owner_id,region,slug,tenant_db_name,minio_bucket,provision_status,provision_error,COALESCE(disabled,false),created_at FROM projects WHERE id=$1`,
		id,
	).Scan(&p.ID, &p.Name, &p.OwnerID, &p.Region, &p.Slug, &p.TenantDBName, &p.MinioBucket,
		&p.ProvisionStatus, &p.ProvisionError, &p.Disabled, &p.CreatedAt)
	return p, err
}

func (s *Store) ProjectBySlug(ctx context.Context, slug string) (Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx,
		`SELECT id,name,owner_id,region,slug,tenant_db_name,minio_bucket,provision_status,provision_error,COALESCE(disabled,false),created_at FROM projects WHERE slug=$1`,
		strings.TrimSpace(strings.ToLower(slug)),
	).Scan(&p.ID, &p.Name, &p.OwnerID, &p.Region, &p.Slug, &p.TenantDBName, &p.MinioBucket,
		&p.ProvisionStatus, &p.ProvisionError, &p.Disabled, &p.CreatedAt)
	return p, err
}

func (s *Store) ProjectsByOwner(ctx context.Context, owner uuid.UUID) ([]Project, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id,name,owner_id,region,slug,tenant_db_name,minio_bucket,provision_status,provision_error,COALESCE(disabled,false),created_at FROM projects WHERE owner_id=$1 ORDER BY created_at`,
		owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.OwnerID, &p.Region, &p.Slug, &p.TenantDBName, &p.MinioBucket,
			&p.ProvisionStatus, &p.ProvisionError, &p.Disabled, &p.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

func DigestAPIKey(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(sum[:])
}

type APIKeyRecord struct {
	ID        uuid.UUID
	ProjectID uuid.UUID
	KeyDigest string
	Role      string
	Name      string
	QuotaRPM  *int
	Revoked   *time.Time
}

func (s *Store) CreateAPIKey(ctx context.Context, projectID uuid.UUID, role, name, plainKey string) (APIKeyRecord, error) {
	d := DigestAPIKey(plainKey)
	var r APIKeyRecord
	err := s.pool.QueryRow(ctx,
		`INSERT INTO api_keys(project_id,key_hash,role,name) VALUES($1,$2,$3,$4)
		 RETURNING id,project_id,key_hash,role,name,quota_rpm,revoked_at`,
		projectID, d, role, name,
	).Scan(&r.ID, &r.ProjectID, &r.KeyDigest, &r.Role, &r.Name, &r.QuotaRPM, &r.Revoked)
	r.KeyDigest = d
	return r, err
}

func (s *Store) ResolveAPIKey(ctx context.Context, plain string) (APIKeyRecord, error) {
	d := DigestAPIKey(plain)
	var r APIKeyRecord
	err := s.pool.QueryRow(ctx,
		`SELECT id,project_id,key_hash,role,name,quota_rpm,revoked_at FROM api_keys WHERE key_hash=$1 AND revoked_at IS NULL`, d,
	).Scan(&r.ID, &r.ProjectID, &r.KeyDigest, &r.Role, &r.Name, &r.QuotaRPM, &r.Revoked)
	return r, err
}

// SetAPIKeyQuota sets the per-key quota in requests-per-minute. Pass nil to inherit project quota.
func (s *Store) SetAPIKeyQuota(ctx context.Context, projectID, keyID uuid.UUID, quotaRPM *int) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE api_keys SET quota_rpm=$3 WHERE id=$1 AND project_id=$2`,
		keyID, projectID, quotaRPM)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *Store) RevokeAPIKey(ctx context.Context, projectID, keyID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND project_id=$2 AND revoked_at IS NULL`,
		keyID, projectID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

type APIKeyListRow struct {
	ID        uuid.UUID
	Role      string
	Name      string
	QuotaRPM  *int
	Revoked   *time.Time
	CreatedAt time.Time
}

func (s *Store) ListAPIKeys(ctx context.Context, projectID uuid.UUID) ([]APIKeyListRow, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, role, name, quota_rpm, revoked_at, created_at FROM api_keys WHERE project_id=$1 ORDER BY created_at DESC`,
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []APIKeyListRow
	for rows.Next() {
		var r APIKeyListRow
		if err := rows.Scan(&r.ID, &r.Role, &r.Name, &r.QuotaRPM, &r.Revoked, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) GrantProjectPermission(ctx context.Context, projectID, subject uuid.UUID, role, resource string) error {
	if resource == "" {
		resource = "project"
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO project_permissions(project_id,subject_id,role,resource) VALUES($1,$2,$3,$4)
		 ON CONFLICT (project_id,subject_id,resource) DO UPDATE SET role=EXCLUDED.role`,
		projectID, subject, role, resource)
	return err
}

func (s *Store) ProjectsAccessible(ctx context.Context, userID uuid.UUID) ([]Project, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT p.id, p.name, p.owner_id, p.region, p.slug, p.tenant_db_name, p.minio_bucket, p.provision_status, p.provision_error, COALESCE(p.disabled,false), p.created_at
		 FROM projects p
		 WHERE p.owner_id = $1
		    OR EXISTS (SELECT 1 FROM project_permissions pp WHERE pp.project_id = p.id AND pp.subject_id = $1)
		 ORDER BY p.created_at`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.OwnerID, &p.Region, &p.Slug, &p.TenantDBName, &p.MinioBucket,
			&p.ProvisionStatus, &p.ProvisionError, &p.Disabled, &p.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

func (s *Store) ProjectOwnerID(ctx context.Context, projectID uuid.UUID) (uuid.UUID, error) {
	var owner uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT owner_id FROM projects WHERE id=$1`, projectID).Scan(&owner)
	return owner, err
}

func (s *Store) SubjectProjectRole(ctx context.Context, projectID, userID uuid.UUID) (string, error) {
	var role string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM project_permissions WHERE project_id=$1 AND subject_id=$2`,
		projectID, userID,
	).Scan(&role)
	return role, err
}

func (s *Store) Audit(ctx context.Context, projectID *uuid.UUID, actor *uuid.UUID, action, resource string, detail map[string]any) error {
	var b json.RawMessage
	var err error
	if detail != nil {
		b, err = json.Marshal(detail)
		if err != nil {
			return err
		}
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO audit_logs(project_id,actor_id,action,resource,detail) VALUES($1,$2,$3,$4,$5)`,
		projectID, actor, action, resource, b)
	return err
}

func (s *Store) AppendPlatformEvent(ctx context.Context, projectID *uuid.UUID, typ string, payload map[string]any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `INSERT INTO platform_events(project_id,type,payload) VALUES($1,$2,$3)`, projectID, typ, raw)
	return err
}

// --- Functions ---

type FunctionRow struct {
	ID             uuid.UUID
	ProjectID      uuid.UUID
	Name           string
	Slug           *string
	CurrentVersion *string
	CreatedAt      time.Time
}

func (s *Store) InsertFunction(ctx context.Context, pid uuid.UUID, name string, by *uuid.UUID) (FunctionRow, error) {
	slug := slugify(name)
	var f FunctionRow
	err := s.pool.QueryRow(ctx,
		`INSERT INTO functions(project_id,name,slug,created_by) VALUES($1,$2,$3,$4) RETURNING id,project_id,name,slug,current_version,created_at`,
		pid, name, slug, by).Scan(&f.ID, &f.ProjectID, &f.Name, &f.Slug, &f.CurrentVersion, &f.CreatedAt)
	return f, err
}

func (s *Store) FunctionByID(ctx context.Context, id uuid.UUID) (FunctionRow, error) {
	var f FunctionRow
	err := s.pool.QueryRow(ctx,
		`SELECT id,project_id,name,slug,current_version,created_at FROM functions WHERE id=$1`, id).
		Scan(&f.ID, &f.ProjectID, &f.Name, &f.Slug, &f.CurrentVersion, &f.CreatedAt)
	return f, err
}

func (s *Store) FunctionByProjectSlug(ctx context.Context, pid uuid.UUID, slug string) (FunctionRow, error) {
	var f FunctionRow
	err := s.pool.QueryRow(ctx,
		`SELECT id,project_id,name,slug,current_version,created_at FROM functions WHERE project_id=$1 AND slug=$2`,
		pid, strings.TrimSpace(strings.ToLower(slug))).
		Scan(&f.ID, &f.ProjectID, &f.Name, &f.Slug, &f.CurrentVersion, &f.CreatedAt)
	return f, err
}

// FunctionEntrypointRow represents a public entrypoint configuration for a function.
type FunctionEntrypointRow struct {
	ID          uuid.UUID
	ProjectID   uuid.UUID
	FunctionID  uuid.UUID
	AuthMode    string
	SecretToken *string
	Enabled     bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (s *Store) UpsertFunctionEntrypoint(ctx context.Context, pid, fid uuid.UUID, authMode string, secretToken *string, enabled bool) (FunctionEntrypointRow, error) {
	var r FunctionEntrypointRow
	err := s.pool.QueryRow(ctx,
		`INSERT INTO function_entrypoints(project_id,function_id,auth_mode,secret_token,enabled)
		 VALUES($1,$2,$3,$4,$5)
		 ON CONFLICT (function_id) DO UPDATE SET
		   auth_mode=EXCLUDED.auth_mode,
		   secret_token=EXCLUDED.secret_token,
		   enabled=EXCLUDED.enabled,
		   updated_at=now()
		 RETURNING id,project_id,function_id,auth_mode,secret_token,enabled,created_at,updated_at`,
		pid, fid, authMode, secretToken, enabled,
	).Scan(&r.ID, &r.ProjectID, &r.FunctionID, &r.AuthMode, &r.SecretToken, &r.Enabled, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

func (s *Store) FunctionEntrypoint(ctx context.Context, fid uuid.UUID) (FunctionEntrypointRow, error) {
	var r FunctionEntrypointRow
	err := s.pool.QueryRow(ctx,
		`SELECT id,project_id,function_id,auth_mode,secret_token,enabled,created_at,updated_at
		 FROM function_entrypoints WHERE function_id=$1`, fid,
	).Scan(&r.ID, &r.ProjectID, &r.FunctionID, &r.AuthMode, &r.SecretToken, &r.Enabled, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

type VersionRow struct {
	ID          uuid.UUID
	FnID        uuid.UUID
	Version     string
	SourceURI   string
	Runtime     string
	Checksum    string
	BuildStatus string
}

func (s *Store) InsertVersion(ctx context.Context, fn uuid.UUID, version, uri, rt, chk string) (VersionRow, error) {
	var v VersionRow
	err := s.pool.QueryRow(ctx,
		`INSERT INTO function_versions(fn_id,version,source_uri,runtime,checksum,build_status) VALUES($1,$2,$3,$4,$5,'complete')
		 RETURNING id,fn_id,version,source_uri,runtime,checksum,build_status`,
		fn, version, uri, rt, chk).Scan(&v.ID, &v.FnID, &v.Version, &v.SourceURI, &v.Runtime, &v.Checksum, &v.BuildStatus)
	if err != nil {
		return VersionRow{}, err
	}
	_, err = s.pool.Exec(ctx, `UPDATE functions SET current_version=$2 WHERE id=$1`, fn, version)
	return v, err
}

type DeployRow struct {
	ID          uuid.UUID
	FnVersionID uuid.UUID
	Region      string
	Status      string
}

func (s *Store) InsertDeployment(ctx context.Context, fv uuid.UUID, region string) (DeployRow, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return DeployRow{}, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	var fnID uuid.UUID
	if err = tx.QueryRow(ctx, `SELECT fn_id FROM function_versions WHERE id=$1`, fv).Scan(&fnID); err != nil {
		return DeployRow{}, err
	}

	var d DeployRow
	err = tx.QueryRow(ctx,
		`INSERT INTO deployments(fn_version_id,region,status) VALUES($1,$2,'active') RETURNING id,fn_version_id,region,status`,
		fv, region).Scan(&d.ID, &d.FnVersionID, &d.Region, &d.Status)
	if err != nil {
		return DeployRow{}, err
	}

	_, err = tx.Exec(ctx,
		`UPDATE deployments d SET status='superseded', finished_at=COALESCE(finished_at, now())
		 FROM function_versions v
		 WHERE d.fn_version_id=v.id AND v.fn_id=$1 AND d.id <> $2 AND d.status='active'`,
		fnID, d.ID,
	)
	if err != nil {
		return DeployRow{}, err
	}

	if err = tx.Commit(ctx); err != nil {
		return DeployRow{}, err
	}
	return d, nil
}

func (s *Store) ListDeploymentsForFunction(ctx context.Context, fn uuid.UUID, limit int32) ([]DeployRow, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	rows, err := s.pool.Query(ctx,
		`SELECT d.id, d.fn_version_id, d.region, d.status FROM deployments d
	   JOIN function_versions v ON v.id=d.fn_version_id
	   JOIN functions f ON f.id=v.fn_id
	   WHERE f.id=$1 ORDER BY d.started_at DESC LIMIT $2`, fn, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var xs []DeployRow
	for rows.Next() {
		var d DeployRow
		if err := rows.Scan(&d.ID, &d.FnVersionID, &d.Region, &d.Status); err != nil {
			return nil, err
		}
		xs = append(xs, d)
	}
	return xs, rows.Err()
}

func (s *Store) LatestActiveDeploymentForFunction(ctx context.Context, fn uuid.UUID) (DeployRow, error) {
	var d DeployRow
	err := s.pool.QueryRow(ctx,
		`SELECT d.id, d.fn_version_id, d.region, d.status FROM deployments d
		 JOIN function_versions v ON v.id=d.fn_version_id
		 JOIN functions f ON f.id=v.fn_id
		 WHERE f.id=$1 AND d.status='active'
		 ORDER BY d.started_at DESC
		 LIMIT 1`, fn).
		Scan(&d.ID, &d.FnVersionID, &d.Region, &d.Status)
	return d, err
}

// RollbackFunctionDeployment marks the newest deployment as superseded and re-activates the previous one.
func (s *Store) RollbackFunctionDeployment(ctx context.Context, pid, fn uuid.UUID) (DeployRow, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return DeployRow{}, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	rows, qerr := tx.Query(ctx,
		`SELECT d.id, d.fn_version_id, d.region, d.status FROM deployments d
		 JOIN function_versions v ON v.id=d.fn_version_id
		 JOIN functions f ON f.id=v.fn_id
		 WHERE f.id=$1 AND f.project_id=$2
		 ORDER BY d.started_at DESC
		 LIMIT 2`,
		fn, pid)
	if qerr != nil {
		err = qerr
		return DeployRow{}, err
	}
	var list []DeployRow
	for rows.Next() {
		var d DeployRow
		if scanErr := rows.Scan(&d.ID, &d.FnVersionID, &d.Region, &d.Status); scanErr != nil {
			rows.Close()
			err = scanErr
			return DeployRow{}, err
		}
		list = append(list, d)
	}
	rows.Close()
	if rows.Err() != nil {
		err = rows.Err()
		return DeployRow{}, err
	}
	if len(list) < 2 {
		err = fmt.Errorf("no previous deployment")
		return DeployRow{}, err
	}

	newest := list[0]
	previous := list[1]
	if _, xerr := tx.Exec(ctx, `UPDATE deployments SET status='superseded', finished_at=COALESCE(finished_at, now()) WHERE id=$1`, newest.ID); xerr != nil {
		err = xerr
		return DeployRow{}, err
	}
	if _, xerr := tx.Exec(ctx, `UPDATE deployments SET status='active', finished_at=NULL, error_message=NULL WHERE id=$1`, previous.ID); xerr != nil {
		err = xerr
		return DeployRow{}, err
	}

	if cerr := tx.Commit(ctx); cerr != nil {
		err = cerr
		return DeployRow{}, err
	}
	err = nil
	return previous, nil
}

// --- Trigger ---

type TriggerRow struct {
	ID        uuid.UUID
	ProjectID uuid.UUID
	Type      string
	TargetFn  uuid.UUID
	Config    map[string]any
}

func (s *Store) InsertTrigger(ctx context.Context, pid uuid.UUID, typ string, target uuid.UUID, cfg map[string]any) (TriggerRow, error) {
	raw, _ := json.Marshal(cfg)
	var t TriggerRow
	err := s.pool.QueryRow(ctx,
		`INSERT INTO triggers(project_id,type,target_fn,config) VALUES($1,$2,$3,$4::jsonb) RETURNING id,project_id,type,target_fn`,
		pid, typ, target, raw,
	).Scan(&t.ID, &t.ProjectID, &t.Type, &t.TargetFn)
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	t.Config = cfg
	return t, err
}

func (s *Store) TriggerByID(ctx context.Context, id uuid.UUID) (TriggerRow, json.RawMessage, error) {
	var t TriggerRow
	var raw json.RawMessage
	err := s.pool.QueryRow(ctx,
		`SELECT id,project_id,type,target_fn,COALESCE(config::text,'{}')::json FROM triggers WHERE id=$1`, id,
	).Scan(&t.ID, &t.ProjectID, &t.Type, &t.TargetFn, &raw)
	if err != nil {
		return t, nil, err
	}
	_ = json.Unmarshal(raw, &t.Config)
	return t, raw, err
}

// --- Objects ---

func (s *Store) UpsertObject(ctx context.Context, pid uuid.UUID, bucket, key string, size int64, etag string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO objects(project_id,bucket,key,size,etag) VALUES($1,$2,$3,$4,$5)
		 ON CONFLICT (project_id,bucket,key) DO UPDATE SET size=EXCLUDED.size, etag=EXCLUDED.etag`,
		pid, bucket, key, size, etag)
	return err
}

// --- Logs ---

func (s *Store) AppendFunctionLog(ctx context.Context, pid *uuid.UUID, deployment *uuid.UUID, level, msg string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO function_logs(project_id,deployment_id,level,message) VALUES($1,$2,$3,$4)`,
		pid, deployment, level, msg)
	return err
}

func (s *Store) LogsForProject(ctx context.Context, pid uuid.UUID, limit int32) ([]struct {
	ID    int64
	Level string
	Msg   string
	Ts    time.Time
}, error) {
	var out []struct {
		ID    int64
		Level string
		Msg   string
		Ts    time.Time
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id,level,message,ts FROM function_logs WHERE project_id=$1 ORDER BY ts DESC LIMIT $2`, pid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var row struct {
			ID    int64
			Level string
			Msg   string
			Ts    time.Time
		}
		if err := rows.Scan(&row.ID, &row.Level, &row.Msg, &row.Ts); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// --- Audit listing ---

func (s *Store) AuditList(ctx context.Context, pid uuid.UUID, limit int32) ([]struct {
	Action    string
	Resource  *string
	Detail    json.RawMessage
	CreatedAt time.Time
}, error) {
	var out []struct {
		Action    string
		Resource  *string
		Detail    json.RawMessage
		CreatedAt time.Time
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx,
		`SELECT action,resource,detail,created_at FROM audit_logs WHERE project_id=$1 ORDER BY created_at DESC LIMIT $2`, pid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var r struct {
			Action    string
			Resource  *string
			Detail    json.RawMessage
			CreatedAt time.Time
		}
		if err := rows.Scan(&r.Action, &r.Resource, &r.Detail, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// --- Marketplace Phase 2 ---

type PackageRow struct {
	ID      uuid.UUID
	Slug    string
	Title   string
	Version string
}

func (s *Store) UpsertMarketplacePackage(ctx context.Context, pub uuid.UUID, slug, title, desc, visibility string) (PackageRow, error) {
	var p PackageRow
	err := s.pool.QueryRow(ctx,
		`INSERT INTO marketplace_packages(slug,publisher_id,title,description,visibility)
		 VALUES($1,$2,$3,$4,$5)
		 ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description
		 RETURNING id,slug,title,latest_version`,
		slug, pub, title, desc, visibility).
		Scan(&p.ID, &p.Slug, &p.Title, &p.Version)
	return p, err
}

func (s *Store) MarketplaceGet(ctx context.Context, slug string) (PackageRow, error) {
	var p PackageRow
	err := s.pool.QueryRow(ctx,
		`SELECT id,slug,title,latest_version FROM marketplace_packages WHERE slug=$1`, slug).
		Scan(&p.ID, &p.Slug, &p.Title, &p.Version)
	return p, err
}

func (s *Store) MarketplaceInstall(ctx context.Context, pkg uuid.UUID, project uuid.UUID, ver string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO marketplace_installs(package_id,project_id,version) VALUES($1,$2,$3)
		 ON CONFLICT (package_id,project_id) DO UPDATE SET version=EXCLUDED.version`,
		pkg, project, ver)
	return err
}

func (s *Store) ProjectIDByMinioBucket(ctx context.Context, bucket string) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM projects WHERE minio_bucket=$1 AND provision_status='ready'`,
		strings.TrimSpace(bucket),
	).Scan(&id)
	return id, err
}
