-- Platform-level RBAC and project state controls

ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'user';
CREATE INDEX IF NOT EXISTS idx_users_platform_role ON users(platform_role);

-- When no super_admin exists, promote the oldest user (idempotent, avoids PL/pgSQL in multistmt split).
UPDATE users SET platform_role = 'super_admin'
WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE platform_role = 'super_admin');

ALTER TABLE projects ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_projects_disabled ON projects(disabled);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug) WHERE slug IS NOT NULL;

ALTER TABLE functions ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_functions_project_slug ON functions(project_id, slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS function_entrypoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    function_id UUID NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
    auth_mode TEXT NOT NULL DEFAULT 'project_key',
    secret_token TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(function_id)
);

CREATE INDEX IF NOT EXISTS idx_function_entrypoints_project ON function_entrypoints(project_id);
