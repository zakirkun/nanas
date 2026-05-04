-- MVP 3 (PRD-aligned): function metadata for richer listings, deployment history fields,
-- function drafts (in-browser code authoring), trace store, retention extension.

-- Track latest deployment summary on functions for fast list rendering.
ALTER TABLE functions ADD COLUMN IF NOT EXISTS last_deployed_at TIMESTAMPTZ;
ALTER TABLE functions ADD COLUMN IF NOT EXISTS last_deployment_status TEXT;
ALTER TABLE functions ADD COLUMN IF NOT EXISTS triggers_count INT NOT NULL DEFAULT 0;

-- Allow function_versions to carry metadata (env, build args).
ALTER TABLE function_versions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Persist deploy strategy / resources / env on deployments.
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS strategy TEXT NOT NULL DEFAULT 'rolling';
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS resources JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS env JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS health_check_path TEXT;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS timeout_ms INT NOT NULL DEFAULT 5000;

-- Trigger-execution stats (light, denormalized for the UI).
ALTER TABLE triggers ADD COLUMN IF NOT EXISTS last_fired_at TIMESTAMPTZ;
ALTER TABLE triggers ADD COLUMN IF NOT EXISTS last_dispatch_status TEXT;
ALTER TABLE triggers ADD COLUMN IF NOT EXISTS dispatch_count BIGINT NOT NULL DEFAULT 0;

-- In-browser draft per function (only one open draft per function).
CREATE TABLE IF NOT EXISTS function_drafts (
    fn_id UUID PRIMARY KEY REFERENCES functions(id) ON DELETE CASCADE,
    files JSONB NOT NULL DEFAULT '[]'::jsonb,
    env JSONB NOT NULL DEFAULT '{}'::jsonb,
    runtime TEXT NOT NULL DEFAULT 'node',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES users(id)
);

-- Trace store (ring-buffer fallback uses memory — this table is opt-in via TRACE_STORE=db).
CREATE TABLE IF NOT EXISTS trace_spans (
    id BIGSERIAL PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    parent_span_id TEXT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'internal',
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    duration_ns BIGINT NOT NULL,
    status_code TEXT,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE(trace_id, span_id)
);

CREATE INDEX IF NOT EXISTS idx_trace_spans_trace ON trace_spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_trace_spans_project_started ON trace_spans(project_id, started_at DESC);

-- Migration history per project (for the DB Console history list).
CREATE TABLE IF NOT EXISTS db_migrations (
    id BIGSERIAL PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sql TEXT NOT NULL,
    actor_id UUID,
    status TEXT NOT NULL DEFAULT 'applied',
    error_message TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_db_migrations_project_ts ON db_migrations(project_id, applied_at DESC);

-- Retention for traces (logs already configurable).
ALTER TABLE project_settings ADD COLUMN IF NOT EXISTS trace_retention_days INT NOT NULL DEFAULT 7;

-- Per-project secrets (integrations) — stored as encrypted blobs, key referenced by secret_name.
CREATE TABLE IF NOT EXISTS project_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    adapter TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    secret_ciphertext BYTEA,
    secret_nonce BYTEA,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, adapter)
);
CREATE INDEX IF NOT EXISTS idx_project_integrations_project ON project_integrations(project_id);

-- Async invocation envelope (events table named "platform_events" already exists — we use it).
-- Add a partial index for async dispatch lookups by enqueue_id.
CREATE INDEX IF NOT EXISTS idx_platform_events_enqueue
    ON platform_events ((payload->>'enqueue_id'))
    WHERE type = 'function.invoke.async';
