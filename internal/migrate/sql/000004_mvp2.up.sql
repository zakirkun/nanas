-- MVP 2 Sprint 1 schema: marketplace versions, install audit, tenant CDC subscriptions, per-API-key quota.

CREATE TABLE IF NOT EXISTS marketplace_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES marketplace_packages(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    source_uri TEXT NOT NULL DEFAULT '',
    runtime TEXT NOT NULL DEFAULT 'go',
    checksum TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(package_id, version)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_versions_package ON marketplace_versions(package_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_install_logs (
    id BIGSERIAL PRIMARY KEY,
    package_id UUID NOT NULL REFERENCES marketplace_packages(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_install_logs_project ON marketplace_install_logs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_cdc_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    function_id UUID NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'nanas_cdc',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, function_id, table_name)
);

CREATE INDEX IF NOT EXISTS idx_cdc_subscriptions_project ON tenant_cdc_subscriptions(project_id);

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS quota_rpm INT;
