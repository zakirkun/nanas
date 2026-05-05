/**
 * Normalize API origin without a trailing slash.
 */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export interface NanasPublicInvokeInit {
  projectSlug: string;
  fnSlug: string;
  /** HTTP verb; forwarded to fetch. Defaults to POST. */
  method?: string;
  /**
   * Optional path segments after `/fn/{projectSlug}/{fnSlug}`.
   * Leading slash ignored, e.g. `v1/hello` → `/fn/.../v1/hello`
   */
  pathSuffix?: string;
  /** Merged into the query string (after `normalizeBaseUrl` resolution). */
  query?: Record<string, string>;
  /** Appends `token` query parameter (auth_mode=`signed`). */
  queryToken?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  /** Sets `X-Entrypoint-Token` (auth_mode=`signed`). */
  entrypointToken?: string;
  /** Sets `Authorization: Bearer …` when not already present (e.g. auth_mode=`project_key`). */
  bearerToken?: string;
  fetch?: typeof fetch;
}

/**
 * Call the public function edge route `ANY /fn/:project_slug/:fn_slug` (and optional subpath).
 * Does not throw on HTTP error status; inspect `response.ok` or parse JSON yourself.
 */
export async function nanasPublicInvoke(
  baseUrlOrCtx: string | { baseUrl: string; fetch?: typeof fetch },
  init: NanasPublicInvokeInit,
): Promise<Response> {
  const baseRaw = typeof baseUrlOrCtx === 'string' ? baseUrlOrCtx : baseUrlOrCtx.baseUrl;
  const base = normalizeBaseUrl(baseRaw);
  const f =
    (typeof baseUrlOrCtx === 'object' && baseUrlOrCtx.fetch ? baseUrlOrCtx.fetch : undefined) ??
    init.fetch ??
    globalThis.fetch;

  let path = `/fn/${encodeURIComponent(init.projectSlug)}/${encodeURIComponent(init.fnSlug)}`;
  let suffix = (init.pathSuffix ?? '').trim();
  if (suffix.startsWith('/')) suffix = suffix.slice(1);
  if (suffix) path += `/${suffix}`;

  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      url.searchParams.set(k, v);
    }
  }
  if (init.queryToken !== undefined) {
    url.searchParams.set('token', init.queryToken);
  }

  const headers = new Headers(init.headers ?? {});
  if (init.entrypointToken) {
    headers.set('X-Entrypoint-Token', init.entrypointToken);
  }
  if (init.bearerToken && !headers.get('Authorization')) {
    headers.set('Authorization', `Bearer ${init.bearerToken}`);
  }

  const method = (init.method ?? 'POST').toUpperCase();
  return f(url.toString(), {
    method,
    headers,
    body: init.body ?? null,
  });
}
