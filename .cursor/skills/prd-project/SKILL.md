---
name: prd-project
description: Drafts and refines product requirement documents (PRD) for software projects—problem statement, goals, personas, scope, functional/non-functional requirements, user stories, acceptance criteria, risks, and rollout. Use when the user asks for a PRD, product requirements, feature specification, scope doc, "what to build," prioritization framing, or before breaking work into implementation tasks.
disable-model-invocation: true
---

# PRD Project

## 1. Overview
A hosted developer platform that unifies relational data (Postgres), object storage (MinIO), and a first‑class "functional API" layer: versioned, composable functions deployed next to data that expose REST/GraphQL/FP-friendly endpoints, triggers and real‑time streams. The platform reduces operational overhead, egress latency/costs, and scattered business logic by running safe, testable, composable transforms adjacent to storage. Target users: frontend/full‑stack engineers, SaaS startups, and data/ML teams.

## 2. Requirements

### Functional Requirements (MVP)
- Multi‑tenant projects with RBAC and API keys
- Postgres database provisioning per project (managed/self‑hosted option)
- Object storage (MinIO) with signed uploads/downloads
- Deployable, versioned serverless functions (small FP-style handlers) colocated with data
- Function triggers: HTTP, DB triggers (after insert/update/delete), object events, scheduled jobs
- Declarative functional query/transform DSL (map/filter/reduce primitives) that runs on DB rows/objects
- REST and GraphQL endpoints auto-generated for functions and selected tables
- Real‑time streams (WebSocket / Server-Sent Events) for subscribed queries/changes
- Observability: logs, traces, function metrics, query profiling
- SDKs for web/mobile/edge (JS/TS, Flutter/Expo examples)
- CLI and dashboard for development, deployments, and observability

### Non‑Functional Requirements
- Low latency for data‑adjacent compute; target p95 cold start < 150ms for warmed functions
- Versioned, immutable function artifacts and rollbacks
- Secure tenancy and network isolation
- Scalable control plane (Go services) and data plane (co‑located functions)
- Audit logs and retention policy configurable per project

### Success Metrics (first 6 months)
- Time to first deploy (new user): < 20 minutes
- Number of projects successfully running function + DB + storage: target 500
- Observability adoption: 80% of deployed functions have traces/logs enabled
- Average function egress reduction vs remote serverless: > 30% for typical data transforms

## 3. Core Features
- Project & tenant management: projects, API keys, roles.
- Data: provisioned Postgres per project, managed backups, query access control.
- Storage: MinIO buckets, signed URLs, metadata indexing.
- Functional API layer:
  - Versioned functions (v1, v2, …), immutably stored.
  - Small, composable functions with a functional DSL and standard library (map/filter/reduce, joins, aggregates).
  - Local testing harness and CI integration.
- Triggers & Events:
  - DB triggers (row-level), object events, HTTP/webhook triggers, cron jobs.
  - Event delivery with at-least-once semantics, dead-letter queue.
- Real‑time:
  - Subscription endpoints exposing transformed streams (diffs / full payload).
- Observability:
  - Logs, structured traces, metrics, query profiler, function execution traces.
- SDKs & CLI:
  - JS/TS SDK (browser/node/edge), Flutter/Expo integration examples.
- Marketplace (phase 2): shareable/syncable function libraries (not in MVP).

## 4. User Flow

1. Onboard
   - Create account → create project → provision DB & storage (one click).
2. Schema & Data
   - Define tables (SQL migration or UI) → upload objects (MinIO).
3. Create Function
   - New function: choose runtime (Go/JS), write code or compose via DSL, local test.
4. Version & Deploy
   - Publish version → deploy to data plane (edge node next to DB/storage).
5. Expose & Integrate
   - Expose HTTP/GraphQL endpoint, create DB trigger, or schedule cron.
6. Observe & Iterate
   - View logs/traces → adjust code → roll forward/rollback versions.
7. Scale & Secure
   - Configure RBAC, quotas, retention, backups.

## 5. Architecture & Integrations

Architectural components:
- Control plane (Go; Gin/Fiber; Cloud Run): API gateway, auth, project orchestration, deployments.
- Data plane: colocated workers that run functions next to Postgres and MinIO.
- Postgres (self‑hosted or managed) per project; MinIO for object storage.
- Service Mesh and deployment (Fly.io / Render / Kubernetes + Service Mesh).
- SDKs and CLI for developer access.

Provided API DOCS (integrated verbatim)
> Based on the concept provided, **external third-party APIs are not strictly necessary** for the core platform functionality you've described. The product is designed as a self-contained, hosted developer platform that bundles database, storage, compute, and observability—eliminating the need for external integrations at the infrastructure level.
> 
> However, the search results provided focus on API monitoring and observability tools rather than third-party service integrations. To give you concrete examples of external API endpoints and JSON payloads that *would* be relevant to this platform, I would need search results covering specific integration categories such as:
> 
> - **Email services** (SendGrid, Mailgun) — for notification triggers
> - **Payment gateways** (Stripe, Midtrans) — if users want to monetize or add billing
> - **Authentication providers** (Auth0, Firebase) — for social login or advanced auth flows
> - **Analytics platforms** (Segment, Mixpanel) — for event tracking
> - **Messaging services** (Twilio, Firebase Cloud Messaging) — for real-time notifications
> - **AI/ML APIs** (OpenAI, Anthropic) — if the platform offers AI-powered features
> 
> The platform itself provides the foundational layers (database, storage, serverless functions, auth, events, observability), so these external APIs would only be needed if your users want to *integrate external services into their applications* built on your platform—not for the platform's core operations.
> 
> To provide the specific API endpoint examples and JSON payloads you've requested, I would need to search for and review the official documentation of the services you're considering. Would you like me to search for specific third‑party API documentation (e.g., Stripe payments, SendGrid email, or another service)?

Internal platform API endpoints (MVP) — concise reference

| Endpoint | Method | Description | Request (example) | Response (example) |
|---|---:|---|---|---|
| /v1/projects | POST | Create project | { "name":"acme", "region":"us‑east1" } | { "id":"proj_123", "db":"postgres://..." } |
| /v1/projects/:id/keys | POST | Create API key | { "role":"service" } | { "key":"sk_***" } |
| /v1/functions | POST | Create function (metadata + code upload) | { "project_id":"proj_123","name":"invoice_total","runtime":"go","entry":"Handler","source_url":"s3://..." } | { "fn_id":"fn_45","version":"v1" } |
| /v1/functions/:id/deploy | POST | Deploy function version | { "version":"v1","env":{}} | { "deployment_id":"d_1","status":"deploying" } |
| /v1/functions/:id/invoke | POST | Invoke function (sync) | { "input":{ "order_id":123 } } | { "status":200,"output":{ "total":1999 } } |
| /v1/db/query | POST | Run parameterized SQL (server role) | { "project_id":"proj_123","sql":"SELECT * FROM users WHERE id=$1","params":[1] } | { "rows":[{...}] } |
| /v1/storage/upload | POST | Create signed upload URL | { "project_id":"proj_123","bucket":"avatars","key":"u/1.png","expires":3600 } | { "upload_url":"https://minio/...","method":"PUT" } |
| /v1/triggers | POST | Register trigger (db/object/http/cron) | { "project_id":"proj_123","type":"db","table":"orders","event":"INSERT","target_fn":"fn_45" } | { "trigger_id":"t_1","status":"active" } |
| /v1/realtime/subscribe | WS / SSE | Subscribe to a query stream | (WS open with auth) { "op":"subscribe","query":"SELECT * FROM orders WHERE status='open'"} | stream of change events |
| /v1/observability/logs | GET | Fetch logs | { "deployment_id":"d_1","from":"ts","to":"ts" } | { "logs":[{ "ts":...,"msg":"..." }] } |
| /v1/audit | GET | Project audit trail | { "project_id":"proj_123","limit":100 } | { "events":[...] } |

Example payloads (internal)

- Create function
  {
    "project_id":"proj_123",
    "name":"invoice_total",
    "runtime":"go",
    "source_archive":"s3://builds/acme/invoice_total_v1.tar.gz",
    "entry":"Handler",
    "env": { "DB_URL":"$DB_URL" }
  }

- Deploy
  {
    "fn_id":"fn_45",
    "version":"v1",
    "strategy":"rolling",
    "resources":{ "cpu":"200m","memory":"256Mi" }
  }

- Trigger registration (DB row trigger)
  {
    "project_id":"proj_123",
    "type":"db",
    "table":"orders",
    "event":"INSERT",
    "target_fn":"fn_45",
    "payload_transform":{
      "map":[ "id","amount","customer_id" ],
      "filter":"amount > 0"
    }
  }

External integrations (optional adapters)
- Note: external third‑party APIs are optional for user apps built on the platform. The platform provides adapter connectors; below are generic example shapes (NOT official vendor docs) that show how an adapter call might be made from a function.

Example: Email adapter (generic)
- POST /integrations/email/send
  Request:
  {
    "to":"user@example.com",
    "from":"noreply@acme.app",
    "subject":"Invoice Ready",
    "html":"<p>Your invoice...</p>"
  }
  Response:
  { "message_id":"msg_abc123", "status":"queued" }

Example: Payment adapter (generic)
- POST /integrations/payments/charge
  Request:
  {
    "customer_id":"cus_123",
    "amount":1999,
    "currency":"usd",
    "source":"tok_visa",
    "metadata":{ "order_id":456 }
  }
  Response:
  { "charge_id":"ch_789", "status":"succeeded" }

Example: Messaging adapter (generic)
- POST /integrations/sms/send
  Request:
  { "to":"+15551234567", "from":"+15557654321", "body":"Your code is 1234" }
  Response:
  { "sid":"SMxxxx", "status":"sent" }

Adapter design: the platform provides a canonical adapter interface. Adapters are optional, configured per project with secrets. The platform will not embed vendor‑specific docs; it will map vendor payloads inside adapter implementations.

Security & network flows
- All function invocations from public endpoints pass through API gateway with rate limits and auth validation.
- Data plane nodes run in the same subnet/VPC as DB/MinIO for low latency egress.
- Secrets stored in encrypted vault; functions access via injected env vars or secrets API.

CI/CD & deployment pipeline
- Build in isolated build service → create artifact → upload to object store → control plane triggers rollout to data plane nodes chosen by region and data locality.

Observability integration
- Traces and metrics exported to platform tracing UI.
- Optional export adapters to third‑party SIEMs/monitoring tools (configured per project).

## 6. Database Schema

Primary tables (Postgres). Types shown as concise pseudo‑SQL.

projects
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| owner_id | uuid FK users | |
| region | text | |
| created_at | timestamptz | |

users
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | text unique | |
| role | text | global role |
| created_at | timestamptz | |

api_keys
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK | |
| key_hash | text | stored hashed |
| role | text | e.g., service, admin |
| created_at | timestamptz | |

functions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | fn identifier |
| project_id | uuid FK | |
| name | text | |
| created_by | uuid FK users | |
| current_version | text | |

function_versions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| fn_id | uuid FK functions | |
| version | text | e.g., v1 |
| source_uri | text | artifact location |
| runtime | text | go/js |
| checksum | text | |
| created_at | timestamptz | |

deployments
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| fn_version_id | uuid FK | |
| region | text | |
| status | text | deploying/active/failed |
| started_at | timestamptz | |

triggers
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK | |
| type | text | db/object/http/cron |
| target_fn | uuid FK functions | |
| config | jsonb | payload transform, schedule etc. |
| enabled | bool | |

objects (storage metadata)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK | |
| bucket | text | |
| key | text | |
| size | bigint | |
| etag | text | |
| created_at | timestamptz | |

events
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK | |
| type | text | db_insert/object_put/function_invoked |
| payload | jsonb | |
| created_at | timestamptz | |

logs
| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| project_id | uuid FK | |
| deployment_id | uuid FK | |
| level | text | info/warn/error |
| message | text | |
| ts | timestamptz | indexed |

permissions / roles
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK | |
| subject_id | uuid | user/team |
| role | text | admin/developer/viewer |
| resource | text | optional scoping |

Indexes: common FK indexes, GIN on jsonb columns, partial indexes for recent logs/events.

## 7. Constraints

- Data locality requirement: functions must run in same region/VPC as DB/MinIO to achieve low egress — requires orchestrator placement logic.
- Cold start and resource constraints: minimal function container sizes to keep latency low; concurrency and memory limits required.
- Multi‑tenant isolation: strong tenant network isolation and secrets separation; audit trail for all admin actions.
- Backups & DR: Postgres backups must be configured per project; restore processes may take time depending on DB size.
- Observability cost: trace/log retention must be configurable to control cost.
- No mandatory external third‑party APIs: core platform works without external vendor dependencies; integrations are provided as optional adapters configured by users.
- Compliance & data governance: customers may require specific regions or data residency; platform must support region restrictions.
- Development velocity: the functional DSL and SDKs must remain minimal in MVP to avoid scope creep.

--- 

If you want, I can:
- Expand the platform API reference into full OpenAPI spec for v1 endpoints.
- Draft example SDK methods (JS / Flutter) showing end‑to‑end: create function → deploy → subscribe to real‑time stream.
- Search and produce concrete third‑party integration docs (Stripe, SendGrid, Twilio) and adapter payload mappings.

---

BRD
----
Purpose
- Deliver a hosted developer platform that unifies Postgres, MinIO, and a versioned, composable "functional API" layer (serverless functions colocated with data). Reduce operational overhead and egress latency by running transforms adjacent to storage.

Scope (MVP)
- Multi‑tenant projects with RBAC and API keys.
- Per‑project Postgres (managed/self‑hosted) and MinIO buckets with signed uploads/downloads.
- Versioned, deployable functions (Go/JS) with triggers (HTTP, DB row events, object events, cron) and real‑time subscriptions (WS/SSE).
- Declarative functional DSL (map/filter/reduce) for transforms.
- Auto‑generated REST and GraphQL endpoints for functions/tables.
- Observability: logs, traces, metrics, query profiling.
- SDKs (JS/TS, Flutter examples), CLI, dashboard.

Stakeholders
- Product: define feature prioritization and acceptance criteria.
- Engineering: implement control plane, data plane, SDKs and CI.
- SRE/Security: ensure multi‑tenant isolation, backups, DR.
- UX: onboarding, dashboard/CLI flows.
- Customers: frontend/full‑stack engineers, SaaS startups, data/ML teams.

Success Criteria (first 6 months — as in PRD)
- Time to first deploy < 20 minutes.
- 500 projects running function+DB+storage.
- 80% functions have traces/logs enabled.
- >30% average function egress reduction vs remote serverless for typical data transforms.

Functional Requirements (mapped to acceptance tests)
- Project lifecycle: create project → provision DB & storage → succeed (acceptance: DB reachable, MinIO bucket exists).
- RBAC & API keys: issue, revoke keys; enforce scoped permissions (test: forbidden access with insufficient role).
- Functions: create versioned artifacts, immutable versions, deploy/rollback (test: deploy, invoke, rollback to previous version).
- Triggers: register DB/object/http/cron triggers; deliver events with at‑least‑once semantics and DLQ (test: insert row triggers function; failed delivery goes to DLQ).
- DSL: map/filter/reduce transforms run on row sets/objects (test: example transform produces expected output).
- Realtime: subscribe to query/changestreams and receive diffs/full payloads via WS/SSE.
- Observability: traces, logs, metrics available for each deployment/traceable to function invocation.
- SDK/CLI: cover create function → deploy → subscribe flows in examples.

Non‑Functional Requirements
- p95 cold start < 150ms for warmed functions; versioned immutable artifacts and rollbacks; secure tenancy; scalable control plane (Go) and data plane (co‑located); audit logs with configurable retention.

Constraints & Assumptions
- Data locality: functions must be scheduled into same region/VPC as DB/MinIO.
- Minimal runtimes (Go/JS) initially; consider Wasm in future phases.
- Users may opt for managed or self‑hosted Postgres.
- No mandatory third‑party infra dependencies for core delivery (adapters optional).

MVP Acceptance Criteria (examples)
- New user can provision project, DB, storage, create a basic function, publish v1, deploy, invoke via HTTP, and see logs/traces within 20 minutes of onboarding.
- Platform supports 100 concurrent projects in initial cluster and scales to 500 via horizontal autoscaling.

Roadmap (MVP → Phase 2)
- MVP: core features above.
- Phase 2: Marketplace of sharable function libs, adapter connectors (Stripe, SendGrid), improved DSL features, Wasm runtime.

Detailed Tech Stack
-------------------

Architecture principles
- Control plane: API, orchestrator, auth, deployments (stateless, horizontally scalable).
- Data plane: co‑located worker nodes per region that host functions in sandboxed runtime adjacent to Postgres/MinIO.
- Secure multi‑tenant isolation: network isolation, per‑project K8s namespaces or lightweight VMs, secrets per project in Vault.
- Observability-first: OpenTelemetry tracing, structured logs, metrics.

Control Plane (recommended)
- Language & Framework: Go 1.20+, Gin or Fiber for REST API services; gRPC for internal high‑throughput RPCs.
- Auth & RBAC: JWT + OAuth2 (Dex or Auth0 optional); Casbin or OPA for RBAC/policy evaluation.
- API Gateway & Rate Limits: Envoy or Kong for ingress, with global rate limiting and JWT validation.
- Orchestration: Kubernetes or Fly.io for small clusters; use custom scheduler extension for data locality (node affinity, taints/tolerations).
- Build Service: Kaniko/Buildah in isolated containers to produce artifacts; artifacts stored to MinIO.
- CI: GitHub Actions / self‑hosted runners integrated with build service and test harness.

Data Plane (colocated)
- Container Runtime & Sandboxing:
  - Primary option: lightweight containers (distroless) per function; use gVisor and seccomp for isolation.
  - Alternative / future: WebAssembly (Wasmtime/WASI) for faster cold starts and stronger sandboxing.
- Function Runtimes:
  - Go runtime (compiled binary), Node.js runtime (small node images), WASM runtime for JS/Go compiled to WASM.
- Placement: K8s nodes or dedicated VMs with Postgres and MinIO in same VPC/subnet; scheduler uses affinity to ensure locality.
- Event Bus & DLQ: NATS JetStream (recommended) or Kafka for at‑least‑once delivery and persistence; built‑in DLQ using JetStream or Kafka topic + retry policy.

Data & Storage
- Relational DB: PostgreSQL (managed or self‑hosted) per project; logical/physical backups via pgBackRest or managed provider snapshots.
- Object Storage: MinIO cluster per region; internal metadata indexed in Postgres (objects table).
- Secrets: HashiCorp Vault for secret storage; secrets injected at deployment time as env vars or accessible via Secrets API with short‑lived tokens.

Observability
- Tracing: OpenTelemetry instrumentation in control/data plane; Jaeger/Tempo backend.
- Metrics: Prometheus + Grafana dashboards.
- Logs: Loki (or Elasticsearch) for structured logs, log retention policy configurable per project.
- Profiling & Query Profiler: pprof-enabled builds (Go) and postgres pg_stat_statements integration.

Networking & Security
- Service Mesh: Linkerd or Istio for mTLS, telemetry, and traffic shaping.
- VPC & Subnet isolation: tenant-level network policies; node pool per region.
- WAF & DDoS: Cloud provider / Edge provider protections.
- Security scanning: Snyk/Trivy on artifacts and dependency checks.

Client SDKs & CLI
- SDKs: TypeScript SDK for browser/node/edge; Flutter/Expo example.
- CLI: Go-based CLI using Cobra; supports local testing harness and deployment.
- Local dev harness: containerized Postgres+MinIO + function runner (dev hot-reload).

Storage & Artifact Registry
- Artifacts: MinIO-backed artifact repository with immutability & content-addressed checksum; use SHA256 checksums.

Why these choices (mapping to PRD NFRs)
- Go control plane: low-latency, easy concurrency — meets scalable control plane requirement.
- Co‑located runtime + container/WASM: low egress and cold start targets.
- NATS JetStream/Kafka: guaranteed delivery semantics with DLQ support.
- OpenTelemetry + Prometheus + Loki: full observability suite with retention control.
- Vault: secure secrets per project.

API Documentation — Internal API Endpoints (v1)
------------------------------------------------
Notes
- All endpoints require authentication: Authorization: Bearer <JWT> or API-Key header for service keys.
- Time fields use RFC3339 timestamps.
- IDs are UUIDs unless otherwise noted.

1) Create Project
- POST /v1/projects
Request JSON:
{
  "name": "acme",
  "owner_id": "00000000-0000-0000-0000-000000000000",
  "region": "us-east1",
  "preset": "managed_postgres"   // optional: managed_postgres | self_hosted
}
Response JSON (201):
{
  "id": "proj_123e4567-e89b-12d3-a456-426614174000",
  "name": "acme",
  "region": "us-east1",
  "db": {
    "type": "managed",
    "connection_url": "postgres://user:****@db-host:5432/acme_db"
  },
  "minio": {
    "endpoint": "https://minio.us-east1.example",
    "buckets": ["acme-default"],
    "access_key_hint": "AKIA***"
  },
  "created_at": "2026-05-01T12:00:00Z"
}

2) List Projects
- GET /v1/projects
Query params: ?limit=50&offset=0
Response JSON (200):
{
  "projects": [{ "id":"proj_...", "name":"acme", "region":"us-east1", "created_at":"..." }],
  "count": 1
}

3) Create API Key
- POST /v1/projects/:project_id/keys
Request JSON:
{
  "role": "service",          // service | admin | developer
  "name": "ci-key",
  "expires_at": "2026-06-01T00:00:00Z"   // optional
}
Response JSON (201):
{
  "id": "key_111e4567-e89b-12d3-a456-426614174111",
  "project_id": "proj_123e4567-e89b-12d3-a456-426614174000",
  "key": "sk_live_abcdefghijklmnopqrstuvwxyz",   // plaintext only on create
  "role": "service",
  "created_at": "2026-05-01T12:05:00Z"
}

4) Revoke API Key
- DELETE /v1/projects/:project_id/keys/:key_id
Response JSON (204) empty.

5) Create Function (metadata + code artifact)
- POST /v1/functions
Request JSON:
{
  "project_id": "proj_123e4567-e89b-12d3-a456-426614174000",
  "name": "invoice_total",
  "runtime": "go",             // go | node | wasm
  "entry": "Handler",
  "source_archive": "s3://builds/acme/invoice_total_v1.tar.gz",
  "env": { "DB_URL": "$DB_URL", "LOG_LEVEL": "info" },
  "annotations": { "public": false },
  "description": "Compute invoice totals"
}
Response JSON (201):
{
  "id": "fn_45e4567-e89b-12d3-a456-426614174045",
  "project_id": "proj_123e4567-e89b-12d3-a456-426614174000",
  "name": "invoice_total",
  "runtime": "go",
  "created_by": "00000000-0000-0000-0000-000000000000",
  "current_version": null,
  "created_at": "2026-05-01T12:10:00Z"
}

6) Create Function Version (publish immutable artifact)
- POST /v1/functions/:fn_id/versions
Request JSON:
{
  "version": "v1",
  "source_uri": "minio://builds/acme/invoice_total_v1.tar.gz",
  "runtime": "go",
  "checksum": "sha256:abcdef...",
  "size": 12345678,
  "changelog": "Initial v1"
}
Response JSON (201):
{
  "id": "fv_45v1e4567-e89b-12d3-a456-426614174045",
  "fn_id": "fn_45e4567-e89b-12d3-a456-426614174045",
  "version": "v1",
  "source_uri": "minio://...",
  "runtime": "go",
  "checksum": "sha256:abcdef...",
  "created_at": "2026-05-01T12:11:00Z"
}

7) Deploy Function Version
- POST /v1/functions/:fn_id/deploy
Request JSON:
{
  "version": "v1",
  "strategy": "rolling",   // rolling | recreate | canary
  "resources": { "cpu": "200m", "memory": "256Mi", "max_concurrency": 10 },
  "env": { "FEATURE_FLAG": "true" },
  "region": "us-east1"
}
Response JSON (202):
{
  "deployment_id": "d_1e4567-e89b-12d3-a456-426614174001",
  "fn_id": "fn_45e4567-e89b-12d3-a456-426614174045",
  "fn_version": "v1",
  "status": "deploying",
  "started_at": "2026-05-01T12:12:00Z",
  "region": "us-east1"
}

Deployment Status Polling
- GET /v1/deployments/:deployment_id
Response JSON (200):
{
  "deployment_id":"d_1...",
  "status":"active",           // deploying | active | failed | rolled_back
  "nodes": [{ "node_id":"n-1", "ip":"10.0.0.5", "uptime":"..." }],
  "started_at":"...",
  "completed_at":"..."
}

8) Invoke Function (sync HTTP)
- POST /v1/functions/:fn_id/invoke
Request JSON:
{
  "project_id": "proj_123e4567-e89b-12d3-a456-426614174000",
  "version": "v1",
  "input": { "order_id": 123 },
  "timeout_ms": 5000
}
Response JSON (200):
{
  "status": 200,
  "output": { "total": 1999, "currency": "usd" },
  "duration_ms": 45,
  "logs_url": "/v1/observability/logs?deployment_id=d_1..."
}

9) Async Invocation (event)
- POST /v1/functions/:fn_id/invoke/async
Request JSON:
{
  "project_id": "proj_123",
  "version": "v1",
  "event": { "type": "order_created", "payload": { "order_id": 123 } },
  "delivery_mode": "at_least_once"
}
Response JSON (202):
{
  "enqueue_id": "evt_abc123",
  "status": "queued"
}

10) Register Trigger
- POST /v1/triggers
Request JSON:
{
  "project_id": "proj_123",
  "type": "db",                 // db | object | http | cron
  "table": "orders",            // for db triggers
  "event": "INSERT",            // INSERT|UPDATE|DELETE
  "target_fn": "fn_45e4567-e89b-12d3-a456-426614174045",
  "enabled": true,
  "config": {
    "payload_transform": {
      "map": ["id","amount","customer_id"],
      "filter": "amount > 0"
    }
  }
}
Response JSON (201):
{
  "id": "t_1e4567-e89b-12d3-a456-426614174010",
  "project_id": "proj_123",
  "type": "db",
  "table": "orders",
  "event": "INSERT",
  "target_fn": "fn_45...",
  "enabled": true,
  "created_at": "2026-05-01T12:15:00Z"
}

11) Create Signed Upload URL (MinIO)
- POST /v1/storage/upload
Request JSON:
{
  "project_id": "proj_123",
  "bucket": "avatars",
  "key": "u/1.png",
  "expires": 3600,
  "content_type": "image/png",
  "acl": "private"
}
Response JSON (200):
{
  "upload_url": "https://minio.us-east1.example/acme/avatars/u%2F1.png?X-Amz-...",
  "method": "PUT",
  "fields": {},            // if POST form required
  "expires_at": "2026-05-01T13:15:00Z"
}

12) Create Signed Download URL
- POST /v1/storage/download
Request JSON:
{
  "project_id": "proj_123",
  "bucket": "avatars",
  "key": "u/1.png",
  "expires": 3600
}
Response JSON (200):
{
  "download_url": "https://minio.us-east1.example/acme/avatars/u%2F1.png?X-Amz-...",
  "expires_at": "2026-05-01T13:15:00Z"
}

13) Run Parameterized SQL (server-side role)
- POST /v1/db/query
Request JSON:
{
  "project_id": "proj_123",
  "role": "service",
  "sql": "SELECT id, amount FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2",
  "params": [42, 50],
  "timeout_ms": 30000
}
Response JSON (200):
{
  "rows": [
    { "id": 101, "amount": 1999 },
    { "id": 102, "amount": 4999 }
  ],
  "row_count": 2,
  "query_id": "q_abc123",
  "profile": { "planning_ms": 1.2, "execution_ms": 12.4 }   // optional
}

14) Real-time Subscribe (WebSocket protocol)
- WS Endpoint: wss://api.example.com/v1/realtime
Initial WS message (client → server) JSON:
{
  "op": "subscribe",
  "project_id": "proj_123",
  "query": "SELECT id, status FROM orders WHERE status = 'open'",
  "mode": "diff",           // diff | full
  "since": null
}
Server will stream messages of shape:
{
  "op": "event",
  "subscription_id": "sub_abc123",
  "type": "insert|update|delete",
  "rows": [{ "id": 101, "status": "open" }],
  "timestamp": "2026-05-01T12:20:00Z"
}
Unsubscribe:
{ "op": "unsubscribe", "subscription_id": "sub_abc123" }

15) Observability — Fetch Logs
- GET /v1/observability/logs?deployment_id=d_1...&from=2026-05-01T12:00:00Z&to=2026-05-01T13:00:00Z&level=info
Response JSON (200):
{
  "logs": [
    { "ts":"2026-05-01T12:12:01Z", "deployment_id":"d_1...", "level":"info", "message":"Function started", "trace_id":"t_1..." }
  ]
}

16) Traces
- GET /v1/observability/traces?trace_id=t_1...
Response JSON (200):
{
  "trace": { "trace_id":"t_1...", "spans":[ /* OTLP span objects */ ] }
}

17) Audit Trail
- GET /v1/audit?project_id=proj_123&limit=100
Response JSON:
{
  "events": [
    { "id":"a_1...", "actor_id":"user_1...", "action":"create_function", "resource":"fn_45...", "ts":"2026-05-01T12:10:00Z", "metadata": { ... } }
  ]
}

18) Trigger Execution Status & DLQ
- GET /v1/triggers/:trigger_id/status
Response JSON:
{
  "trigger_id":"t_1...",
  "status":"active",
  "last_executions": [
    { "event_id":"evt_1...", "delivered": true, "attempts": 1, "duration_ms": 42 },
    { "event_id":"evt_2...", "delivered": false, "attempts": 5, "dlq": true }
  ]
}

19) Adapter (generic integration) — Create Email Send Job
- POST /v1/integrations/email/send
Request JSON:
{
  "project_id": "proj_123",
  "adapter": "sendgrid",      // configured per project
  "to": "user@example.com",
  "from": "noreply@acme.app",
  "subject": "Invoice Ready",
  "html": "<p>Your invoice is ready</p>",
  "metadata": { "order_id": 123 }
}
Response JSON (202):
{
  "job_id": "int_job_abc123",
  "status": "queued",
  "adapter_request_id": null
}

Error responses
- Standard error structure for non-2xx:
{
  "error": {
    "code": "invalid_input",
    "message": "Missing required field: name",
    "details": { "field": "name" }
  }
}

API Versioning & OpenAPI
- v1 base path: /v1. Provide full OpenAPI 3.0 spec in repo (actionable item in deliverables).

Entity Relationship Diagram (ERD) — mermaid
------------------------------------------------
erDiagram
  USERS ||--o{ PROJECTS : owns
  PROJECTS ||--o{ API_KEYS : has
  PROJECTS ||--o{ FUNCTIONS : contains
  FUNCTIONS ||--o{ FUNCTION_VERSIONS : has
  FUNCTION_VERSIONS ||--o{ DEPLOYMENTS : deploys
  PROJECTS ||--o{ TRIGGERS : registers
  TRIGGERS }o--|| FUNCTIONS : target
  PROJECTS ||--o{ OBJECTS : stores
  PROJECTS ||--o{ EVENTS : logs
  PROJECTS ||--o{ LOGS : contains
  PROJECTS ||--o{ PERMISSIONS : has
  USERS ||--o{ PERMISSIONS : assigned
  PROJECTS ||--o{ AUDIT_EVENTS : records

DB Schema (DDL snippets) — aligned to PRD
-----------------------------------------
-- projects
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region text NOT NULL,
  settings jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- users
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  role text NOT NULL, -- global role
  profile jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- api_keys
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text,
  key_hash text NOT NULL,
  role text NOT NULL, -- service/admin/developer
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_project ON api_keys(project_id);

-- functions
CREATE TABLE functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid REFERENCES users(id),
  current_version text, -- e.g., "v2"
  annotations jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_functions_project_name ON functions(project_id, name);

-- function_versions
CREATE TABLE function_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fn_id uuid NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  version text NOT NULL,
  source_uri text NOT NULL,
  runtime text NOT NULL,
  checksum text,
  size bigint,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fn_id, version)
);
CREATE INDEX idx_fn_versions_fn ON function_versions(fn_id);

-- deployments
CREATE TABLE deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fn_version_id uuid NOT NULL REFERENCES function_versions(id) ON DELETE CASCADE,
  region text NOT NULL,
  status text NOT NULL, -- deploying/active/failed/rolled_back
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  nodes jsonb, -- node placement info
  resources jsonb,
  created_by uuid REFERENCES users(id)
);
CREATE INDEX idx_deployments_fnversion ON deployments(fn_version_id);

-- triggers
CREATE TABLE triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL, -- db/object/http/cron
  target_fn uuid REFERENCES functions(id),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_triggers_project ON triggers(project_id);
CREATE INDEX idx_triggers_fn ON triggers(target_fn);

-- objects
CREATE TABLE objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  key text NOT NULL,
  size bigint,
  etag text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, bucket, key)
);
CREATE INDEX idx_objects_project_bucket ON objects(project_id, bucket);

-- events
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL, -- db_insert/object_put/function_invoked...
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_project ON events(project_id);
CREATE INDEX idx_events_type ON events(type);

-- logs
CREATE TABLE logs (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  deployment_id uuid REFERENCES deployments(id),
  level text NOT NULL,
  message text NOT NULL,
  trace_id text,
  ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_project_ts ON logs(project_id, ts DESC);
CREATE INDEX idx_logs_trace ON logs(trace_id);

-- permissions
CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL, -- user/team id
  role text NOT NULL, -- admin/developer/viewer
  resource text, -- optional scoping
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_permissions_project ON permissions(project_id);

-- audit_events
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  resource text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_project ON audit_events(project_id);

Indexes & Performance
- GIN indexes: create GIN on function_versions.metadata, triggers.config, events.payload for queryable transforms.
- Partial indexes: logs on recent timeframe for fast retrieval.
- pg_stat_statements enabled per project DB instance for query profiling.

Mapping / Traceability to PRD
------------------------------
- Multi‑tenant projects & RBAC: projects + permissions + api_keys tables + Casbin/OPA mapped to API endpoints (projects, keys, permissions).
- Postgres per project: projects.db connection_url returned by /v1/projects; DB provisioning orchestrator implements managed/self‑hosted option.
- MinIO object storage: objects table for metadata and /v1/storage endpoints for signed URLs.
- Versioned functions: functions + function_versions + deployments tables; endpoints for publish/deploy/rollback.
- Triggers & events: triggers + events tables; event bus (NATS/Kafka) for delivery, endpoints to register triggers.
- Declarative DSL: payload_transform stored in triggers.config.json; DSL runtime implemented in function runner (maps to transform primitives).
- REST/GraphQL: auto-generation layer in control plane maps functions/tables metadata to generated endpoints (not enumerated here — generation uses functions metadata).
- Real-time streams: /v1/realtime WS protocol and subscription/event streaming using JetStream backed change capture and logical decoding from Postgres where necessary.
- Observability: logs/traces endpoints and underlying OpenTelemetry + Loki/Prometheus stack; profile info returned in /v1/db/query response when enabled.
- Security & isolation: Vault, K8s namespaces or VM isolation, service mesh for mTLS; secrets injection via Vault API.

Operational Considerations
- Cold start target: optimize by (1) keeping hot containers warm via autoscaler warm pools, (2) small footprints (minimal runtime images), (3) consider Wasm for faster startup in Phase 2.
- Placement logic: scheduler will place deployments on nodes with matching project region/VPC and node affinity; maintain topology map in control plane.
- Backups & DR: managed option integrates provider snapshots; self‑hosted includes scheduled pg_dump/pgBackRest and cross-region transfer.
- Retention: logs/traces retention configurable per project with tiered storage (short-term hot, long-term cold).
- Observability adoption: default enable traces/logs with opt-out to hit 80% target.

Deliverables & Next Steps (actionable from PRD)
- Produce full OpenAPI v1 spec for endpoints above (offer to expand).
- Implement CI pipeline for builds → artifact upload → version publish → deploy.
- Implement local dev harness (docker-compose with Postgres + MinIO + function runner).
- Build JS/TS SDK sample flows: create function → deploy → subscribe to real‑time stream (can be supplied on request).
- Security review checklist and compliance notebook for region/data residency.

If you want, I will:
- Expand the API reference into a full OpenAPI 3.0 spec (v1).
- Draft JS/Flutter SDK examples for "create function → deploy → subscribe" end‑to‑end.
- Produce an initial K8s operator pseudo‑design for placement + lifecycle (deployments, rollbacks, DLQ handling).

---

UI/UX Structure
- Purpose: fast onboarding → create project → provision DB+storage → author/version/deploy functions colocated with data → observe & iterate.
- Design goals: Reduce time-to-first-deploy (<20m), surface locality & deployment health, make triggers & realtime subscriptions discoverable, make observability first-class.

Main screens (brief, for engineers)
1. Global Nav (persistent)
   - Left rail: Projects, Functions, Storage, DB, Realtime, Observability, CLI & SDK, Settings
   - Top bar: search (projects/functions), user menu, region selector, notifications, “New” quick menu
   - Auth state: admin vs project-scoped (controls visible items)
   - Components: <Nav>, <RegionPicker>, <GlobalSearch>

2. Home / Projects List
   - Purpose: entry point, show projects, usage, quick create
   - Key components: ProjectCard (status: provisioned | provisioning | error), QuickCreateProject modal
   - Actions/API:
     - Create project → POST /v1/projects
     - Open project → GET /v1/projects/:id
   - Edge: show pending provisioning spinner with polling GET /v1/projects/:id

3. Project Overview (critical onboarding)
   - Purpose: single-page summary: DB status, MinIO buckets, API keys, recent events, quick steps
   - Components: <ProjectHeader>, <ProvisionPanel>, <APIKeysList>, <QuickStartCard> (sample SDK/CLI commands)
   - Actions/API:
     - Provision DB/MinIO (one-click) → POST /v1/projects/:id/provision (or use /v1/projects create with preset); poll GET /v1/projects/:id
     - Create API key → POST /v1/projects/:id/keys
   - States: empty project (CTA), provisioning, active

4. Function Explorer (list & search)
   - Purpose: CRUD for functions, version summary, last deploy, triggers
   - Components: <FunctionList>, <FunctionCard>, <StatusPill>, bulk actions
   - Actions/API:
     - List functions → GET /v1/functions?project_id=
     - Create function → POST /v1/functions
     - Open function → GET /v1/functions/:id + /versions
   - Filters: runtime, status, public/private, last deploy

5. Function Editor & Versioning (critical — wireframe #1)
   - Purpose: author code or DSL, test, publish immutable version, deploy to data plane
   - Components: CodeEditor (Monaco), DSL Composer UI, Local Test Panel, Version History, Deploy Panel, Env/Secrets editor
   - Actions/API:
     - Save draft → POST/PUT /v1/functions (metadata) + upload artifact (MinIO) or inline save
     - Publish version → POST /v1/functions/:fn_id/versions
     - Deploy → POST /v1/functions/:fn_id/deploy
     - Invoke sync → POST /v1/functions/:fn_id/invoke
     - Invoke async → POST /v1/functions/:fn_id/invoke/async
   - Data: function metadata, versions list, last deployment object
   - Edge cases: failed build (show artifact logs), immutable versions, rollback flow (deploy older version)

6. Deploy Modal / Placement UI (inside editor)
   - Purpose: choose version, region, strategy, resources, secrets injection
   - Inputs: version, strategy, cpu/memory, max_concurrency, region
   - Actions/API: POST /v1/functions/:fn_id/deploy; poll GET /v1/deployments/:deployment_id

7. Triggers Manager (per-function + global)
   - Purpose: register DB/object/http/cron triggers, compose payload transform (DSL)
   - Components: TriggerList, TriggerCreateForm (type selector), Payload DSL builder, DLQ config
   - Actions/API: POST /v1/triggers, GET /v1/triggers?project_id=
   - Validation: preview transform output (run on example row) → POST /v1/functions/:fn_id/invoke/async?dry_run

8. Real-time Subscriptions UI (test harness)
   - Purpose: build and test subscription queries, show live diffs or full payloads
   - Components: Query builder (SQL), Mode (diff|full), WebSocket client, Event stream display
   - Actions/API: WS to wss://api.../v1/realtime with subscribe payload; server messages per spec
   - UX: show sample paginated snapshots + live diffs; allow copy-to-embed snippet (SDK code)

9. Observability & Profiling (critical — wireframe #2)
   - Purpose: logs, traces, metrics, SQL profiler per function/deployment
   - Components: Timepicker, Logs table with filters, Trace flamegraph, Query profile panel, Link from invocation to logs/traces
   - Actions/API:
     - Fetch logs → GET /v1/observability/logs
     - Fetch traces → GET /v1/observability/traces
     - Fetch query profile → included in /v1/db/query or per-invocation metadata
   - UX: show tailing logs, pin trace -> show spans and SQL statements, enable export to SIEM adapters

10. Storage Browser
    - Purpose: view buckets, object metadata, signed URL generation, upload widget
    - Components: BucketList, ObjectTable, SignedURL modal (create signed upload/download), Upload dropzone
    - Actions/API:
      - List objects → GET /v1/storage/objects?project_id=&bucket=
      - Create signed upload → POST /v1/storage/upload
      - Create signed download → POST /v1/storage/download

11. DB Console & Migrations
    - Purpose: apply SQL migrations, schema view, query runner, profiling
    - Components: Migration list, SQL editor (Monaco), Results grid with explain/profile toggle
    - Actions/API: POST /v1/db/query, migrations endpoints (not listed earlier — implement as POST /v1/projects/:id/migrations)

12. Settings & RBAC
    - Purpose: manage API keys, permissions, retention policies, backups, audit logs
    - Components: API keys manager, Roles matrix (Casbin/OPA), Retention slider, Audit timeline
    - Actions/API:
      - Revoke key → DELETE /v1/projects/:project_id/keys/:key_id
      - Audit → GET /v1/audit

UI patterns and implementation notes (practical)
- Component approach: atomic React components (or framework of choice)
  - Examples: <FunctionEditor>, <DeployModal>, <TriggerForm>, <RealtimeConsole>, <LogsTable>
- Data fetching: use SWR/React-Query to handle polling (provisioning, deployment status)
- Polling patterns:
  - Project provisioning: poll GET /v1/projects/:id every 3s with backoff.
  - Deployment status: poll GET /v1/deployments/:id until active/failed.
- Error handling:
  - Surface API errors as inline error banners with link to audit/log for perms issues.
  - Show retry CTA on transient errors (network).
- RBAC:
  - UI toggles & actions hidden/disabled based on permissions from GET /v1/projects/:id + roles GET /v1/projects/:id/permissions
- Accessibility:
  - Keyboard shortcuts for Save (Ctrl/Cmd+S), Open Quick Deploy (P), Toggle logs (L).
- Mobile/responsive:
  - Left rail collapses to bottom nav; editor is read-only on narrow screens (link to CLI/SDK)
- Local dev mode:
  - “Open in local harness” button that returns command snippet (docker-compose up) via CLI endpoint.

ASCII wireframes (most critical screens)

1) Function Editor + Deploy flow (code + versioning + deploy)
- Purpose: author function, run local tests, publish version, open deploy modal.
- Include component IDs, data bindings, and API hooks.

``` 
+---------------------------------------------------------------------------------------+
| <TopBar>  Project: acme  ▾   | Search ▢ | Region: us-east1 | User ▾ | Notifications ◯ |
+---------------------------------------------------------------------------------------+
| <Breadcrumbs> Projects / acme / Functions / invoice_total                             |
+---------------------------------------------------------------------------------------+
| [fn:name] invoice_total                               [Status: active v1] [Deploy ▸] |
+---------------------------------------------------------------------------------------+
|  Left pane                        |                    Right pane                   |
|  - Versions (v2 draft, v1)        |  Code Editor (Monaco)                          |
|  - Triggers                       |  ------------------------------------------------
|  - Settings                       |  func Handler(ctx, input) {                    |
|                                   |     // bindings: $DB_URL -> env                 |
|  [VersionsList]                   |     total := compute(input.order_id)           |
|  [v2 (draft)]  ✎ edit   [Publish] |     return { total }                           |
|  [v1]        ✓ deployed  2026-05-01|  }                                              |
|                                   |                                                 |
|  [Triggers]                       |  ----------------- Local Test -----------------|
|  - orders_insert -> fn (db row)   |  Test Input: { "order_id": 123 }  [Run ▶]      |
|  - avatar_put -> fn (object)      |  Output: { "total":1999 }   [View Logs]        |
|                                   |                                                 |
|  [Env / Secrets]                   -------------------------------------------------|
|  DB_URL: ********                   |  Version History:                              |
|  LOG_LEVEL: info                    |  - v1  deployed  d_1  [Rollback] [View Logs]   |
|                                     |  - v2  draft  (unsaved) [Publish]              |
+---------------------------------------------------------------------------------------+
| Bottom bar: [Save Draft] [Publish Version] [Open Deploy Modal]   Last saved: 10s ago |
+---------------------------------------------------------------------------------------+

Notes / API hooks:
- Save Draft -> PUT /v1/functions/:fn_id (body: metadata) + upload inline/artefact to MinIO (source_uri) 
- Publish Version -> POST /v1/functions/:fn_id/versions (version, source_uri, checksum)
- Local Run -> POST /v1/functions/:fn_id/invoke (sync) with timeout_ms
- Deploy Modal opens -> binds to POST /v1/functions/:fn_id/deploy (see deploy modal wireframe)
- Show build/log links using response.logs_url -> GET /v1/observability/logs
```

Deploy Modal (sub-panel triggered from above):

```
+---------------------- Deploy invoice_total : choose options -------------------------+
| Version: ▾ [v1]                 Strategy: ( ) rolling  ( ) canary  ( ) recreate        |
| Region: ▾ [us-east1]            Node Affinity: auto (same VPC)                     |
| Resources: CPU [200m]  MEM [256Mi]  Max Concurrency [10]                            |
| Env overrides: KEY=VALUE  [Add]   Secrets: [Select from Vault]                      |
| Health check path: /_health     Timeout(ms): [5000]                                 |
|                                                                               [Deploy]|
| Notes: deployment will schedule on data-plane nodes that satisfy region/VPC affinity |
+---------------------------------------------------------------------------------------+
- On submit: POST /v1/functions/:fn_id/deploy {version, strategy, resources, region, env}
- Poll GET /v1/deployments/:deployment_id until status == active|failed
- Show live nodes json from deployments.nodes (node_id, ip, local_db_affinity)
```

2) Observability — Logs + Trace drilldown (tail + profile)
- Purpose: let devs quickly find function logs, tail, open trace and SQL profile.

```
+---------------------------------------------------------------------------------------+
| <TopBar>  Project: acme  ▾   | Search logs ▢ | Time range ▾ | Auto-tail ▾ | Download ▾ |
+---------------------------------------------------------------------------------------+
| Filters: [Function ▾ invoice_total] [Deployment ▾ d_1] [Level ▾ info,error] [Query ▾] |
+---------------------------------------------------------------------------------------+
| Left pane: Logs (tailing)                        | Right pane: Trace / Profile      |
| ------------------------------------------------ | ---------------------------------|
| [LogsTable]                                      | [Trace Summary] TraceID: t_1...  |
|  ts (ago)   level   deployment   message         |  spans:                          |
|  12:12:01Z   INFO   d_1         "Function start"  |   ├─ handler (10ms)              |
|  12:12:01Z   INFO   d_1         "DB query: q_..." |   ├─ db/query (12ms)             |
|  12:12:01Z   ERROR  d_1         "panic: ..."      |   └─ transform (3ms)             |
|  [Show more] [Export] [Open in Trace UI]         |                                   |
|                                                  | [SQL Profiler for span 'db/query']|
|                                                  |  - Query: SELECT ...              |
|                                                  |  - planning_ms: 1.2 execution_ms: |
|                                                  |  - Plan link -> open pg_stat view |
+---------------------------------------------------------------------------------------+
Notes / API hooks:
- Logs listing: GET /v1/observability/logs?deployment_id=d_1&from=&to=&level=
- Trace fetch: GET /v1/observability/traces?trace_id=t_1...
- SQL profiling: include profile object in /v1/db/query or trace span metadata
- Tail implementation: open SSE/WS to observability service or poll logs endpoint with since cursor
- Link from error -> open deployment and function editor for quick rollback/deploy
```

Implementation checklist for programmers (practical)
- Data bindings:
  - Project overview mounts GET /v1/projects/:id on load; show provisioning spinner when projects.db.connection_url missing.
  - Function editor loads GET /v1/functions/:id + GET /v1/functions/:id/versions + GET /v1/triggers?project_id=&target_fn=
- Polling:
  - Use exponential backoff / jitter for status polling; cancel if tab inactive.
- WebSockets:
  - Realtime: implement auth handshake with API key or JWT; send subscribe JSON then handle op:event messages per API spec.
- Error surfaces:
  - Map API error.code -> UX message (invalid_input -> highlight fields; forbidden -> show contact admin CTA)
- Testing & dev:
  - Provide “Copy SDK snippet” buttons that insert actual project_id, fn_id and example code (use API endpoints given).
- Accessibility & keyboard:
  - Editor: provide accessible labels, aria-live for logs tailing, focus trap in deploy modal.
- Observability UX:
  - Default enable traces/logs for new deployments (opt-out) to meet adoption metric; expose retention settings in Settings.

If you want, next deliverable options (pick one):
- Full OpenAPI v1 spec generation for the endpoints used in UI flows.
- React component skeletons + props for <FunctionEditor>, <DeployModal>, <LogsTable>, <RealtimeConsole>.
- Example JS/TS SDK snippets wired to the "Publish → Deploy → Subscribe" happy path.