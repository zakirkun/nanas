import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HardDrive } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { api } from '@/api/client';

export function DatabasesPage() {
  const { t } = useTranslation();
  const { pid } = useParams();

  const q = useQuery({
    queryKey: ['projects', pid, 'db-databases'],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/db/databases', {
        params: { path: { pid: pid! } },
      });
      if (error) throw error;
      return data as { databases?: string[]; allowlist?: string[] };
    },
    enabled: !!pid,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-4 w-4" /> {t('database.databases')}
          </CardTitle>
          <CardDescription>{t('database.databasesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {q.error ? <ProblemAlert error={q.error} /> : null}
          {q.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('database.clusterCatalog')}
                </p>
                <ul className="space-y-1 font-mono text-sm">
                  {(q.data?.databases ?? []).length === 0 ? (
                    <li className="text-muted-foreground">{t('database.databasesEmpty')}</li>
                  ) : (
                    (q.data?.databases ?? []).map((d) => <li key={d}>{d}</li>)
                  )}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('database.allowlistColumn')}
                </p>
                <ul className="space-y-1 font-mono text-sm">
                  {(q.data?.allowlist ?? []).length === 0 ? (
                    <li className="text-muted-foreground">{t('database.databaseAllowlistEmpty')}</li>
                  ) : (
                    (q.data?.allowlist ?? []).map((d) => <li key={d}>{d}</li>)
                  )}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
