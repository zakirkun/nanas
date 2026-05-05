# @nanas/sdk

TypeScript client for the Nanas control-plane HTTP API. It wraps [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) with typed paths generated from the repository [`openapi.yaml`](../../openapi.yaml).

## Requirements

- Node.js 18 or newer

## Install

From the monorepo (workspace):

```bash
pnpm install --filter @nanas/sdk
```

After cloning Nanas, you can also depend on the package via `workspace:*` from another workspace package, or build and pack it locally:

```bash
cd packages/sdk
pnpm install
pnpm run build
```

Published installs use the same package name once released to npm.

## Quick start

```ts
import { createNanasClient } from '@nanas/sdk';

const { client } = createNanasClient({
  baseUrl: 'http://localhost:8080',
  token: process.env.NANAS_TOKEN!, // JWT or project API key `sk_…`
  acceptLanguage: 'en', // forwarded as Accept-Language for Problem messages
  preferredLocale: 'en', // used when throwing ProblemError from JSON bodies
});

const { data, error, response } = await client.GET('/v1/projects/{pid}', {
  params: { path: { pid: projectId } },
});

if (error) {
  // Non-2xx with Problem-shaped JSON is thrown before returning; error branch is for typed unions when applicable.
}
```

Refresh tokens or lazy resolution:

```ts
createNanasClient({
  baseUrl: 'https://api.example.com',
  getToken: async () => loadTokenFromVault(),
});
```

Extra headers and custom `fetch` (testing or proxies):

```ts
createNanasClient({
  baseUrl: 'http://localhost:8080',
  token: 'sk_…',
  headers: { 'X-Custom': 'value' },
  fetch: globalThis.fetch,
});
```

## Errors

Failed responses whose bodies match the API Problem JSON shape are thrown as `ProblemError`. Helpers exported from `@nanas/sdk`:

| Export | Purpose |
| --- | --- |
| `ProblemError` | `Error` subclass with `status`, `body`, `fieldErrors`, `preferredLocale`, and `fieldMessage(field)` |
| `isProblem(value)` | Narrow unknown JSON to `ProblemBody` |
| `pickProblemMessage(body, locale)` | Resolve message from `message_preferred` or localized `message` |
| `problemMessage(err)` | Safe string for logging or UI |

Example:

```ts
import { createNanasClient, ProblemError, problemMessage } from '@nanas/sdk';

const { client } = createNanasClient({
  baseUrl: 'http://localhost:8080',
  token: process.env.NANAS_TOKEN!,
});

try {
  await client.POST('/v1/projects', { body: { name: 'Demo' } });
} catch (e) {
  if (e instanceof ProblemError) {
    console.error(e.status, e.body.code, e.fieldMessage('name'));
  } else {
    console.error(problemMessage(e));
  }
}
```

## Public function entrypoint

For the public edge route `ANY /fn/:project_slug/:function_slug`, use `nanasPublicInvoke` so URLs, optional subpaths, and signed / project-key headers stay consistent:

```ts
import { nanasPublicInvoke, normalizeBaseUrl } from '@nanas/sdk';

const base = normalizeBaseUrl('http://localhost:8080');

const res = await nanasPublicInvoke(base, {
  projectSlug: 'my-project',
  fnSlug: 'hello',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ping: true }),
  entrypointToken: secret, // auth_mode `signed`
  // or bearerToken: 'sk_…' for auth_mode `project_key`
});

if (!res.ok) {
  const text = await res.text();
  // parse Problem JSON if applicable
}
```

`nanasPublicInvoke` returns the raw `Response` and does **not** throw on HTTP error statuses.

## Regenerating types

Types are committed under `src/gen/types.ts`. Regenerate after changing [`openapi.yaml`](../../openapi.yaml):

```bash
cd packages/sdk
pnpm run generate
pnpm run build
```

The generator reads `openapi.yaml` at the repository root (`scripts/gen-types.ts`).

## Further reading

- [API reference](../../docs/API.md) — conventions, RBAC, error codes
- [MVP runbook](../../docs/MVP_RUNBOOK.md) — end-to-end tutorial with curl
- [OpenAPI specification](../../openapi.yaml) — machine-readable contract
