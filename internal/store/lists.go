package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// FunctionListRow carries the denormalised columns the UI shows in the
// Function Explorer (PRD section 4): name, slug, current_version, last
// deployment summary, trigger count, and basic timestamps.
type FunctionListRow struct {
	ID                   uuid.UUID  `json:"id"`
	Name                 string     `json:"name"`
	Slug                 *string    `json:"slug,omitempty"`
	CurrentVersion       *string    `json:"current_version,omitempty"`
	Runtime              *string    `json:"runtime,omitempty"`
	LastDeployedAt       *time.Time `json:"last_deployed_at,omitempty"`
	LastDeploymentStatus *string    `json:"last_deployment_status,omitempty"`
	TriggersCount        int        `json:"triggers_count"`
	EntrypointEnabled    bool       `json:"entrypoint_enabled"`
	CreatedAt            time.Time  `json:"created_at"`
}

// ListFunctionsByProject returns all functions for a project ordered by
// `created_at DESC`. The query joins `function_versions` (for runtime),
// `function_entrypoints` (for public/private), and counts triggers in a
// correlated subquery so the response is one row per function.
func (s *Store) ListFunctionsByProject(ctx context.Context, pid uuid.UUID, limit, offset int32) ([]FunctionListRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	const q = `
SELECT f.id,
       f.name,
       f.slug,
       f.current_version,
       (SELECT v.runtime FROM function_versions v
          WHERE v.fn_id = f.id AND v.version = f.current_version
          LIMIT 1) AS runtime,
       f.last_deployed_at,
       f.last_deployment_status,
       (SELECT COUNT(*) FROM triggers t WHERE t.target_fn = f.id) AS triggers_count,
       COALESCE((SELECT e.enabled FROM function_entrypoints e WHERE e.function_id = f.id), false) AS ep_enabled,
       f.created_at
FROM functions f
WHERE f.project_id = $1
ORDER BY f.created_at DESC
LIMIT $2 OFFSET $3`
	rows, err := s.pool.Query(ctx, q, pid, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []FunctionListRow
	for rows.Next() {
		var r FunctionListRow
		if err := rows.Scan(
			&r.ID, &r.Name, &r.Slug, &r.CurrentVersion, &r.Runtime,
			&r.LastDeployedAt, &r.LastDeploymentStatus, &r.TriggersCount,
			&r.EntrypointEnabled, &r.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// FunctionVersionListRow is the per-version payload returned by the
// versions endpoint. It includes the build status, checksum, and the latest
// build job log so the UI can render the version history with rich detail.
type FunctionVersionListRow struct {
	ID          uuid.UUID `json:"id"`
	Version     string    `json:"version"`
	Runtime     string    `json:"runtime"`
	Checksum    string    `json:"checksum"`
	BuildStatus string    `json:"build_status"`
	SourceURI   string    `json:"source_uri"`
	BuildJobID  uuid.UUID `json:"build_job_id"`
	JobStatus   string    `json:"job_status"`
	JobLog      string    `json:"job_log"`
	CreatedAt   time.Time `json:"created_at"`
}

func (s *Store) ListVersionsByFunction(ctx context.Context, fid uuid.UUID, limit int32) ([]FunctionVersionListRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	const q = `
SELECT v.id, v.version, v.runtime, v.checksum, v.build_status, v.source_uri,
       COALESCE(b.id, '00000000-0000-0000-0000-000000000000') AS build_job_id,
       COALESCE(b.status, '') AS job_status,
       COALESCE(b.log, '') AS job_log,
       v.created_at
FROM function_versions v
LEFT JOIN LATERAL (
    SELECT id, status, log
    FROM build_jobs
    WHERE fn_version_id = v.id
    ORDER BY created_at DESC
    LIMIT 1
) b ON TRUE
WHERE v.fn_id = $1
ORDER BY v.created_at DESC
LIMIT $2`
	rows, err := s.pool.Query(ctx, q, fid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []FunctionVersionListRow
	for rows.Next() {
		var r FunctionVersionListRow
		if err := rows.Scan(
			&r.ID, &r.Version, &r.Runtime, &r.Checksum, &r.BuildStatus, &r.SourceURI,
			&r.BuildJobID, &r.JobStatus, &r.JobLog, &r.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// DeploymentListRow is what /functions/:fid/deployments returns and what
// /deployments/:did is built from.
type DeploymentListRow struct {
	ID              uuid.UUID       `json:"id"`
	FnVersionID     uuid.UUID       `json:"fn_version_id"`
	Version         string          `json:"version"`
	Runtime         string          `json:"runtime"`
	Region          string          `json:"region"`
	Status          string          `json:"status"`
	Strategy        string          `json:"strategy"`
	Resources       json.RawMessage `json:"resources"`
	Env             json.RawMessage `json:"env"`
	HealthCheckPath *string         `json:"health_check_path,omitempty"`
	TimeoutMS       int             `json:"timeout_ms"`
	StartedAt       time.Time       `json:"started_at"`
	FinishedAt      *time.Time      `json:"finished_at,omitempty"`
	ErrorMessage    *string         `json:"error_message,omitempty"`
}

func (s *Store) ListDeploymentsForFunctionVerbose(ctx context.Context, fid uuid.UUID, limit int32) ([]DeploymentListRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	const q = `
SELECT d.id, d.fn_version_id, v.version, v.runtime, d.region, d.status,
       COALESCE(d.strategy, 'rolling'),
       COALESCE(d.resources, '{}'::jsonb)::text,
       COALESCE(d.env, '{}'::jsonb)::text,
       d.health_check_path,
       COALESCE(d.timeout_ms, 5000),
       d.started_at, d.finished_at, d.error_message
FROM deployments d
JOIN function_versions v ON v.id = d.fn_version_id
WHERE v.fn_id = $1
ORDER BY d.started_at DESC
LIMIT $2`
	rows, err := s.pool.Query(ctx, q, fid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DeploymentListRow
	for rows.Next() {
		var r DeploymentListRow
		var resources, env string
		if err := rows.Scan(
			&r.ID, &r.FnVersionID, &r.Version, &r.Runtime, &r.Region, &r.Status,
			&r.Strategy, &resources, &env, &r.HealthCheckPath, &r.TimeoutMS,
			&r.StartedAt, &r.FinishedAt, &r.ErrorMessage,
		); err != nil {
			return nil, err
		}
		r.Resources = json.RawMessage(resources)
		r.Env = json.RawMessage(env)
		out = append(out, r)
	}
	return out, rows.Err()
}

// DeploymentByID looks up a deployment with full PRD-shaped detail. Returns
// pgx.ErrNoRows when not found so callers can map to NOT_FOUND.
func (s *Store) DeploymentByID(ctx context.Context, did uuid.UUID) (DeploymentListRow, uuid.UUID, error) {
	const q = `
SELECT d.id, d.fn_version_id, v.version, v.runtime, d.region, d.status,
       COALESCE(d.strategy, 'rolling'),
       COALESCE(d.resources, '{}'::jsonb)::text,
       COALESCE(d.env, '{}'::jsonb)::text,
       d.health_check_path,
       COALESCE(d.timeout_ms, 5000),
       d.started_at, d.finished_at, d.error_message,
       f.project_id
FROM deployments d
JOIN function_versions v ON v.id = d.fn_version_id
JOIN functions f ON f.id = v.fn_id
WHERE d.id = $1`
	var r DeploymentListRow
	var pid uuid.UUID
	var resources, env string
	err := s.pool.QueryRow(ctx, q, did).Scan(
		&r.ID, &r.FnVersionID, &r.Version, &r.Runtime, &r.Region, &r.Status,
		&r.Strategy, &resources, &env, &r.HealthCheckPath, &r.TimeoutMS,
		&r.StartedAt, &r.FinishedAt, &r.ErrorMessage,
		&pid,
	)
	if err != nil {
		return DeploymentListRow{}, uuid.Nil, err
	}
	r.Resources = json.RawMessage(resources)
	r.Env = json.RawMessage(env)
	return r, pid, nil
}

// MarkDeploymentDeploying sets a deployment back to "deploying" — used by the
// expanded deploy handler so the UI can poll and watch the transition.
func (s *Store) MarkDeploymentDeploying(ctx context.Context, did uuid.UUID, strategy string, resources, env []byte, healthPath *string, timeoutMS int) error {
	if len(resources) == 0 {
		resources = []byte("{}")
	}
	if len(env) == 0 {
		env = []byte("{}")
	}
	if strategy == "" {
		strategy = "rolling"
	}
	if timeoutMS <= 0 {
		timeoutMS = 5000
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE deployments
		   SET status='deploying',
		       strategy=$2,
		       resources=$3::jsonb,
		       env=$4::jsonb,
		       health_check_path=$5,
		       timeout_ms=$6,
		       finished_at=NULL,
		       error_message=NULL
		 WHERE id=$1`,
		did, strategy, string(resources), string(env), healthPath, timeoutMS)
	return err
}

// MarkDeploymentActive flips status to active and stamps finished_at.
func (s *Store) MarkDeploymentActive(ctx context.Context, did uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE deployments SET status='active', finished_at=COALESCE(finished_at, now()), error_message=NULL WHERE id=$1`,
		did)
	return err
}

// UpdateFunctionLastDeployment denormalises the "latest deployment" status onto
// `functions` so the explorer query stays cheap.
func (s *Store) UpdateFunctionLastDeployment(ctx context.Context, fid uuid.UUID, status string, ts time.Time) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE functions SET last_deployed_at=$2, last_deployment_status=$3 WHERE id=$1`,
		fid, ts, status)
	return err
}

// IncrementTriggerCount adjusts the denormalised counter on functions.
func (s *Store) IncrementTriggerCount(ctx context.Context, fid uuid.UUID, delta int) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE functions SET triggers_count = GREATEST(0, triggers_count + $2) WHERE id=$1`,
		fid, delta)
	return err
}

// TriggerListRow returns trigger fields shaped for the UI list — including
// the denormalised dispatch counters added in 00005.
type TriggerListRow struct {
	ID                 uuid.UUID       `json:"id"`
	Type               string          `json:"type"`
	TargetFn           uuid.UUID       `json:"target_fn"`
	TargetFnName       *string         `json:"target_fn_name,omitempty"`
	Config             json.RawMessage `json:"config"`
	Enabled            bool            `json:"enabled"`
	LastFiredAt        *time.Time      `json:"last_fired_at,omitempty"`
	LastDispatchStatus *string         `json:"last_dispatch_status,omitempty"`
	DispatchCount      int64           `json:"dispatch_count"`
	DLQCount           int64           `json:"dlq_count"`
	CreatedAt          time.Time       `json:"created_at"`
}

func (s *Store) ListTriggersWithStats(ctx context.Context, pid uuid.UUID) ([]TriggerListRow, error) {
	const q = `
SELECT t.id, t.type, t.target_fn, f.name, COALESCE(t.config::text,'{}'),
       t.enabled, t.last_fired_at, t.last_dispatch_status,
       COALESCE(t.dispatch_count, 0),
       (SELECT COUNT(*) FROM trigger_dlq_events d
          WHERE d.project_id = t.project_id
            AND COALESCE(d.payload->>'trigger_id','') = t.id::text) AS dlq_count,
       t.created_at
FROM triggers t
LEFT JOIN functions f ON f.id = t.target_fn
WHERE t.project_id = $1
ORDER BY t.created_at DESC`
	rows, err := s.pool.Query(ctx, q, pid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TriggerListRow
	for rows.Next() {
		var r TriggerListRow
		var cfg string
		if err := rows.Scan(
			&r.ID, &r.Type, &r.TargetFn, &r.TargetFnName, &cfg,
			&r.Enabled, &r.LastFiredAt, &r.LastDispatchStatus, &r.DispatchCount,
			&r.DLQCount, &r.CreatedAt,
		); err != nil {
			return nil, err
		}
		r.Config = json.RawMessage(cfg)
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) TriggerByIDInProject(ctx context.Context, pid, tid uuid.UUID) (TriggerListRow, error) {
	const q = `
SELECT t.id, t.type, t.target_fn, f.name, COALESCE(t.config::text,'{}'),
       t.enabled, t.last_fired_at, t.last_dispatch_status,
       COALESCE(t.dispatch_count, 0),
       (SELECT COUNT(*) FROM trigger_dlq_events d
          WHERE d.project_id = t.project_id
            AND COALESCE(d.payload->>'trigger_id','') = t.id::text) AS dlq_count,
       t.created_at
FROM triggers t
LEFT JOIN functions f ON f.id = t.target_fn
WHERE t.id = $1 AND t.project_id = $2`
	var r TriggerListRow
	var cfg string
	err := s.pool.QueryRow(ctx, q, tid, pid).Scan(
		&r.ID, &r.Type, &r.TargetFn, &r.TargetFnName, &cfg,
		&r.Enabled, &r.LastFiredAt, &r.LastDispatchStatus, &r.DispatchCount,
		&r.DLQCount, &r.CreatedAt,
	)
	if err != nil {
		return TriggerListRow{}, err
	}
	r.Config = json.RawMessage(cfg)
	return r, nil
}

// SetTriggerEnabled flips the enabled column for a single trigger.
func (s *Store) SetTriggerEnabled(ctx context.Context, pid, tid uuid.UUID, enabled bool) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE triggers SET enabled=$3 WHERE id=$1 AND project_id=$2`,
		tid, pid, enabled)
	return err
}

// RecordTriggerDispatch updates the denormalised counters & timestamps.
func (s *Store) RecordTriggerDispatch(ctx context.Context, tid uuid.UUID, status string, when time.Time) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE triggers
		   SET last_fired_at = $2,
		       last_dispatch_status = $3,
		       dispatch_count = dispatch_count + 1
		 WHERE id=$1`,
		tid, when, status)
	return err
}

// FunctionByIDInProject is a strict variant that errors if the function
// doesn't belong to `pid` — used by detail endpoints to avoid IDOR.
func (s *Store) FunctionByIDInProject(ctx context.Context, pid, fid uuid.UUID) (FunctionRow, error) {
	var f FunctionRow
	err := s.pool.QueryRow(ctx,
		`SELECT id,project_id,name,slug,current_version,created_at FROM functions WHERE id=$1 AND project_id=$2`, fid, pid).
		Scan(&f.ID, &f.ProjectID, &f.Name, &f.Slug, &f.CurrentVersion, &f.CreatedAt)
	return f, err
}

// LookupErrNotFound reports whether the error is the "no rows" sentinel —
// helper to keep the cmd layer free of pgx imports.
func LookupErrNotFound(err error) bool { return errors.Is(err, pgx.ErrNoRows) }
