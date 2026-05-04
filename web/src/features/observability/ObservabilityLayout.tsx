import { Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabNav } from '@/components/data/TabNav';

export function ObservabilityLayout() {
  const { t } = useTranslation();
  const { pid } = useParams();
  return (
    <div>
      <PageHeader title={t('nav.observability')} />
      <TabNav
        items={[
          { to: `/app/projects/${pid}/observability/logs`, label: t('nav.logs') },
          { to: `/app/projects/${pid}/observability/traces`, label: t('observability.traces', 'Traces') },
          { to: `/app/projects/${pid}/observability/metrics`, label: t('nav.metrics') },
        ]}
      />
      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  );
}
