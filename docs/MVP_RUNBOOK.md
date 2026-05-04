# MVP Runbook (20 Minutes)

This runbook walks through the MVP flow: **register → create project → wait for provisioning → create tenant schema → upload an artifact → create a version → deploy → invoke (project-scoped or public entrypoint) → inspect logs and traces**. It also covers platform admin operations.

## Prerequisites

- Start the stack with `docker compose up -d`.
- Use `http://localhost:8080` as the API base URL unless `HTTP_ADDR` is changed.
- Visit `http://localhost:8080/` for the bundled web UI; every step below is also clickable from the dashboard.
- Verify readiness with `GET /readyz`. A `200` response means the platform PostgreSQL database and MinIO object storage are reachable. A MinIO failure returns `STORAGE_UNAVAILABLE` (503). Tenant provisioning also requires a database role that can run `CREATE DATABASE`; configure `TENANT_DB_SUPER_URL` if `DATABASE_URL` does not have that privilege.

## Steps

1. **Register and save a JWT**: call `POST /auth/register` and store the returned bearer token. The first registered user becomes `platform_role=super_admin` automatically.
2. **Create a project**: call `POST /v1/projects` with the bearer token. Save the returned project `id` and `slug`.
3. **Poll provisioning**: call `GET /v1/projects/:pid` until `provision_status` is `ready`. The response includes `tenant_db_name`, `minio_bucket`, `disabled`, and `provision_error` if provisioning fails.
4. **Create the first tenant schema**: call `POST /v1/projects/:pid/db/migrate` with `{ "sql": "CREATE TABLE ..." }`. The MVP allows controlled `CREATE TABLE`, `CREATE INDEX`, selected `CREATE EXTENSION`, and `COMMENT ON` statements.
5. **Configure the read allowlist (optional)**: call `PATCH /v1/projects/:pid/settings/data-allowlist` with `{ "tables": ["table_name"] }`.
6. **Upload a function artifact**: call `POST /v1/projects/:pid/functions/:fid/artifacts/presign`, upload the artifact to the returned presigned URL, then call `POST /v1/projects/:pid/functions/:fid/versions` with `artifact_key`, `checksum`, and `runtime`.
7. **Poll build status**: call `GET /v1/projects/:pid/functions/:fid/versions/:vid/build` until `build_status` is `complete`.
8. **Deploy the function**: call `POST /v1/projects/:pid/functions/:fid/deploy`. The control plane registers the deployment with the dataplane and injects tenant database and object storage environment values.
9. **Invoke the deployment (project-scoped)**: call `POST /v1/projects/:pid/functions/:fid/invoke` with a JWT or `sk_...` API key.
10. **Configure a public entrypoint (optional)**: call `POST /v1/projects/:pid/functions/:fid/entrypoint` with `auth_mode` (`public`, `signed`, or `project_key`). Read the URL with `GET .../entrypoint`.
11. **Invoke through the public entrypoint**: call `POST /fn/{project_slug}/{function_slug}`. Supply `X-Entrypoint-Token` for `signed` mode or `Authorization: Bearer sk_...` for `project_key` mode.
12. **Inspect observability data**: call `GET /v1/projects/:pid/observability/logs?deployment_id=&from=&to=&limit=`. Configure `OTEL_EXPORTER_OTLP_ENDPOINT` to export traces from the control plane and dataplane.
13. **Configure triggers**: create HTTP triggers, cron triggers (`type=cron`, `every_seconds`), database polling triggers (`type=db_poll`, `poll_seconds`), or object event triggers. HTTP ingress uses `POST /v1/ingress/:trigger_id` with `X-Webhook-Secret`. MinIO events use `POST /internal/minio-events` with `X-Minio-Webhook-Secret`.
14. **Inspect the dead-letter queue**: call `GET /v1/projects/:pid/triggers/dlq`.
15. **Subscribe to realtime events**: open the WebSocket endpoint and send `{ "op": "subscribe", "channels": ["triggers"] }`.
16. **Review the API summary**: call `GET /openapi.yaml` or open [docs/API.md](API.md).

## Platform Administration (super_admin / staff)

- `GET /admin/users` lists all users with their `platform_role`.
- `PATCH /admin/users/:id` updates a user's platform role (super_admin only).
- `GET /admin/projects` lists projects across all owners.
- `POST /admin/projects/:pid/disable` blocks all project-scoped operations with `PROJECT_DISABLED`.
- `POST /admin/projects/:pid/enable` re-enables the project.

Disabling a project does not destroy data; it only prevents requests from continuing past the project guard.

## Important Variables

- `TENANT_SECRET_ENCRYPTION_KEY`: 32-byte raw or base64 key used by `POST /v1/projects/:pid/settings/tenant-secrets`.
- `MINIO_WEBHOOK_SECRET`: secret for object storage webhooks.
- `NATS_URL`: JetStream trigger dispatch endpoint. Leave empty to disable event bus integration.
- `PUBLIC_API_BASE_URL`: base URL embedded in public entrypoint responses.
