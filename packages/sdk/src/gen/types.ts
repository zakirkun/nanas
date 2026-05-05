/* eslint-disable */
/**
 * AUTO-GENERATED — do not edit. Regenerate with `pnpm run generate`.
 * Source: C:/Users/MyBook Hype AMD/workarea/nanas/openapi.yaml
 */
export interface paths {
    "/admin/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List all projects across owners. Requires platform_role >= staff. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/projects/{pid}/disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Disable a project. Returns 403 PROJECT_DISABLED for project-scoped endpoints. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/projects/{pid}/enable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Re-enable a project. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List platform users. Requires platform_role >= staff. */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                    offset?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update a user platform_role. Requires platform_role=super_admin. */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        platform_role: PathsAdminUsersIdPatchRequestBodyContentApplicationJsonPlatform_role;
                    };
                };
            };
            responses: never;
        };
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Exchange email and password for a JWT. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        email: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description Authenticated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            token?: string;
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register a new user. The first user is auto-promoted to platform_role=super_admin. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description User created. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            token?: string;
                            user?: {
                                email?: string;
                                /** Format: uuid */
                                id?: string;
                            };
                        };
                    };
                };
                400: components["responses"]["ValidationError"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/fn/{project_slug}/{fn_slug}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fn_slug: string;
                project_slug: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Public invocation entrypoint. Authentication depends on the configured auth_mode.
         * @description - `auth_mode=public`: no authentication.
         *     - `auth_mode=signed`: send `X-Entrypoint-Token` header (or `?token=`) matching the entrypoint secret.
         *     - `auth_mode=project_key`: send `Authorization: Bearer sk_...` for the project.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fn_slug: string;
                    project_slug: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Function output. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Liveness probe */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Service is alive. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/internal/minio-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Object storage event webhook. Requires X-Minio-Webhook-Secret. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Prometheus metrics scrape endpoint. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Prometheus text exposition format. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/openapi.yaml": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Serve this OpenAPI document. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OpenAPI YAML */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readiness probe checking PostgreSQL and object storage. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Both dependencies are reachable. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                503: components["responses"]["Internal"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/deployments/{did}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Poll a deployment by id (PRD section 7). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    did: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deployment status. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                403: components["responses"]["Forbidden"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/ingress/{tid}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tid: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** HTTP trigger ingress. Validates X-Webhook-Secret against the trigger configuration. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    tid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/marketplace/packages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List marketplace packages. */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                    offset?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        /** Create or upsert a marketplace package owned by the caller. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/marketplace/packages/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a marketplace package summary. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    slug: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/marketplace/packages/{slug}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List versions of a marketplace package. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    slug: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        /** Publish a new version of a marketplace package (semver required). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    slug: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        checksum?: string;
                        notes?: string;
                        runtime?: string;
                        source_uri?: string;
                        version: string;
                    };
                };
            };
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/marketplace/packages/{slug}/versions/{version}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a single marketplace package version. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    slug: string;
                    version: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/observability/traces": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read all spans for a trace_id (PRD section 16). */
        get: {
            parameters: {
                query: {
                    trace_id: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Trace + spans. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                403: components["responses"]["Forbidden"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List projects accessible to the authenticated user. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Project list. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            projects?: components["schemas"]["Project"][];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Create a project. Tenant database and object bucket are provisioned asynchronously. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name: string;
                        /** @default default */
                        region?: string;
                    };
                };
            };
            responses: {
                /** @description Project created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Project"];
                    };
                };
                400: components["responses"]["ValidationError"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read project details, including provisioning status and tenant bindings. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Project details. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Project"];
                    };
                };
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List audit events for the project (admin role required). */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                };
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/cdc/subscriptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List CDC subscriptions for the project. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        /** Subscribe a function to PostgreSQL row-level events on a tenant table via LISTEN/NOTIFY. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        function_id: string;
                        table: string;
                    };
                };
            };
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/cdc/subscriptions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Remove a CDC subscription. */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/data/catalog/tables": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List BASE TABLE names in the tenant DB public schema (safe identifiers only). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Table names sorted alphabetically. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            tables: string[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/data/tables/{table}/rows": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read rows from an allow-listed tenant table. */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                };
                header?: never;
                path: {
                    pid: string;
                    table: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/db/databases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Postgres databases visible from the tenant connection and the stored database allowlist. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Cluster database names and allowlist. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            allowlist?: string[];
                            databases?: string[];
                        };
                    };
                };
                400: components["responses"]["ValidationError"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/db/migrate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Apply allow-listed DDL statements (CREATE TABLE, CREATE INDEX, selected CREATE EXTENSION, COMMENT ON). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        sql: string;
                    };
                };
            };
            responses: {
                /** @description DDL applied. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["ValidationError"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/db/query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Execute a guarded SELECT/INSERT/UPDATE/DELETE statement, or run EXPLAIN ANALYZE. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        explain?: boolean;
                        params?: unknown[];
                        sql: string;
                    };
                };
            };
            responses: {
                /** @description Query result. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["ValidationError"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List functions in a project with denormalised summary fields. */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                    offset?: number;
                };
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Function list. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        /** Create a function. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name: string;
                    };
                };
            };
            responses: {
                /** @description Created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Function"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read function detail (name, slug, current_version, entrypoint summary). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Function detail. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/artifacts/presign": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Returns an API-relative PUT URL (with query version=) for artifact tarball upload via the API proxy. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/artifacts/upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Upload a function artifact tarball via the API (stored in MinIO on the backend). */
        put: {
            parameters: {
                query: {
                    version: string;
                };
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Accepted and stored. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/deploy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Deploy a completed function version. The control plane registers the deployment with the dataplane. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deployment created. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Deployment"];
                    };
                };
                /** @description Build is not complete. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/deployments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List deployments for a function (newest first). */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                };
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deployment list. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/deployments/rollback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reactivate the previous deployment for the function. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/draft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the in-browser code-editor draft for a function (Phase 4). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Draft. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        /** Save the in-browser draft (files + env + runtime). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        env?: {
                            [key: string]: string;
                        };
                        files?: {
                            content: string;
                            path: string;
                        }[];
                        /** @enum {string} */
                        runtime?: PathsV1ProjectsPidFunctionsFidDraftPostRequestBodyContentApplicationJsonRuntime;
                    };
                };
            };
            responses: {
                /** @description Saved. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/entrypoint": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the public function entrypoint configuration. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Entrypoint configuration. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Entrypoint"];
                    };
                };
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        /** Configure the public function entrypoint. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        auth_mode?: PathsV1ProjectsPidFunctionsFidEntrypointPostRequestBodyContentApplicationJsonAuth_mode;
                        enabled?: boolean;
                    };
                };
            };
            responses: {
                /** @description Entrypoint configuration. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Entrypoint"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/invoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Invoke the latest active deployment for a function (project-scoped). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/invoke/async": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Enqueue async invocation (JetStream when NATS configured; otherwise in-process). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        input?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            responses: {
                /** @description Queued with enqueue_id. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/source": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Package authored files into a tar.gz and upload it to the project bucket. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        files: {
                            content: string;
                            path: string;
                        }[];
                        version: string;
                    };
                };
            };
            responses: {
                /** @description Tarball uploaded; returns artifact_key + checksum. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register an immutable function version and queue a build job. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        artifact_key?: string;
                        checksum?: string;
                        runtime?: string;
                        source_uri?: string;
                        version?: string;
                    };
                };
            };
            responses: {
                /** @description Version queued. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FunctionVersion"] & components["schemas"]["BuildJob"];
                    };
                };
                /** @description Version already exists. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/functions/{fid}/versions/{vid}/build": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read function version build status. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    fid: string;
                    pid: string;
                    vid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/graphql": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Execute a GraphQL query generated from the project's table allowlist. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/graphql/schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the auto-generated GraphQL SDL for the project. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/integrations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List configured integration adapters for the project. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Adapter list (secrets redacted). */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/integrations/email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Store SendGrid API key (encrypted) and optional default_from / default_reply. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        api_key?: string;
                        default_from?: string;
                        default_reply?: string;
                    };
                };
            };
            responses: {
                /** @description Saved. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/integrations/email/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Send email via SendGrid using the project integration. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Optional if default_from configured. */
                        from?: string;
                        html: string;
                        subject: string;
                        to: string;
                    };
                };
            };
            responses: {
                /** @description Sent. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Upstream error. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/keys/{kid}/quota": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Set or clear quota_rpm for a project API key. Pass `{ "rpm": null }` to inherit project quota. */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kid: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        rpm?: number | null;
                    };
                };
            };
            responses: never;
        };
        trace?: never;
    };
    "/v1/projects/{pid}/marketplace/install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Install a marketplace package into a project. Resolves to the highest semver when no version is supplied. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/migrations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List recent DDL migrations applied from the control plane (Phase 17). */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                };
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Migration history. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/observability/logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List function logs filtered by deployment and time range. */
        get: {
            parameters: {
                query?: {
                    deployment_id?: string;
                    from?: string;
                    limit?: number;
                    to?: string;
                };
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/observability/traces": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Recent traces collected for the project (Phase 10 trace store). */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                };
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Traces list. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the project's RBAC matrix (Phase 13). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Permissions list. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/realtime/ws": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** WebSocket endpoint. Send `{ "op":"subscribe","channels":["triggers"] }` to subscribe. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/settings/data-allowlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read the project's table allowlist (GraphQL / read-rows endpoint). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Allowlisted table names. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            tables: string[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Replace the project's table allowlist (validated identifiers; empty clears). */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        tables: string[];
                    };
                };
            };
            responses: {
                /** @description Updated allowlist. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        trace?: never;
    };
    "/v1/projects/{pid}/settings/database-allowlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Replace the project's database allowlist (names must exist on the cluster). */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        databases: string[];
                    };
                };
            };
            responses: {
                /** @description Updated allowlist. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["ValidationError"];
            };
        };
        trace?: never;
    };
    "/v1/projects/{pid}/settings/retention": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read log + trace retention days. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Retention settings. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update retention days for logs and/or traces. */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        logs_days?: number | null;
                        traces_days?: number | null;
                    };
                };
            };
            responses: {
                /** @description Updated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        trace?: never;
    };
    "/v1/projects/{pid}/storage/download": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Returns an API-relative GET path to download via the control plane (MinIO proxy). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/storage/objects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List objects in the project bucket (Phase 12). */
        get: {
            parameters: {
                query?: {
                    bucket?: string;
                    limit?: number;
                    prefix?: string;
                };
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Object list. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/storage/objects/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download an object from the project bucket through the API (streams from MinIO). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Object bytes. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                404: components["responses"]["NotFound"];
            };
        };
        /** Upload or replace an object via the API (stored in MinIO on the backend). */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Stored. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["ValidationError"];
            };
        };
        post?: never;
        /** Delete an object from the project bucket (Phase 12). */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/storage/upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Returns an API-relative PUT path to upload an object via the control plane (MinIO proxy). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Deprecated; ignored (kept for compatibility). */
                        expires?: number;
                        key: string;
                    };
                };
            };
            responses: {
                /** @description Upload target (PUT with Authorization to upload_url). */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/triggers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List triggers in a project with dispatch counters. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Trigger list. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        /** Create a trigger. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /**
                         * @description For HTTP triggers, set `secret`. For cron, set `every_seconds`.
                         *     For db_poll, set `poll_seconds`. For object, configure MinIO bucket events.
                         */
                        config?: Record<string, never>;
                        /** Format: uuid */
                        target_fn: string;
                        /** @enum {string} */
                        type: PathsV1ProjectsPidTriggersPostRequestBodyContentApplicationJsonType;
                    };
                };
            };
            responses: {
                /** @description Trigger registered. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Trigger"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/triggers/{tid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a single trigger. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                    tid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Trigger detail. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Toggle a trigger's enabled state. */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                    tid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        enabled: boolean;
                    };
                };
            };
            responses: {
                /** @description Updated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        trace?: never;
    };
    "/v1/projects/{pid}/triggers/{tid}/dryrun": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Evaluate a trigger's payload-transform DSL against a sample event (Phase 6). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                    tid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        event_payload?: {
                            [key: string]: unknown;
                        };
                        transform?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            responses: {
                /** @description Evaluation result. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/triggers/{tid}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read recent execution counters and DLQ totals for a trigger. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                    tid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Trigger status. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/projects/{pid}/triggers/dlq": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List dead-letter queue events for the project. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pid: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: never;
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        BuildJob: {
            /** Format: uuid */
            build_job_id?: string;
            job_log?: string;
            job_status?: string;
        };
        Deployment: {
            /** Format: uuid */
            deployment_id?: string;
            /** @enum {string} */
            status?: DeploymentStatus;
        };
        Entrypoint: {
            /** @enum {string} */
            auth_mode?: EntrypointAuth_mode;
            enabled?: boolean;
            function?: string;
            function_slug?: string;
            /** Format: uuid */
            id?: string;
            project_slug?: string;
            public_url?: string;
            /** @description Returned only when auth_mode=signed */
            secret_token?: string;
        };
        Function: {
            /** Format: uuid */
            fn_id?: string;
            name?: string;
        };
        FunctionVersion: {
            /** @enum {string} */
            build_status?: FunctionVersionBuild_status;
            checksum?: string;
            runtime?: string;
            source_uri?: string;
            version?: string;
            /** Format: uuid */
            version_id?: string;
        };
        Problem: {
            /** @example VALIDATION_ERROR */
            code: string;
            errors?: {
                field?: string;
                message?: {
                    en?: string;
                    id?: string;
                };
            }[];
            instance?: string;
            message: {
                en?: string;
                id?: string;
            };
            message_preferred?: string;
            /** @example about:blank */
            type: string;
        };
        Project: {
            /** Format: date-time */
            created_at?: string;
            disabled?: boolean;
            /** Format: uuid */
            id?: string;
            minio_bucket?: string | null;
            name?: string;
            /** Format: uuid */
            owner_id?: string;
            provision_error?: string | null;
            /** @enum {string} */
            provision_status?: ProjectProvision_status;
            region?: string;
            slug?: string | null;
            tenant_db_name?: string | null;
        };
        Trigger: {
            config?: {
                [key: string]: unknown;
            };
            /** Format: uuid */
            target_fn?: string;
            /** Format: uuid */
            trigger_id?: string;
            /** @enum {string} */
            type?: TriggerType;
        };
    };
    responses: {
        /** @description Permission denied. */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Problem"];
            };
        };
        /** @description Internal error. */
        Internal: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Problem"];
            };
        };
        /** @description Resource not found. */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Problem"];
            };
        };
        /** @description Too many requests. */
        RateLimited: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Problem"];
            };
        };
        /** @description Authentication required. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Problem"];
            };
        };
        /** @description Validation error. */
        ValidationError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export enum PathsAdminUsersIdPatchRequestBodyContentApplicationJsonPlatform_role {
    super_admin = "super_admin",
    staff = "staff",
    user = "user"
}
export enum PathsV1ProjectsPidFunctionsFidDraftPostRequestBodyContentApplicationJsonRuntime {
    node = "node",
    go = "go",
    python = "python",
    wasm = "wasm"
}
export enum PathsV1ProjectsPidFunctionsFidEntrypointPostRequestBodyContentApplicationJsonAuth_mode {
    public = "public",
    signed = "signed",
    project_key = "project_key"
}
export enum PathsV1ProjectsPidTriggersPostRequestBodyContentApplicationJsonType {
    http = "http",
    cron = "cron",
    db_poll = "db_poll",
    object = "object"
}
export enum DeploymentStatus {
    active = "active",
    superseded = "superseded",
    failed = "failed"
}
export enum EntrypointAuth_mode {
    public = "public",
    signed = "signed",
    project_key = "project_key"
}
export enum FunctionVersionBuild_status {
    queued = "queued",
    complete = "complete",
    failed = "failed"
}
export enum ProjectProvision_status {
    pending = "pending",
    ready = "ready",
    failed = "failed"
}
export enum TriggerType {
    http = "http",
    cron = "cron",
    db_poll = "db_poll",
    object = "object"
}
export type operations = Record<string, never>;
