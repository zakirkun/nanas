import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Inbox } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/data/EmptyState';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/api/client';

interface DLQRow {
  id?: string;
  trigger_id?: string;
  reason?: string;
  payload?: unknown;
  created_at?: string;
  [k: string]: unknown;
}

export function DLQPage() {
  const { t } = useTranslation();
  const { pid } = useParams();

  const list = useQuery({
    queryKey: ['triggers', pid, 'dlq'],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/triggers/dlq', {
        params: { path: { pid: pid! } },
      });
      if (error) throw error;
      return ((data as { events?: DLQRow[] } | undefined)?.events ?? []) as DLQRow[];
    },
  });

  return (
    <div>
      <PageHeader title={t('triggers.dlq')} description="GET /v1/projects/:pid/triggers/dlq" />
      {list.error ? <ProblemAlert error={list.error} /> : null}
      <Card>
        <CardContent className="pt-6">
          {list.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (list.data ?? []).length === 0 ? (
            <EmptyState icon={<Inbox className="h-8 w-8" />} title={t('triggers.dlqEmpty')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.id')}</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>{t('common.createdAt')}</TableHead>
                  <TableHead>Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((row, i) => (
                  <TableRow key={row.id ?? i}>
                    <TableCell className="font-mono text-xs">
                      {String(row.id ?? '').slice(0, 8) || '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {String(row.trigger_id ?? '').slice(0, 8) || '—'}
                    </TableCell>
                    <TableCell>{String(row.reason ?? '—')}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.created_at ? format(new Date(row.created_at), 'yyyy-MM-dd HH:mm') : '—'}
                    </TableCell>
                    <TableCell>
                      <pre className="max-h-32 max-w-[420px] overflow-auto rounded bg-muted p-2 text-[11px]">
                        {JSON.stringify(row.payload ?? row, null, 2)}
                      </pre>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
