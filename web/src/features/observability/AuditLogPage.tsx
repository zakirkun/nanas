import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/data/EmptyState';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/api/client';

interface AuditEvent {
  id?: string;
  actor?: string | null;
  action?: string;
  resource?: string;
  detail?: unknown;
  created_at?: string;
  [k: string]: unknown;
}

export function AuditLogPage() {
  const { t } = useTranslation();
  const { pid } = useParams();

  const list = useQuery({
    queryKey: ['audit', pid],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/audit', {
        params: { path: { pid: pid! } },
      });
      if (error) throw error;
      return ((data as { events?: AuditEvent[] } | undefined)?.events ?? []) as AuditEvent[];
    },
  });

  return (
    <div>
      <PageHeader title={t('observability.auditTitle')} description="Admin role required." />
      {list.error ? <ProblemAlert error={list.error} /> : null}
      <Card>
        <CardContent className="pt-6">
          {list.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (list.data ?? []).length === 0 ? (
            <EmptyState
              icon={<ScrollText className="h-8 w-8" />}
              title={t('observability.noAudit')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((e, i) => (
                  <TableRow key={e.id ?? i}>
                    <TableCell className="font-mono text-xs">
                      {e.created_at ? format(new Date(e.created_at), 'yyyy-MM-dd HH:mm') : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {String(e.actor ?? '').slice(0, 8) || '—'}
                    </TableCell>
                    <TableCell>{e.action ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{e.resource ?? '—'}</TableCell>
                    <TableCell>
                      {e.detail ? (
                        <pre className="max-h-24 max-w-[420px] overflow-auto rounded bg-muted p-2 text-[11px]">
                          {JSON.stringify(e.detail, null, 2)}
                        </pre>
                      ) : null}
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
