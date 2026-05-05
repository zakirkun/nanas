# Nanas API Reference

This is the authoritative reference for the Nanas Control Plane API. The OpenAPI summary is available at [`openapi.yaml`](../openapi.yaml). All examples assume the API is reachable at `http://localhost:8080`.

## Conventions

- All request and response bodies are JSON unless explicitly stated.
- Authentication uses `Authorization: Bearer <token>`. The token is either a JWT for a registered user or a project-scoped API key prefixed with `sk_`.
- Public webhooks use shared secrets in dedicated headers (`X-Webhook-Secret`, `X-Minio-Webhook-Secret`).
- All errors use the Problem JSON shape described in the `Errors` section.
- All timestamps are RFC 3339.
- Path parameters: `:pid` is a project UUID, `:fid` is a function UUID, `:vid` is a version UUID, `:tid` is a trigger UUID, `:id` is a user UUID for admin endpoints.

## Authentication

| Endpoint | Description |
| --- | --- |
| `POST /auth/register` | Register a user. The first registered user becomes `platform_role=super_admin`. |
| `POST /auth/login` | Exchange email and password for a JWT. |

JWT tokens expire after the duration configured in `auth.go` (24 hours by default).

## Projects

| Endpoint | Roles | Description |
| --- | --- | --- |
| `POST /v1/projects` | JWT | Create a project. Async provisioning of tenant DB and object bucket starts immediately. |
| `GET /v1/projects` | JWT | List projects accessible to the user (owner or member). |
| `GET /v1/projects/:pid` | viewer | Read project details and provisioning status. |

Project payload fields:

```json
{
  "id": "uuid",
  "name": "Hello Project",
  "slug": "hello-project",
  "owner_id": "uuid",
  "region": "default",
  "provision_status": "ready",
  "provision_error": null,
  "tenant_db_name": "tenant_xxx",
  "minio_bucket": "proj-xxx",
  "disabled": false,
  "created_at": "2026-05-04T08:00:00Z"
}
```

## Project Members and API Keys

| Endpoint | Roles | Description |
| --- | --- | --- |
| `POST /v1/projects/:pid/keys` | admin | Mint a project-scoped API key. Returns the plaintext key once. |
| `GET /v1/projects/:pid/keys` | admin | List API keys (no plaintext values). Includes `quota_rpm`. |
| `POST /v1/projects/:pid/keys/:kid/revoke` | admin | Revoke an API key. |
| `PATCH /v1/projects/:pid/keys/:kid/quota` | admin | Set per-key requests-per-minute quota; pass `{ "rpm": null }` to inherit project quota. |
| `POST /v1/projects/:pid/members` | admin | Grant a user `viewer`, `developer`, or `admin` access. |

## Tenant Database

| Endpoint | Roles | Description |
| --- | --- | --- |
| `POST /v1/projects/:pid/db/migrate` | developer | Apply allow-listed DDL (`CREATE TABLE`, `CREATE INDEX`, selected `CREATE EXTENSION`, `COMMENT ON`). |
| `POST /v1/projects/:pid/db/query` | developer | Run a guarded `SELECT/INSERT/UPDATE/DELETE`. Set `explain: true` for `EXPLAIN ANALYZE`. |
| `GET /v1/projects/:pid/data/catalog/tables` | developer | List `public` base tables (safe identifiers) from the tenant database. |
| `GET /v1/projects/:pid/data/tables/:table/rows` | developer | Read rows from an allow-listed tenant table. |
| `GET /v1/projects/:pid/settings/data-allowlist` | viewer | Read the project's table allowlist for GraphQL / read-rows. |
| `PATCH /v1/projects/:pid/settings/data-allowlist` | developer | Replace the table allowlist (validated identifiers); use `{"tables":[]}` to clear. |

## Object Storage

| Endpoint | Roles | Description |
| --- | --- | --- |
| `POST /v1/projects/:pid/storage/upload` | developer | Returns an API-relative path; `PUT` that path with `Authorization: Bearer …` to upload bytes (backend proxies to MinIO). |
| `PUT /v1/projects/:pid/storage/objects/*key` | developer | Upload or replace an object (streams body to the tenant bucket via the backend). |
| `GET /v1/projects/:pid/storage/objects/*key` | developer | Download an object (streams from MinIO through the backend). |
| `POST /v1/projects/:pid/storage/download` | developer | Returns an API-relative path for `GET` download via the same proxy (legacy clients that expected a presigned URL now receive a path under `/v1/...`). |

Object keys must be safe paths (no leading `/`, no `..`, no control characters).

## Functions, Versions, Builds, Deployments

| Endpoint | Roles | Description |
| --- | --- | --- |
| `POST /v1/projects/:pid/functions` | developer | Create a function. A slug is generated from the name. |
| `POST /v1/projects/:pid/functions/:fid/artifacts/presign` | developer | Returns an API-relative URL for artifact upload; `PUT` with Bearer token (backend proxies to MinIO). |
| `PUT /v1/projects/:pid/functions/:fid/artifacts/upload?version=` | developer | Upload tarball bytes for the given version (same bucket path as presign). |
| `POST /v1/projects/:pid/functions/:fid/versions` | developer | Register an immutable version. Duplicate versions return `409 VERSION_IMMUTABLE`. |
| `GET /v1/projects/:pid/functions/:fid/versions/:vid/build` | developer | Read build status (`queued`, `complete`, or `failed`). |
| `POST /v1/projects/:pid/functions/:fid/deploy` | developer | Deploy a complete version. Build must be `complete`. |
| `POST /v1/projects/:pid/functions/:fid/deployments/rollback` | developer | Reactivate the previous deployment. |
| `POST /v1/projects/:pid/functions/:fid/invoke` | developer | Project-scoped invocation. |

## Public Function Entrypoint

| Endpoint | Description |
| --- | --- |
| `POST /v1/projects/:pid/functions/:fid/entrypoint` | Configure auth mode (`public`, `signed`, `project_key`) and enabled state. |
| `GET /v1/projects/:pid/functions/:fid/entrypoint` | Read entrypoint configuration. Returns `secret_token` only for `signed` mode. |
| `ANY /fn/:project_slug/:fn_slug` | Public invocation. Body is forwarded to the dataplane. |
| `ANY /fn/:project_slug/:fn_slug/*subpath` | Same as above with an arbitrary subpath. |

Auth mode behavior:

- `public`: no authentication. Use only for fully public endpoints.
- `signed`: send `X-Entrypoint-Token` header (or `?token=` query). The server compares against the stored `secret_token`.
- `project_key`: send `Authorization: Bearer sk_...`. The key must belong to the same project.

The dataplane receives the same tenant environment as the project-scoped invocation: `TENANT_DATABASE_URL`, `MINIO_ENDPOINT`, `MINIO_BUCKET`, `TENANT_MINIO_BUCKET`, `MINIO_USE_SSL`.

## Triggers

| Endpoint | Roles | Description |
| --- | --- | --- |
| `POST /v1/projects/:pid/triggers` | developer | Create a trigger (`type` ∈ `http`, `cron`, `db_poll`, `object`). |
| `POST /v1/projects/:pid/triggers/:tid/test-fire` | developer | Manually publish a dispatch event. |
| `GET /v1/projects/:pid/triggers/dlq` | viewer | List dead-letter queue events. |
| `POST /v1/projects/:pid/cdc/subscriptions` | developer | Subscribe a function to row-level events from a tenant table using PostgreSQL LISTEN/NOTIFY. |
| `GET /v1/projects/:pid/cdc/subscriptions` | viewer | List CDC subscriptions. |
| `DELETE /v1/projects/:pid/cdc/subscriptions/:id` | developer | Remove a CDC subscription. |
| `POST /v1/ingress/:tid` | n/a (webhook) | HTTP ingress. Validates `X-Webhook-Secret` or `X-Nanas-Signature` when `triggers.config.signed=true`. |
| `POST /internal/minio-events` | n/a (webhook) | MinIO/S3 event webhook. Validates `X-Minio-Webhook-Secret`. |

Trigger configuration examples:

- HTTP: `{"secret":"hunter2"}` or `{"secret":"hunter2","signed":true}` to require HMAC signatures.
- Cron: `{"every_seconds":60}`
- DB poll: `{"poll_seconds":120}` (consider replacing with CDC where possible).
- Object: configure MinIO bucket notifications to call `/internal/minio-events`.

### Webhook Signatures

When a trigger has `signed=true`, the ingress endpoint requires the `X-Nanas-Signature` header in the form `t=<unix>,v1=<hex_hmac_sha256>`. The signature covers `<unix>.<body>` using the trigger secret. Requests with a timestamp outside `WEBHOOK_MAX_SKEW_SECONDS` (default 300) are rejected with `WEBHOOK_SIGNATURE_EXPIRED`. Public function entrypoints with `auth_mode=signed` accept either `X-Entrypoint-Token` or `X-Nanas-Signature`.

## Realtime

| Endpoint | Roles | Description |
| --- | --- | --- |
| `GET /v1/projects/:pid/realtime/ws` | viewer | WebSocket. Send `{"op":"subscribe","channels":["triggers","objects","entrypoint"]}` to receive broadcast events. |
| `GET /v1/projects/:pid/realtime/sse` | viewer | Server-sent events stub. |

## Observability

| Endpoint | Roles | Description |
| --- | --- | --- |
| `GET /v1/projects/:pid/observability/logs` | viewer | Filter by `deployment_id`, `from`, `to`, `limit`. |
| `GET /v1/projects/:pid/audit` | admin | List audit events. |
| `GET /metrics` | n/a | Prometheus metrics. |

Per-project Prometheus series include:

- `nanas_invocations_total{project,function,result}`
- `nanas_invocation_seconds_bucket{project,function,le}` (and `_sum`, `_count`)
- `nanas_db_query_total{project,result}`

The control plane and dataplane export OTLP traces when `OTEL_EXPORTER_OTLP_ENDPOINT` is configured.

## Marketplace

| Endpoint | Description |
| --- | --- |
| `POST /v1/marketplace/packages` | Create or upsert a package owned by the caller. |
| `GET /v1/marketplace/packages` | List public packages with pagination. |
| `GET /v1/marketplace/packages/:slug` | Read a package summary. |
| `POST /v1/marketplace/packages/:slug/versions` | Publish a new version (publisher only). Version must follow semver. |
| `GET /v1/marketplace/packages/:slug/versions` | List published versions newest first. |
| `GET /v1/marketplace/packages/:slug/versions/:version` | Read a single version. |
| `POST /v1/projects/:pid/marketplace/install` | Install a package into a project. If `version` is omitted, the highest semver is selected. Each install is audited. |

## Platform Administration

All endpoints below require a JWT and a platform role.

| Endpoint | Minimum role | Description |
| --- | --- | --- |
| `GET /admin/users` | staff | List users with pagination. |
| `PATCH /admin/users/:id` | super_admin | Update a user's `platform_role`. |
| `GET /admin/projects` | staff | List projects across all owners. |
| `POST /admin/projects/:pid/disable` | staff | Block all project-scoped operations with `PROJECT_DISABLED`. |
| `POST /admin/projects/:pid/enable` | staff | Re-enable a project. |

## Errors

All errors share the Problem JSON shape:

```json
{
  "type": "about:blank",
  "code": "VALIDATION_ERROR",
  "message": { "id": "Validasi gagal.", "en": "Validation failed." },
  "message_preferred": "Validation failed.",
  "instance": "request-id",
  "errors": [
    { "field": "email", "message": { "id": "Email ini sudah terdaftar.", "en": "This email is already registered." } }
  ]
}
```

The `message_preferred` field follows the request `Accept-Language` header. The catalog below lists every stable code currently emitted by the API.

| Code | HTTP | Notes |
| --- | --- | --- |
| `INTERNAL_ERROR` | 500 / 503 | Unexpected server error. |
| `STORAGE_UNAVAILABLE` | 503 | Object storage unreachable. |
| `UNAUTHORIZED` | 401 | Missing or invalid bearer token. |
| `FORBIDDEN` | 403 | Project-scoped permission denied. |
| `PLATFORM_FORBIDDEN` | 403 | Platform-level role required. |
| `PROJECT_DISABLED` | 403 | Project disabled by an administrator. |
| `NOT_FOUND` | 404 | Resource missing. |
| `VALIDATION_ERROR` | 400 | Request body or parameter invalid. |
| `PROJECT_NOT_FOUND` | 404 | Project missing. |
| `FUNCTION_NOT_FOUND` | 404 | Function missing or wrong project. |
| `DEPLOYMENT_NOT_FOUND` | 404 | Deployment missing. |
| `TRIGGER_NOT_FOUND` | 404 | Trigger missing. |
| `INVALID_CREDENTIALS` | 401 | Email or password incorrect. |
| `KEY_REVOKED` | 401 | API key revoked. |
| `PROVISIONING_PENDING` | 400 | Tenant DB or bucket not ready. |
| `RATE_LIMITED` | 429 | IP or project quota exceeded. |
| `PACKAGE_NOT_FOUND` | 404 | Marketplace package missing. |
| `WASM_PHASE2` | 501 | Wasm preview not enabled in MVP. |
| `VERSION_IMMUTABLE` | 409 | Function version already exists. |
| `BUILD_PENDING` | 409 | Cannot deploy while build is incomplete. |
| `GATEWAY_ERROR` | 502 | Dataplane invocation failed. |
| `TRIGGER_ID_INVALID` | 400 | Trigger ID could not be parsed. |
| `HTTP_TRIGGER_NOT_FOUND` | 404 | HTTP trigger missing or disabled. |
| `WEBHOOK_SECRET_MISMATCH` | 401 | HTTP trigger secret mismatch. |
| `MINIO_WEBHOOK_UNAUTHORIZED` | 401 | MinIO webhook secret mismatch. |
| `OBJECT_EVENT_BODY_INVALID` | 400 | Object webhook body missing. |
| `OBJECT_EVENT_PARSE_ERROR` | 400 | Object webhook payload invalid. |
| `OBJECT_BUCKET_UNKNOWN` | 404 | No project mapped to bucket. |
| `OBJECT_KEY_INVALID` | 400 | Object key has unsafe path segments. |
| `EMAIL_ALREADY_TAKEN` | 400 (field) | Registration email duplicate. |
| `FIELD_BUILD_NOT_READY` | 409 (field) | Build is not complete. |
| `SQL_EXECUTION_FAILED` | 400 (field) | DB rejected query. |
| `TABLE_ACCESS_DENIED` | 400 (field) | Table not in allowlist. |
| `TENANT_SECRET_KEY_REQUIRED` | 400 (field) | `TENANT_SECRET_ENCRYPTION_KEY` must be configured. |
| `GRAPHQL_QUERY_REQUIRED` | 400 (field) | GraphQL query string empty. |
| `ENTRYPOINT_NOT_FOUND` | 404 | Public function entrypoint not configured. |
| `ENTRYPOINT_DISABLED` | 403 | Public entrypoint disabled. |
| `ENTRYPOINT_AUTH_REQUIRED` | 401 | Public entrypoint authentication failed. |
| `ENTRYPOINT_BAD_AUTH_MODE` | 400 | Auth mode value invalid. |
| `ROLE_INVALID` | 400 | Platform role value invalid. |
| `MARKETPLACE_VERSION_NOT_FOUND` | 404 | Marketplace package version missing. |
| `MARKETPLACE_VERSION_EXISTS` | 409 | Marketplace package version already exists. |
| `MARKETPLACE_VERSION_INVALID` | 400 | Marketplace version is not valid semver. |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | HMAC signature missing or mismatched. |
| `WEBHOOK_SIGNATURE_EXPIRED` | 401 | HMAC signature timestamp outside the configured skew. |
| `QUOTA_RPM_INVALID` | 400 | API key quota_rpm must be a positive integer or null. |
| `CDC_TABLE_INVALID` | 400 | Tenant CDC subscription table name failed identifier validation. |
| `CDC_FUNCTION_NOT_FOUND` | 404 | CDC subscription function does not belong to the project. |
