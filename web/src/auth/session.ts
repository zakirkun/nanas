import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AuthMode = 'jwt' | 'api_key';
export type PlatformRole = 'super_admin' | 'staff' | 'user';

export interface SessionUser {
  id: string;
  email: string;
  platform_role?: PlatformRole;
}

interface SessionState {
  token: string | null;
  mode: AuthMode;
  user: SessionUser | null;
  setSession: (params: { token: string; mode?: AuthMode; user?: SessionUser | null }) => void;
  setUser: (user: SessionUser | null) => void;
  clear: () => void;
}

function decodeJwt(token: string): SessionUser | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const payload = JSON.parse(json) as Record<string, unknown>;
    const sub = (payload.sub as string | undefined) ?? (payload.user_id as string | undefined);
    const email = (payload.email as string | undefined) ?? '';
    if (!sub) return null;
    return {
      id: sub,
      email,
      platform_role: payload.platform_role as PlatformRole | undefined,
    };
  } catch {
    return null;
  }
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      mode: 'jwt',
      user: null,
      setSession: ({ token, mode = 'jwt', user }) => {
        const resolvedUser =
          user ?? (mode === 'jwt' ? decodeJwt(token) : { id: 'api-key', email: 'API key session' });
        set({ token, mode, user: resolvedUser ?? null });
      },
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null, mode: 'jwt' }),
    }),
    {
      name: 'nanas.session.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ token: s.token, mode: s.mode, user: s.user }),
    },
  ),
);

export function isAuthenticated(): boolean {
  return !!useSession.getState().token;
}
