import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, Code2, LayoutGrid, MoreHorizontal, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  projectId?: string;
}

export function BottomNav({ projectId }: BottomNavProps) {
  const { t } = useTranslation();
  const loc = useLocation();
  if (!projectId) return null;

  const items = [
    { to: `/app/projects/${projectId}`, label: t('nav.overview'), icon: LayoutGrid, end: true },
    { to: `/app/projects/${projectId}/functions`, label: t('nav.functions'), icon: Code2 },
    { to: `/app/projects/${projectId}/realtime`, label: t('nav.realtime'), icon: Radio },
    { to: `/app/projects/${projectId}/observability/logs`, label: t('nav.logs'), icon: Activity },
    { to: `/app/projects/${projectId}/settings`, label: t('common.more', 'More'), icon: MoreHorizontal },
  ];

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] md:hidden',
      )}
      aria-label="Mobile primary"
    >
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground',
              isActive && 'text-foreground',
            )
          }
          state={{ from: loc }}
        >
          <Icon className="h-5 w-5" />
          <span className="truncate px-1">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
