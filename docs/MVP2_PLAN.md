# MVP 2 Plan

This document captures the next iteration of Nanas. MVP 1 delivers a working backend, basic dataplane sandbox, and structured Problem responses. MVP 2 turns Nanas into a more credible self-hostable function platform.

## PRD-aligned control-plane status

The following PRD-shaped capabilities are now reflected in the main branch: function/trigger/deployment listing APIs, in-browser drafts and expanded deploy metadata, payload-transform DSL with trigger dry-run, SQL-style realtime subscriptions over CDC-shaped events, trace collection endpoints, storage object listing/deletion, RBAC permissions + retention settings, async function invoke (JetStream when configured), SendGrid integration (encrypted secrets), migration history, global search (cmdk), mobile bottom navigation, and overview quick-start snippets. Remaining MVP 2 roadmap items below (Kaniko/sandboxed runtimes, multi-region tables, KMS, etc.) are still open.

Each section lists target files (when known), required schema changes, and acceptance criteria so the work can be picked up section by section.

## 1. Real Function Build Pipeline

Replace the simulated build in [`cmd/api/main.go`](../cmd/api/main.go) (`simulateBuild`) with a real builder.

- Out-of-process builder service (Kaniko or Buildpacks) that:
  - Pulls the artifact from object storage.
  - Builds a runtime image (Node, Go, optionally Python).
  - Pushes to a private container registry or stores a signed tarball.
- Schema changes:
  - `build_jobs` adds `image_ref`, `started_at`, `runner_id`, `image_signature`.
  - `function_versions` adds `image_ref` and `cold_start_budget_ms`.
- Acceptance:
  - `POST /v1/projects/:pid/functions/:fid/versions` returns `build_status=queued`, transitions to `building`, then `complete` or `failed` with logs.
  - Failed builds keep the version row but block deploy until a new version is pushed.

## 2. Sandboxed Runtimes

Replace the smoke runtime in [`cmd/dataplane/main.go`](../cmd/dataplane/main.go) with isolated execution.

- gVisor or Firecracker microVMs per invocation.
- Cgroup-based CPU and memory caps.
- Filesystem isolation: read-only artifact, scratch tmpfs for working state.
- Network policy: tenant DB and object storage only by default.
- Acceptance:
  - Each invocation runs the artifact code, returns the function output, and tears down the sandbox.
  - Rogue code cannot exceed configured CPU and memory limits.
  - Cold-start time is reported as a metric.

## 3. Multi-region Placement

- Add `regions` table with `id`, `name`, `dataplane_url`.
- Extend `deployments` with `region_id` and add a placement strategy (default region with override on deploy).
- Provide Kubernetes manifests for control plane and dataplane Helm chart in `deploy/k8s/`.
- Acceptance:
  - Operators can register multiple regions.
  - `POST .../deploy` accepts a `region` body field and routes invocations to the matching dataplane.

## 4. Marketplace MVP

Today the marketplace tables exist but flows are stubs.

- Full CRUD for packages and versions: `POST /v1/marketplace/packages/:slug/versions`, `GET /v1/marketplace/packages`, `GET /v1/marketplace/packages/:slug/versions/:version`.
- Signed packages: server stores SHA-256 hash and optional Sigstore signature.
- Semver resolution: install picks the highest compatible version.
- Install audit: every install records actor, project, version.
- Acceptance:
  - Publishers can push, list, and version packages.
  - Projects can install a package version that creates a function plus optional default trigger.

## 5. Tenant Change Data Capture

Replace the polling-based `db_poll` triggers with PostgreSQL `LISTEN/NOTIFY` or logical replication.

- Add `tenant_cdc_subscriptions` table.
- Provide a tenant DDL helper to install a `pg_notify` trigger function on a target table.
- Acceptance:
  - Tenants subscribe a function to a table.
  - INSERT/UPDATE/DELETE on the table triggers the function within seconds.

## 6. Wasm Runtime

Move beyond the `WASM_PHASE2` placeholder.

- Embed Wasmtime or Wasmer in the dataplane.
- Allow `runtime=wasm` versions with a defined ABI for HTTP request/response, KV, and SQL handles.
- Acceptance:
  - A simple Rust or AssemblyScript module can be deployed and invoked through the public entrypoint.

## 7. SDKs and CLI

- Go SDK: typed clients for projects, functions, deployments, and entrypoints.
- JavaScript/TypeScript SDK with runtime helpers (env discovery, KV, SQL).
- CLI binary: `nanas projects ls`, `nanas fn deploy`, `nanas logs tail`, etc.
- Acceptance:
  - Both SDKs are published to GitHub releases with semantic versioning.
  - The CLI uses the SDKs and stores credentials in `~/.config/nanas/`.

## 8. Webhook Hardening

- Standardize HMAC signatures: every webhook signs payloads with `X-Nanas-Signature: t=<unix>,v1=<hex_hmac>`.
- Replay protection: reject signatures older than 5 minutes.
- Replace `X-Webhook-Secret` and `X-Minio-Webhook-Secret` with the unified scheme; keep them for one minor release as deprecated aliases.
- Acceptance:
  - All ingress endpoints reject unsigned or expired requests.

## 9. Quotas and Billing Meters

- Per-API-key quotas in addition to per-project quotas.
- Daily and monthly usage counters: invocations, CPU seconds, egress bytes, storage GB-hours.
- New tables: `usage_counters`, `usage_daily`.
- Acceptance:
  - Operators can set quotas per project and per API key.
  - The control plane returns `RATE_LIMITED` when quotas are exceeded with `Retry-After` header.

## 10. Real GraphQL Surface

- Generate a GraphQL schema from the project's table allowlist.
- Support read queries with pagination and filtering, and write mutations behind explicit allowlist entries.
- Acceptance:
  - `POST /v1/projects/:pid/graphql` returns real data instead of the `health` stub.
  - Schema is introspectable per project and includes only allowlisted tables.

## 11. Hardened Secrets

- Replace the symmetric `TENANT_SECRET_ENCRYPTION_KEY` with envelope encryption backed by a KMS (AWS KMS, GCP KMS, HashiCorp Vault).
- Add key rotation: `POST /admin/secrets/rotate`.
- Acceptance:
  - Tenant secrets persist as ciphertext and a key reference.
  - Rotation re-encrypts all rows with the new key without downtime.

## 12. Observability Improvements

- Expose per-project metrics on `/metrics` with project labels.
- Ship default Grafana dashboards under `deploy/grafana/`.
- Add `GET /v1/projects/:pid/observability/traces/:trace_id` to fetch trace summaries.
- Acceptance:
  - Operators have a dashboard for invocations, error rates, and per-project quota burn.

## Out of Scope for MVP 2

These are tracked for MVP 3+:

- Realtime presence and channel ACLs.
- Cross-cluster federation and multi-tenant isolation at the network layer.
- Edge compute placement based on geographic proximity.
- Workflow engine (durable function chains).
