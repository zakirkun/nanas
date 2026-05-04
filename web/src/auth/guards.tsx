import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession, type PlatformRole } from './session';

const PLATFORM_ORDER: PlatformRole[] = ['user', 'staff', 'super_admin'];

function platformAtLeast(have: PlatformRole | undefined, need: PlatformRole): boolean {
  if (!have) return false;
  return PLATFORM_ORDER.indexOf(have) >= PLATFORM_ORDER.indexOf(need);
}

export function RequireAuth({ children }: { children?: ReactNode }) {
  const token = useSession((s) => s.token);
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children ?? <Outlet />}</>;
}

export function RequirePlatformRole({
  role,
  children,
}: {
  role: PlatformRole;
  children?: ReactNode;
}) {
  const user = useSession((s) => s.user);
  if (!platformAtLeast(user?.platform_role, role)) {
    return <Navigate to="/app" replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const token = useSession((s) => s.token);
  if (token) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
