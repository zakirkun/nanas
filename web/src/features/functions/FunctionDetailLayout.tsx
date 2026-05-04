import { Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabNav } from '@/components/data/TabNav';
import { useLocalCache } from '@/hooks/useLocalCache';

export function FunctionDetailLayout() {
  const { t } = useTranslation();
  const { pid, fid } = useParams();
  const items = useLocalCache('functions', pid);
  const item = items.find((i) => i.id === fid);

  return (
    <div>
      <PageHeader
        title={item?.name ?? `Function ${fid?.slice(0, 8) ?? ''}`}
        description={<span className="font-mono text-xs">{fid}</span>}
      />
      <TabNav
        items={[
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
