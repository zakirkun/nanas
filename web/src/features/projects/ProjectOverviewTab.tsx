import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CopyButton } from '@/components/data/CopyButton';
import { useProject } from './queries';

export function ProjectOverviewTab() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const { data, isLoading } = useProject(pid);

  if (isLoading || !data) {
    return <Skeleton className="h-40 w-full" />;
  }

  const fields: Array<[string, React.ReactNode]> = [
    [t('common.id'), <span className="font-mono">{data.id}</span>],
    [t('projects.tenantDb'), <span className="font-mono">{data.tenant_db_name ?? '—'}</span>],
    [t('projects.minioBucket'), <span className="font-mono">{data.minio_bucket ?? '—'}</span>],
    [t('projects.regionLabel'), <span className="font-mono">{data.region}</span>],
    [t('projects.owner'), <span className="font-mono">{data.owner_id}</span>],
    [
      t('common.createdAt'),
      <span className="font-mono">
        {data.created_at ? format(new Date(data.created_at), 'PPpp') : '—'}
      </span>,
    ],
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('projects.tabs.overview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-[140px_1fr]">
            {fields.map(([label, value]) => (
              <FieldRow key={label as string} label={label as string} value={value} />
            ))}
          </dl>
          {data.provision_error ? (
            <p className="mt-3 text-sm text-destructive">{data.provision_error}</p>
          ) : null}
        </CardContent>
      </Card>
      {data.slug ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Public function URL</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Configure a function entrypoint to receive public traffic. The base URL pattern is:
            </p>
            <code className="mt-3 block rounded-md bg-muted p-3 font-mono text-xs">
              {`POST /fn/${data.slug}/{function_slug}`}
            </code>
            <div className="mt-2 flex justify-end">
              <CopyButton value={`/fn/${data.slug}/`} />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </>
  );
}
