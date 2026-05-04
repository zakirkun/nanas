import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Webhook } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/data/EmptyState';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/api/client';

interface CDCRow {
  id: string;
  function_id: string;
  table: string;
  created_at?: string;
  [k: string]: unknown;
}

export function CDCSubscriptionsPage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const qc = useQueryClient();
  const [fnId, setFnId] = useState('');
  const [table, setTable] = useState('');

  const list = useQuery({
    queryKey: ['cdc', pid],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/cdc/subscriptions', {
        params: { path: { pid: pid! } },
      });
      if (error) throw error;
      return ((data as { subscriptions?: CDCRow[]; rows?: CDCRow[] } | undefined)?.subscriptions ??
        (data as { rows?: CDCRow[] } | undefined)?.rows ??
        []) as CDCRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/v1/projects/{pid}/cdc/subscriptions', {
        params: { path: { pid: pid! } },
        body: { function_id: fnId, table } as { function_id: string; table: string },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(t('common.saveSucceeded'));
      setFnId('');
      setTable('');
      qc.invalidateQueries({ queryKey: ['cdc', pid] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/v1/projects/{pid}/cdc/subscriptions/{id}', {
        params: { path: { pid: pid!, id } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('triggers.cdc.removed'));
      qc.invalidateQueries({ queryKey: ['cdc', pid] });
    },
  });

  return (
    <div>
      <PageHeader title={t('triggers.cdc.title')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('triggers.cdc.newSubscription')}</CardTitle>
            <CardDescription>POST /v1/projects/:pid/cdc/subscriptions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cdc-fn">{t('triggers.cdc.function')}</Label>
              <Input
                id="cdc-fn"
                placeholder="00000000-…"
                value={fnId}
                onChange={(e) => setFnId(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cdc-tbl">{t('triggers.cdc.table')}</Label>
              <Input
                id="cdc-tbl"
                placeholder="orders"
                value={table}
                onChange={(e) => setTable(e.target.value)}
              />
            </div>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !fnId || !table}
            >
              <Plus className="mr-2 h-4 w-4" /> {t('triggers.cdc.newSubscription')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('triggers.cdc.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {list.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : list.error ? (
              <ProblemAlert error={list.error} />
            ) : (list.data ?? []).length === 0 ? (
              <EmptyState icon={<Webhook className="h-8 w-8" />} title={t('common.empty')} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.id')}</TableHead>
                    <TableHead>{t('triggers.cdc.function')}</TableHead>
                    <TableHead>{t('triggers.cdc.table')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(list.data ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.id?.slice(0, 8)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.function_id?.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-mono">{s.table}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove.mutate(s.id)}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
