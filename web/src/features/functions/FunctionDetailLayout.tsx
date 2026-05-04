import { useCallback } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from 'react-hotkeys-hook';
import { Globe, Lock } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabNav } from '@/components/data/TabNav';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { useFunctionDetail } from './queries';

export function FunctionDetailLayout() {
  const { t } = useTranslation();
  const { pid, fid } = useParams();
  const navigate = useNavigate();
  const detail = useFunctionDetail(pid, fid);

  const deployShortcut = useCallback(() => {
    if (pid && fid) navigate(`/app/projects/${pid}/functions/${fid}/deployments`);
  }, [navigate, pid, fid]);
  const logsShortcut = useCallback(() => {
    if (pid) navigate(`/app/projects/${pid}/observability/logs`);
  }, [navigate, pid]);

  useHotkeys('p', deployShortcut, { enabled: !!pid && !!fid, preventDefault: true }, [deployShortcut]);
  useHotkeys('l', logsShortcut, { enabled: !!pid, preventDefault: true }, [logsShortcut]);

  return (
    <div>
      <PageHeader
        title={
          detail.isLoading ? (
            <Skeleton className="h-7 w-40" />
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span>{detail.data?.name ?? `Function ${fid?.slice(0, 8) ?? ''}`}</span>
              {detail.data?.entrypoint?.enabled ? (
                <Badge variant="info" className="gap-1">
                  <Globe className="h-3 w-3" /> public
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <Lock className="h-3 w-3" /> private
                </Badge>
              )}
              {detail.data?.current_version ? (
                <Badge variant="outline" className="font-mono">
                  v{detail.data.current_version}
                </Badge>
              ) : null}
            </span>
          )
        }
        description={
          <span className="font-mono text-xs">
            {detail.data?.slug ? `${detail.data.slug} · ` : ''}
            {fid}
          </span>
        }
      />
      {detail.error ? <ProblemAlert error={detail.error} /> : null}
      <TabNav
        items={[
          { to: `/app/projects/${pid}/functions/${fid}/editor`, label: t('functions.tabs.editor', 'Editor') },
          { to: `/app/projects/${pid}/functions/${fid}/versions`, label: t('functions.tabs.versions') },
          { to: `/app/projects/${pid}/functions/${fid}/builds`, label: t('functions.tabs.builds') },
          { to: `/app/projects/${pid}/functions/${fid}/deployments`, label: t('functions.tabs.deployments') },
          { to: `/app/projects/${pid}/functions/${fid}/invoke`, label: t('functions.tabs.invoke') },
          { to: `/app/projects/${pid}/functions/${fid}/entrypoint`, label: t('functions.tabs.entrypoint') },
        ]}
      />
      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  );
}
