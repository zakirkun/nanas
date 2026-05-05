import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { paths } from './gen/types.js';
import { ProblemError, isProblem, type PreferredLocale } from './problem.js';
import { normalizeBaseUrl } from './public-fn.js';

export type { PreferredLocale };

export interface CreateNanasClientOptions {
  baseUrl: string;
  /** Static bearer token (JWT or project API key `sk_...`). */
  token?: string;
  /** Resolved per request if `token` is unset; may be async for refresh flows. */
  getToken?: () => string | Promise<string | undefined>;
  /** Merged onto every request unless the request already sets the header name. */
  headers?: Record<string, string>;
  /** Sent as `Accept-Language`. */
  acceptLanguage?: string;
  preferredLocale?: PreferredLocale;
  fetch?: typeof fetch;
}

export type NanasApiClient = Omit<
  Client<paths>,
  'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'GET'
> & {
  POST: <P extends keyof paths & string>(
    url: P,
    init: { params?: unknown; body?: unknown },
  ) => Promise<{ data?: unknown; error?: unknown; response: Response }>;
  PATCH: <P extends keyof paths & string>(
    url: P,
    init: { params?: unknown; body?: unknown },
  ) => Promise<{ data?: unknown; error?: unknown; response: Response }>;
  PUT: <P extends keyof paths & string>(
    url: P,
    init: { params?: unknown; body?: unknown },
  ) => Promise<{ data?: unknown; error?: unknown; response: Response }>;
  DELETE: <P extends keyof paths & string>(
    url: P,
    init: { params?: unknown; body?: unknown },
  ) => Promise<{ data?: unknown; error?: unknown; response: Response }>;
  GET: <P extends keyof paths & string>(
    url: P,
    init: { params?: unknown },
  ) => Promise<{ data?: unknown; error?: unknown; response: Response }>;
};

export interface NanasClientBundle {
  client: NanasApiClient;
  baseUrl: string;
  fetch: typeof fetch;
}

export function createNanasClient(options: CreateNanasClientOptions): NanasClientBundle {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const preferredLocale = options.preferredLocale ?? 'en';
  const fn = options.fetch ?? globalThis.fetch;

  const mw: Middleware = {
    async onRequest({ request }) {
      if (options.acceptLanguage) {
        request.headers.set('Accept-Language', options.acceptLanguage);
      }
      for (const [k, v] of Object.entries(options.headers ?? {})) {
        if (!request.headers.has(k)) request.headers.set(k, v);
      }
      let bearer = options.token;
      if (!bearer && options.getToken) bearer = await options.getToken();
      if (bearer && !request.headers.get('Authorization')) {
        request.headers.set('Authorization', `Bearer ${bearer}`);
      }
      return request;
    },
    async onResponse({ response }) {
      if (response.ok) return response;
      let body: unknown = null;
      const text = await response.clone().text();
      if (text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          //
        }
      }
      if (isProblem(body)) {
        throw new ProblemError(response.status, body, preferredLocale);
      }
      throw new ProblemError(
        response.status,
        {
          code: 'NETWORK_ERROR',
          message: { en: response.statusText || 'Request failed', id: 'Permintaan gagal' },
          message_preferred: response.statusText || 'Request failed',
        },
        preferredLocale,
      );
    },
  };

  const _typed = createClient<paths>({ baseUrl, fetch: fn });
  _typed.use(mw);
  return {
    client: _typed as unknown as NanasApiClient,
    baseUrl,
    fetch: fn,
  };
}
