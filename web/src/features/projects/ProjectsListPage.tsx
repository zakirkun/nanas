import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Boxes, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/data/EmptyState';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { StatusBadge } from '@/components/data/StatusBadge';
import { NewProjectDialog } from './NewProjectDialog';
import { useProjectsList } from './queries';
import { format } from 'date-fns';

export function ProjectsListPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useProjectsList();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (params.get('new') === '1') {
      setOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const projects = data?.projects ?? [];

  return (
    <div>
      <PageHeader
        title={t('projects.title')}
        description={t('common.tagline')}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> {t('projects.newProject')}
          </Button>
        }
      />

      {error ? <ProblemAlert error={error} /> : null}

      {isLoading ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-8 w-8" />}
          title={t('projects.noProjects')}
          description={t('common.tagline')}
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> {t('projects.newProject')}
            </Button>
          }
        />
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {projects.map((p) => (
            <Card key={p.id} className="min-w-0 transition-shadow hover:shadow-md">
              <CardContent className="space-y-3 pt-6">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold">
                      <Link to={`/app/projects/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </h3>
                    {p.slug ? (
                      <p className="font-mono text-xs text-muted-foreground">{p.slug}</p>
                    ) : null}
                  </div>
                  <StatusBadge value={p.disabled ? 'disabled' : p.provision_status} />
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">{t('projects.tenantDb')}</dt>
                    <dd className="break-all font-mono leading-snug text-foreground">
                      {p.tenant_db_name ?? '—'}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">{t('projects.minioBucket')}</dt>
                    <dd className="break-all font-mono leading-snug text-foreground">{p.minio_bucket ?? '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">{t('projects.regionLabel')}</dt>
                    <dd className="break-all font-mono leading-snug text-foreground">{p.region}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">{t('common.createdAt')}</dt>
                    <dd className="break-all font-mono leading-snug text-foreground">
                      {p.created_at ? format(new Date(p.created_at), 'yyyy-MM-dd') : '—'}
                    </dd>
                  </div>
                </dl>
                {p.provision_error ? (
                  <p className="text-xs text-destructive">{p.provision_error}</p>
                ) : null}
                <div className="pt-1">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/app/projects/${p.id}`}>
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      {t('projects.tabs.overview')}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
