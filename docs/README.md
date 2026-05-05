# Nanas documentation

This folder collects human-written guides for operators and integrators. Use it alongside the machine-readable API contract at the repository root.

## Guides

| Document | Audience | Contents |
| --- | --- | --- |
| [API.md](API.md) | API consumers | Endpoint tables, payloads, RBAC, Problem JSON error catalog |
| [MVP_RUNBOOK.md](MVP_RUNBOOK.md) | New users | Step-by-step MVP flow from registration through deploy and observability |
| [MVP2_PLAN.md](MVP2_PLAN.md) | Contributors | Roadmap and acceptance criteria for the next iteration |

## Repository-wide references

- [OpenAPI specification](../openapi.yaml) — source for codegen and SDK typings
- Live server — `GET /openapi.yaml` on a running API returns the served specification (same semantics as the committed file when versions align)
- [Contributing](../CONTRIBUTING.md) — workflow and coding expectations
- [Security policy](../SECURITY.md) — how to report vulnerabilities responsibly

For the dashboard SPA, see [web/README.md](../web/README.md). For the TypeScript API client package, see [packages/sdk/README.md](../packages/sdk/README.md).
