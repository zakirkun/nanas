package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type ProjectSettings struct {
	ProjectID         uuid.UUID
	LogRetentionDays  int
	APIQuotaRPM       int
	TableAllowlist    json.RawMessage
	DatabaseAllowlist json.RawMessage
}

func (s *Store) UpsertProjectSettingsDefaults(ctx context.Context, projectID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO project_settings(project_id) VALUES($1) ON CONFLICT (project_id) DO NOTHING`,
		projectID)
	return err
}

func (s *Store) SettingsForProject(ctx context.Context, pid uuid.UUID) (ProjectSettings, error) {
	var ps ProjectSettings
	err := s.pool.QueryRow(ctx,
		`SELECT project_id, log_retention_days, api_quota_rpm,
		        COALESCE(table_allowlist::text,'[]')::jsonb,
		        COALESCE(database_allowlist::text,'[]')::jsonb
		 FROM project_settings WHERE project_id=$1`, pid,
	).Scan(&ps.ProjectID, &ps.LogRetentionDays, &ps.APIQuotaRPM, &ps.TableAllowlist, &ps.DatabaseAllowlist)
	if errors.Is(err, pgx.ErrNoRows) {
		if uerr := s.UpsertProjectSettingsDefaults(ctx, pid); uerr != nil {
			return ProjectSettings{}, uerr
		}
		return s.SettingsForProject(ctx, pid)
	}
	return ps, err
}

func (s *Store) PatchProjectSettingsAllowlistJSON(ctx context.Context, pid uuid.UUID, rawAllowlistJSON []byte) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO project_settings(project_id,table_allowlist) VALUES($1,$2::jsonb)
		 ON CONFLICT (project_id) DO UPDATE SET table_allowlist=EXCLUDED.table_allowlist, updated_at=now()`,
		pid, rawAllowlistJSON)
	return err
}

func (s *Store) PatchProjectSettingsDatabaseAllowlistJSON(ctx context.Context, pid uuid.UUID, rawAllowlistJSON []byte) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO project_settings(project_id,database_allowlist) VALUES($1,$2::jsonb)
		 ON CONFLICT (project_id) DO UPDATE SET database_allowlist=EXCLUDED.database_allowlist, updated_at=now()`,
		pid, rawAllowlistJSON)
	return err
}

func (s *Store) PersistTenantSecretsEnvelope(ctx context.Context, pid uuid.UUID, ciphertext, nonce []byte) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO project_settings(project_id, tenant_secrets_encrypted, tenant_secrets_nonce) VALUES ($1,$2,$3)
		 ON CONFLICT (project_id) DO UPDATE SET
		   tenant_secrets_encrypted = EXCLUDED.tenant_secrets_encrypted,
		   tenant_secrets_nonce = EXCLUDED.tenant_secrets_nonce,
		   updated_at = now()`,
		pid, ciphertext, nonce)
	return err
}

func (s *Store) TenantSecretsEnvelope(ctx context.Context, pid uuid.UUID) (ct, nonce []byte, err error) {
	err = s.pool.QueryRow(ctx,
		`SELECT tenant_secrets_encrypted, tenant_secrets_nonce FROM project_settings WHERE project_id=$1`, pid).
		Scan(&ct, &nonce)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, pgx.ErrNoRows
	}
	return ct, nonce, err
}

type BuildJobRow struct {
	ID          uuid.UUID
	FnVersionID uuid.UUID
	ArtifactKey string
	Status      string
	Log         string
	CreatedAt   time.Time
	FinishedAt  *time.Time
}

func (s *Store) InsertBuildJob(ctx context.Context, fv uuid.UUID, artifactKey string) (BuildJobRow, error) {
	var r BuildJobRow
	err := s.pool.QueryRow(ctx,
		`INSERT INTO build_jobs(fn_version_id, artifact_key, status) VALUES($1,$2,'queued')
		 RETURNING id, fn_version_id, artifact_key, status, COALESCE(log,''), created_at, finished_at`,
		fv, artifactKey,
	).Scan(&r.ID, &r.FnVersionID, &r.ArtifactKey, &r.Status, &r.Log, &r.CreatedAt, &r.FinishedAt)
	return r, err
}

func (s *Store) LatestBuildJobForVersion(ctx context.Context, fv uuid.UUID) (BuildJobRow, error) {
	var r BuildJobRow
	err := s.pool.QueryRow(ctx,
		`SELECT id, fn_version_id, artifact_key, status, COALESCE(log,''), created_at, finished_at
		 FROM build_jobs WHERE fn_version_id=$1 ORDER BY created_at DESC LIMIT 1`,
		fv,
	).Scan(&r.ID, &r.FnVersionID, &r.ArtifactKey, &r.Status, &r.Log, &r.CreatedAt, &r.FinishedAt)
	return r, err
}

func (s *Store) FinishBuildJob(ctx context.Context, id uuid.UUID, status, logMsg string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE build_jobs SET status=$2, log=$3, finished_at=now() WHERE id=$1`,
		id, status, logMsg)
	return err
}

func (s *Store) AppendBuildJobLine(ctx context.Context, id uuid.UUID, line string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE build_jobs SET log = COALESCE(log,'') || $2 WHERE id=$1`,
		id, line+"\n")
	return err
}

func (s *Store) InsertVersionQueued(ctx context.Context, fn uuid.UUID, version, uri, rt, chk string) (VersionRow, error) {
	var v VersionRow
	err := s.pool.QueryRow(ctx,
		`INSERT INTO function_versions(fn_id,version,source_uri,runtime,checksum,build_status) VALUES($1,$2,$3,$4,$5,'queued')
		 RETURNING id,fn_id,version,source_uri,runtime,checksum,build_status`,
		fn, version, uri, rt, chk,
	).Scan(&v.ID, &v.FnID, &v.Version, &v.SourceURI, &v.Runtime, &v.Checksum, &v.BuildStatus)
	if err != nil {
		return VersionRow{}, err
	}
	_, err = s.pool.Exec(ctx, `UPDATE functions SET current_version=$2 WHERE id=$1`, fn, version)
	return v, err
}

func (s *Store) UpdateVersionBuildStatus(ctx context.Context, vid uuid.UUID, st string) error {
	_, err := s.pool.Exec(ctx, `UPDATE function_versions SET build_status=$2 WHERE id=$1`, vid, st)
	return err
}

func (s *Store) FunctionVersionSummary(ctx context.Context, vid uuid.UUID) (pid uuid.UUID, fnID uuid.UUID, version string, runtime string, chk string, build string, uri string, err error) {
	err = s.pool.QueryRow(ctx,
		`SELECT f.project_id, v.fn_id, v.version, v.runtime, v.checksum, v.build_status, v.source_uri
		 FROM function_versions v JOIN functions f ON f.id=v.fn_id WHERE v.id=$1`,
		vid,
	).Scan(&pid, &fnID, &version, &runtime, &chk, &build, &uri)
	return
}

func (s *Store) MarkDeploymentFailed(ctx context.Context, id uuid.UUID, msg string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE deployments SET status='failed', finished_at=now(), error_message=$2 WHERE id=$1`,
		id, msg)
	return err
}

type TriggerCronRow struct {
	ID        uuid.UUID
	ProjectID uuid.UUID
	Type      string
	TargetFn  uuid.UUID
	Config    map[string]any
	ConfigRaw json.RawMessage
}

func (s *Store) ListTriggersByProject(ctx context.Context, pid uuid.UUID) ([]TriggerCronRow, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id,project_id,type,target_fn, COALESCE(config::text,'{}')::json
		 FROM triggers WHERE project_id=$1 AND enabled=TRUE`,
		pid,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var xs []TriggerCronRow
	for rows.Next() {
		var t TriggerCronRow
		var raw json.RawMessage
		if scanErr := rows.Scan(&t.ID, &t.ProjectID, &t.Type, &t.TargetFn, &raw); scanErr != nil {
			return nil, scanErr
		}
		t.ConfigRaw = raw
		_ = json.Unmarshal(raw, &t.Config)
		xs = append(xs, t)
	}
	return xs, rows.Err()
}

func (s *Store) TriggerInProject(ctx context.Context, pid, tid uuid.UUID) (TriggerCronRow, error) {
	var t TriggerCronRow
	var raw json.RawMessage
	err := s.pool.QueryRow(ctx,
		`SELECT id,project_id,type,target_fn, COALESCE(config::text,'{}')::json
		 FROM triggers WHERE id=$1 AND project_id=$2 AND enabled=TRUE`,
		tid, pid,
	).Scan(&t.ID, &t.ProjectID, &t.Type, &t.TargetFn, &raw)
	t.ConfigRaw = raw
	_ = json.Unmarshal(raw, &t.Config)
	return t, err
}

func (s *Store) TriggerForIngress(ctx context.Context, tid uuid.UUID) (TriggerCronRow, error) {
	var t TriggerCronRow
	var raw json.RawMessage
	err := s.pool.QueryRow(ctx,
		`SELECT id,project_id,type,target_fn, COALESCE(config::text,'{}')::json
		 FROM triggers WHERE id=$1 AND enabled=TRUE`, tid).
		Scan(&t.ID, &t.ProjectID, &t.Type, &t.TargetFn, &raw)
	t.ConfigRaw = raw
	_ = json.Unmarshal(raw, &t.Config)
	return t, err
}

func (s *Store) AppendTriggerDLQ(ctx context.Context, pid uuid.UUID, reason string, payload json.RawMessage) error {
	if payload == nil {
		payload = []byte("{}")
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO trigger_dlq_events(project_id,reason,payload) VALUES($1,$2,$3::jsonb)`,
		pid, reason, string(payload))
	return err
}

func (s *Store) ListTriggerDLQ(ctx context.Context, pid uuid.UUID, limit int32) ([]struct {
	ID        int64
	Reason    string
	Payload   json.RawMessage
	CreatedAt time.Time
}, error) {
	var out []struct {
		ID        int64
		Reason    string
		Payload   json.RawMessage
		CreatedAt time.Time
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, reason, payload::jsonb, created_at FROM trigger_dlq_events
		 WHERE project_id=$1 ORDER BY created_at DESC LIMIT $2`, pid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var r struct {
			ID        int64
			Reason    string
			Payload   json.RawMessage
			CreatedAt time.Time
		}
		if err := rows.Scan(&r.ID, &r.Reason, &r.Payload, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

type LogRow struct {
	ID             int64
	DeploymentID   *uuid.UUID
	Level          string
	Msg            string
	Ts             time.Time
	ExplainSnippet json.RawMessage
}

func (s *Store) LogsForProjectFiltered(ctx context.Context, pid uuid.UUID, deployment *uuid.UUID, from, to *time.Time, limit int32) ([]LogRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := `SELECT id, deployment_id, level, message, ts, explain_snippet FROM function_logs WHERE project_id=$1`
	args := []any{pid}
	if deployment != nil {
		q += ` AND deployment_id=$2`
		args = append(args, *deployment)
	}
	if from != nil {
		n := len(args) + 1
		q += fmt.Sprintf(` AND ts >= $%d`, n)
		args = append(args, *from)
	}
	if to != nil {
		n := len(args) + 1
		q += fmt.Sprintf(` AND ts <= $%d`, n)
		args = append(args, *to)
	}
	q += fmt.Sprintf(` ORDER BY ts DESC LIMIT $%d`, len(args)+1)
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var xs []LogRow
	for rows.Next() {
		var r LogRow
		if scanErr := rows.Scan(&r.ID, &r.DeploymentID, &r.Level, &r.Msg, &r.Ts, &r.ExplainSnippet); scanErr != nil {
			return nil, scanErr
		}
		xs = append(xs, r)
	}
	return xs, rows.Err()
}

func (s *Store) AppendFunctionLogExplain(ctx context.Context, pid *uuid.UUID, deployment *uuid.UUID, level, msg string, explainJSON json.RawMessage) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO function_logs(project_id,deployment_id,level,message,explain_snippet) VALUES($1,$2,$3,$4,NULLIF($5::text,'')::jsonb)`,
		pid, deployment, level, msg, string(explainJSON))
	return err
}

func (s *Store) PruneLogsOlderThanSettings(ctx context.Context) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM function_logs fl
		 WHERE EXISTS (
		   SELECT 1 FROM project_settings ps
		   WHERE ps.project_id = fl.project_id
		     AND fl.ts < now() - (ps.log_retention_days || ' days')::interval
		 )
		 OR (
		   NOT EXISTS (SELECT 1 FROM project_settings ps WHERE ps.project_id = fl.project_id)
		   AND fl.ts < now() - interval '30 days'
		 )`)
	return err
}

func (s *Store) ListTriggersByTypeAll(ctx context.Context, typ string) ([]TriggerCronRow, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id,project_id,type,target_fn, COALESCE(config::text,'{}')::json
		 FROM triggers WHERE type=$1 AND enabled=TRUE`,
		typ)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var xs []TriggerCronRow
	for rows.Next() {
		var t TriggerCronRow
		var raw json.RawMessage
		if scanErr := rows.Scan(&t.ID, &t.ProjectID, &t.Type, &t.TargetFn, &raw); scanErr != nil {
			return nil, scanErr
		}
		t.ConfigRaw = raw
		_ = json.Unmarshal(raw, &t.Config)
		xs = append(xs, t)
	}
	return xs, rows.Err()
}

// DeploymentArtifacts joins deployment with function version rows for dataplane payloads.
func (s *Store) DeploymentArtifacts(ctx context.Context, dep uuid.UUID) (pid uuid.UUID, fnID uuid.UUID, ver SourceVersion, err error) {
	err = s.pool.QueryRow(ctx,
		`SELECT f.project_id, f.id,
		 v.version, v.source_uri, v.runtime, v.checksum
		 FROM deployments d
		 JOIN function_versions v ON v.id=d.fn_version_id
		 JOIN functions f ON f.id=v.fn_id
		 WHERE d.id=$1`,
		dep).Scan(&pid, &fnID, &ver.Version, &ver.SourceURI, &ver.Runtime, &ver.Checksum)
	return
}

type SourceVersion struct {
	Version   string
	SourceURI string
	Runtime   string
	Checksum  string
}
