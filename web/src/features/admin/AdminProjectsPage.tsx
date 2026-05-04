import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Boxes, Pause, Play } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/data/EmptyState';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Pagination } from '@/components/data/Pagination';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/data/StatusBadge';
import { api } from '@/api/client';
import type { Project } from '@/features/projects/queries';

export function AdminProjectsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const list = useQuery({
    queryKey: ['admin', 'projects', page],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/projects', {
        params: { query: { limit: pageSize, offset: (page - 1) * pageSize } },
      });
      if (error) throw error;
      return ((data as { projects?: Project[] } | undefined)?.projects ?? []) as Project[];
    },
  });

  const setEnabled = useMutation({
    mutationFn: async (vars: { pid: string; enable: boolean }) => {
      if (vars.enable) {
        const { error } = await api.POST('/admin/projects/{pid}/enable', {
          params: { path: { pid: vars.pid } },
        });
        if (error) throw error;
      } else {
        const { error } = await api.POST('/admin/projects/{pid}/disable', {
          params: { path: { pid: vars.pid } },
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      toast.success(vars.enable ? t('admin.enabled') : t('admin.disabled'));
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] });
    },
  });

  return (
    <div>
      <PageHeader title={t('admin.projects')} description="GET /admin/projects" />
      {list.error ? <ProblemAlert error={list.error} /> : null}
      <Card>
        <CardContent className="pt-6">
          {list.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (list.data ?? []).length === 0 ? (
            <EmptyState icon={<Boxes className="h-8 w-8" />} title={t('common.empty')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>{t('projects.provisionStatus')}</TableHead>
                  <TableHead>{t('common.createdAt')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{p.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{p.id}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.owner_id?.slice(0, 8)}</TableCell>
                    <TableCell className="font-mono">{p.region}</TableCell>
                    <TableCell>
                      <StatusBadge value={p.disabled ? 'disabled' : p.provision_status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.created_at ? format(new Date(p.created_at), 'yyyy-MM-dd') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.disabled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={setEnabled.isPending}
                          onClick={() => setEnabled.mutate({ pid: p.id, enable: true })}
                        >
                          <Play className="mr-2 h-3.5 w-3.5" /> {t('admin.enable')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={setEnabled.isPending}
                          onClick={() => setEnabled.mutate({ pid: p.id, enable: false })}
                        >
                          <Pause className="mr-2 h-3.5 w-3.5" /> {t('admin.disable')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="mt-4">
        <Pagination
          page={page}
          pageSize={pageSize}
          onChange={setPage}
          disabled={list.isLoading}
        />
      </div>
    </div>
  );
}
