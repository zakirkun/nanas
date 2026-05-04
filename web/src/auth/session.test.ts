import { describe, expect, it, beforeEach } from 'vitest';
import { useSession, isAuthenticated } from './session';

function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature`;
}

beforeEach(() => {
  useSession.getState().clear();
});

describe('useSession', () => {
  it('starts unauthenticated', () => {
    expect(isAuthenticated()).toBe(false);
    expect(useSession.getState().token).toBeNull();
    expect(useSession.getState().user).toBeNull();
  });

  it('decodes JWT claims into the user payload', () => {
    const token = makeJwt({
      sub: '00000000-0000-0000-0000-000000000001',
      email: 'admin@example.com',
      platform_role: 'super_admin',
    });
    useSession.getState().setSession({ token, mode: 'jwt' });
    expect(isAuthenticated()).toBe(true);
    const u = useSession.getState().user;
    expect(u?.id).toBe('00000000-0000-0000-0000-000000000001');
    expect(u?.email).toBe('admin@example.com');
    expect(u?.platform_role).toBe('super_admin');
  });

  it('handles API key sessions without decoding the value', () => {
    useSession.getState().setSession({ token: 'sk_dummy', mode: 'api_key' });
    expect(useSession.getState().mode).toBe('api_key');
    expect(useSession.getState().user?.id).toBe('api-key');
  });

  it('clear() resets token and user', () => {
    useSession.getState().setSession({
      token: makeJwt({ sub: '11111111-1111-1111-1111-111111111111' }),
    });
    useSession.getState().clear();
    expect(useSession.getState().token).toBeNull();
    expect(useSession.getState().user).toBeNull();
  });
});
