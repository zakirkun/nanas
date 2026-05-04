import createClient, { type Middleware, type Client } from 'openapi-fetch';
import i18n from 'i18next';
import type { paths } from './types';
import { ProblemError, isProblem } from './problem';
import { useSession } from '@/auth/session';

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

const authAndLocaleMw: Middleware = {
  async onRequest({ request }) {
    const lang = (i18n.language || 'en').toLowerCase().startsWith('id') ? 'id, en' : 'en, id';
    request.headers.set('Accept-Language', lang);
    const token = useSession.getState().token;
    if (token && !request.headers.get('Authorization')) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },
  async onResponse({ response }) {
    if (response.ok) return response;
    let body: unknown = null;
    const text = await response.clone().text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // non-JSON error body
      }
    }
    if (response.status === 401) {
      const sess = useSession.getState();
      if (sess.token) sess.clear();
    }
    if (isProblem(body)) {
      throw new ProblemError(response.status, body);
    }
    throw new ProblemError(response.status, {
      code: 'NETWORK_ERROR',
      message: { en: response.statusText || 'Request failed', id: 'Permintaan gagal' },
      message_preferred: response.statusText || 'Request failed',
    });
  },
};

/**
 * The OpenAPI document doesn't always declare request body schemas, so
 * openapi-fetch sometimes types `body` as `undefined`. We re-cast to a slightly
 * looser variant that still preserves path/query typing while letting us pass
 * arbitrary JSON bodies for under-specified endpoints.
 */
type LooseClient = Omit<Client<paths>, 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'GET'> & {
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

const _typed = createClient<paths>({ baseUrl });
_typed.use(authAndLocaleMw);
export const api = _typed as unknown as LooseClient;

/** Build the absolute origin to use for non-fetch requests (e.g. WebSocket, presigned URLs). */
export function apiOrigin(): string {
  if (baseUrl) return baseUrl.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

/** Shape Authorization header value for raw fetches that bypass openapi-fetch. */
export function authHeader(): Record<string, string> {
  const t = useSession.getState().token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Issue a raw fetch carrying auth + Accept-Language. Useful for endpoints that
 *  return non-JSON (e.g. /metrics) or bodies the typed client can't model. */
export async function rawFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = input.startsWith('http') ? input : `${apiOrigin()}${input}`;
  const lang = (i18n.language || 'en').toLowerCase().startsWith('id') ? 'id, en' : 'en, id';
  const headers = new Headers(init.headers ?? {});
  headers.set('Accept-Language', lang);
  const token = useSession.getState().token;
  if (token && !headers.get('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}
