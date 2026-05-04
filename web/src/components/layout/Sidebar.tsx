import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Boxes,
  Database,
  HardDrive,
  Code2,
  Webhook,
  Activity,
  ScrollText,
  Radio,
  ShoppingBag,
  ShieldCheck,
  LayoutDashboard,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from '@/auth/session';

interface SidebarProps {
  projectId?: string;
}

export function Sidebar({ projectId }: SidebarProps) {
  const { t } = useTranslation();
  const role = useSession((s) => s.user?.platform_role);
  const isStaff = role === 'staff' || role === 'super_admin';

  const projectNav = projectId
    ? [
        { to: `/app/projects/${projectId}`, label: t('nav.overview'), icon: LayoutDashboard, end: true },
        { to: `/app/projects/${projectId}/database`, label: t('nav.database'), icon: Database },
        { to: `/app/projects/${projectId}/storage`, label: t('nav.storage'), icon: HardDrive },
        { to: `/app/projects/${projectId}/functions`, label: t('nav.functions'), icon: Code2 },
        { to: `/app/projects/${projectId}/triggers`, label: t('nav.triggers'), icon: Webhook },
        { to: `/app/projects/${projectId}/realtime`, label: t('nav.realtime'), icon: Radio },
        { to: `/app/projects/${projectId}/observability`, label: t('nav.observability'), icon: Activity },
        { to: `/app/projects/${projectId}/audit`, label: t('nav.audit'), icon: ScrollText },
        { to: `/app/projects/${projectId}/members`, label: t('nav.members'), icon: Users },
      ]
    : [];

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/20 md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
          N
        </div>
        <span className="text-sm font-semibold tracking-tight">{t('common.appName')}</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        <SidebarLink to="/app/projects" icon={Boxes} label={t('nav.projects')} />
        <SidebarLink to="/app/marketplace" icon={ShoppingBag} label={t('nav.marketplace')} />
        {projectNav.length > 0 ? (
          <div className="mt-4">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('nav.overview')}
            </div>
            {projectNav.map((item) => (
              <SidebarLink key={item.to} {...item} />
            ))}
          </div>
        ) : null}
        {isStaff ? (
          <div className="mt-4">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('nav.admin')}
            </div>
            <SidebarLink to="/app/admin/users" icon={ShieldCheck} label={t('nav.adminUsers')} />
            <SidebarLink to="/app/admin/projects" icon={Boxes} label={t('nav.adminProjects')} />
          </div>
        ) : null}
      </nav>
    </aside>
  );
}

interface SidebarLinkProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  end?: boolean;
}

function SidebarLink({ to, icon: Icon, label, end }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
          'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          isActive && 'bg-accent text-accent-foreground',
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
