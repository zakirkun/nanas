-- MVP Phase 1 extensions

CREATE TABLE IF NOT EXISTS project_settings (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    log_retention_days INT NOT NULL DEFAULT 30,
    api_quota_rpm INT NOT NULL DEFAULT 600,
    table_allowlist JSONB NOT NULL DEFAULT '[]',
    tenant_secrets_encrypted BYTEA,
    tenant_secrets_nonce BYTEA,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS build_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fn_version_id UUID NOT NULL REFERENCES function_versions(id) ON DELETE CASCADE,
    artifact_key TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued',
    log TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_build_jobs_version ON build_jobs(fn_version_id);

CREATE TABLE IF NOT EXISTS trigger_dlq_events (
    id BIGSERIAL PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reason TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trigger_dlq_project ON trigger_dlq_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_triggers_project_type ON triggers(project_id, type);

ALTER TABLE function_logs ADD COLUMN IF NOT EXISTS explain_snippet JSONB;
