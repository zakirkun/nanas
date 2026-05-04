import { Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabNav } from '@/components/data/TabNav';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/data/StatusBadge';
import { useProject } from './queries';

export function ProjectDetailLayout() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const { data: project, isLoading, error } = useProject(pid);

  return (
    <div>
      <PageHeader
        title={
          isLoading ? (
            <Skeleton className="h-7 w-40" />
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span>{project?.name ?? '—'}</span>
              <StatusBadge value={project?.disabled ? 'disabled' : project?.provision_status} />
            </span>
          )
        }
        description={
          project?.slug ? (
            <span className="font-mono">{project.slug}</span>
          ) : (
            t('projects.provisionStatus')
          )
        }
      />
      {error ? <ProblemAlert error={error} /> : null}
      <TabNav
        items={[
          { to: `/app/projects/${pid}`, label: t('projects.tabs.overview'), end: true },
          { to: `/app/projects/${pid}/members`, label: t('projects.tabs.members') },
          { to: `/app/projects/${pid}/keys`, label: t('projects.tabs.apiKeys') },
          { to: `/app/projects/${pid}/settings`, label: t('projects.tabs.settings') },
        ]}
      />
      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  );
}
