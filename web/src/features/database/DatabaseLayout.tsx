import { Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabNav } from '@/components/data/TabNav';

export function DatabaseLayout() {
  const { t } = useTranslation();
  const { pid } = useParams();
  return (
    <div>
      <PageHeader title={t('nav.database')} description={t('database.queryHelper')} />
      <TabNav
        items={[
          { to: `/app/projects/${pid}/database/query`, label: t('database.query') },
          { to: `/app/projects/${pid}/database/migrate`, label: t('database.migrate') },
          { to: `/app/projects/${pid}/database/catalog`, label: t('database.catalog') },
          { to: `/app/projects/${pid}/database/databases`, label: t('database.databases') },
          { to: `/app/projects/${pid}/database/tables`, label: t('database.tables') },
          { to: `/app/projects/${pid}/database/graphql`, label: t('database.graphql') },
        ]}
      />
      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  );
}
