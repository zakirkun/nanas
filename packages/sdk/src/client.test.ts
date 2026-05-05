import { describe, expect, it, vi } from 'vitest';
import { createNanasClient } from './client.js';
import { ProblemError } from './problem.js';

describe('createNanasClient', () => {
  it('throws ProblemError when upstream returns RFC7807-ish Problem JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: { en: 'Bad request', id: 'Salah!' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { client } = createNanasClient({ baseUrl: 'http://localhost', fetch: fetchMock });

    const err = await client.GET('/healthz', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProblemError);
    if (err instanceof ProblemError) {
      expect(err.status).toBe(400);
      expect(err.body.code).toBe('VALIDATION_ERROR');
      expect(err.message).toBe('Bad request');
    }
  });

  it('injects Authorization from static token when missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const { client } = createNanasClient({
      baseUrl: 'http://localhost',
      token: 'jwt-here',
      fetch: fetchMock,
    });
    await client.GET('/healthz', {});
    expect(fetchMock).toHaveBeenCalled();
    const arg0 = fetchMock.mock.calls[0]?.[0];
    const headers =
      arg0 instanceof Request
        ? arg0.headers
        : new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit)?.headers);
    expect(headers.get('Authorization')).toBe('Bearer jwt-here');
  });
});
