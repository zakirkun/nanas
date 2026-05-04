# Nanas Web UI

Single-page React + TypeScript dashboard for the Nanas control plane API. The
production bundle is embedded into the Go binary so a single container serves
both the SPA and the API.

## Stack

- Vite 5 + React 18 + TypeScript (strict mode)
- Tailwind CSS + shadcn/ui (vendored Radix primitives)
- TanStack Query v5 + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/)
- Types regenerated from `../openapi.yaml` via `openapi-typescript`
- React Router v6 (data routers, nested layouts)
- React Hook Form + Zod
- i18next (English + Bahasa Indonesia)
- CodeMirror 6 (SQL/JSON/JS editors)
- Recharts (per-project metrics)
- Zustand (session store)
- `cmdk` (⌘K global search palette) and `react-hotkeys-hook` (function-detail shortcuts)
- Vitest + Playwright for tests

## Getting started

```bash
pnpm install      # or npm install / yarn install
pnpm gen:api      # regenerate src/api/types.ts from ../openapi.yaml
pnpm dev          # http://localhost:5173 (proxies API to :8080)
```

Make sure the Nanas API is running locally: `docker compose up -d` from the
repo root, or `go run ./cmd/api`. The Vite dev proxy forwards `/v1`, `/auth`,
`/admin`, `/fn`, `/internal`, `/healthz`, `/readyz`, `/metrics`, and the
realtime WebSocket on `/v1/projects/*/realtime/ws` to that backend.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | empty | Absolute URL of the API. Leave empty when the SPA is hosted on the same origin (production embed or Vite dev proxy). |
| `VITE_API_PROXY_TARGET` | `http://localhost:8080` | Used by the Vite dev server to know where to proxy API requests. |

Copy `.env.example` to `.env` and tweak as needed.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server with API + WS proxy |
| `pnpm gen:api` | Regenerate `src/api/types.ts` from `../openapi.yaml` |
| `pnpm build` | TypeScript check + production bundle into `dist/` |
| `pnpm preview` | Serve the built bundle locally |
| `pnpm test` | Vitest unit tests |
| `pnpm e2e` | Playwright smoke test (requires running stack) |
| `pnpm lint` | ESLint over `src/` |
| `pnpm format` | Prettier over `src/` |

## PRD-aligned UI surfaces

- **Integrations** (`/app/projects/:pid/integrations`): configure SendGrid and send a test email.
- **Migrate** tab lists `GET /v1/projects/:pid/migrations` history next to the DDL editor.
- **Overview** project tab: quick-start curl/JS/Flutter-style snippets, live realtime event feed, and latest API keys.
- **Top bar**: project region badge, realtime notification popover, quick “New” menu, global search.

## Architecture notes

- **Authentication.** A short-lived JWT (or `sk_…` API key) is stored in
  `localStorage` via Zustand and sent on every API call as
  `Authorization: Bearer <token>`. The session store also persists `Accept-Language`
  picked through the language switcher and decoded JWT claims.
- **Problem JSON.** `src/api/problem.ts` recognises the API's RFC 7807 envelope
  and surfaces `message_preferred` (auto-localised by `Accept-Language`) through
  the global `sonner` toast handler in `src/app/providers.tsx`.
- **Realtime.** `src/hooks/useRealtime.ts` wraps the native `WebSocket` with
  exponential backoff. Because browsers cannot set custom headers on a WS
  handshake, the JWT travels as `?access_token=`; the API middleware accepts
  this fallback for the `/v1/projects/:pid/realtime/ws` route only.
- **Local cache.** Several backend endpoints lack a list surface (functions,
  versions, triggers). To make the UI navigable, recently-created or
  manually-imported IDs are stored per project in `localStorage` under the
  `nanas.cache.v1.*` namespace. This is purely a navigation aid; nothing is
  authoritative client-side.
- **Embed.** `internal/webui/dist/` carries the production bundle, and
  `cmd/api/main.go` mounts it after all API routes via Gin's `NoRoute` so any
  non-API path returns the SPA `index.html` (HTML5 history fallback).

## Internationalisation

- Resources live in `src/i18n/{en,id}.json`.
- The locale is auto-detected (`localStorage` → browser → `<html lang>`) and
  manually switchable from the topbar.
- The same locale is forwarded to the API via the `Accept-Language` header so
  Problem messages come back in the user's language.

## Adding a new shadcn component

This template vendors shadcn primitives directly under `src/components/ui/`.
To add a new one, copy the file from
[shadcn/ui](https://ui.shadcn.com/docs/components) into `src/components/ui/`
and import via `@/components/ui/<name>`.
