import { describe, expect, it, vi } from 'vitest';
import { nanasPublicInvoke, normalizeBaseUrl } from './public-fn.js';

describe('normalizeBaseUrl', () => {
  it('removes trailing slashes', () => {
    expect(normalizeBaseUrl('http://localhost:8080/')).toBe('http://localhost:8080');
    expect(normalizeBaseUrl('http://localhost:8080///')).toBe('http://localhost:8080');
  });
});

describe('nanasPublicInvoke', () => {
  it('calls fetch with path, query and query token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await nanasPublicInvoke('http://api', {
      projectSlug: 'myproj',
      fnSlug: 'echo',
      method: 'GET',
      query: { a: '1' },
      queryToken: 'sekret',
      fetch: fetchMock,
    });
    const called = fetchMock.mock.calls[0]?.[0] as string;
    expect(called).toContain('/fn/myproj/echo');
    expect(called).toContain('a=1');
    expect(called).toContain('token=sekret');
  });

  it('appends path suffix without leading slash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await nanasPublicInvoke({ baseUrl: 'http://x', fetch: fetchMock }, {
      projectSlug: 'p',
      fnSlug: 'f',
      pathSuffix: '/v2/hi',
      method: 'PATCH',
      fetch: fetchMock,
    });
    const called = fetchMock.mock.calls[0]?.[0] as string;
    expect(called.endsWith('/fn/p/f/v2/hi')).toBe(true);
  });

  it('sets Bearer and entrypoint headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    await nanasPublicInvoke('http://x', {
      projectSlug: 'p',
      fnSlug: 'f',
      bearerToken: 'sk_test',
      entrypointToken: 'edge',
      fetch: fetchMock,
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const h = new Headers(init.headers);
    expect(h.get('Authorization')).toBe('Bearer sk_test');
    expect(h.get('X-Entrypoint-Token')).toBe('edge');
  });
});
