import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search, ScrollText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/data/EmptyState';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/api/client';

interface LogRow {
  id?: string;
  level: string;
  message: string;
  deployment_id?: string | null;
  ts?: string;
  created_at?: string;
  [k: string]: unknown;
}

export function LogsViewerPage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const [filters, setFilters] = useState({ deployment_id: '', from: '', to: '', limit: 100 });
  const [applied, setApplied] = useState(filters);

  const list = useQuery({
    queryKey: ['logs', pid, applied],
    enabled: !!pid,
    queryFn: async () => {
      const query: Record<string, string | number> = { limit: applied.limit };
      if (applied.deployment_id) query.deployment_id = applied.deployment_id;
      if (applied.from) query.from = new Date(applied.from).toISOString();
      if (applied.to) query.to = new Date(applied.to).toISOString();
      const { data, error } = await api.GET('/v1/projects/{pid}/observability/logs', {
        params: { path: { pid: pid! }, query: query as never },
      });
      if (error) throw error;
      return ((data as { logs?: LogRow[] } | undefined)?.logs ?? []) as LogRow[];
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('observability.logsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_180px_180px_120px_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="dep-id">{t('observability.deploymentId')}</Label>
            <Input
              id="dep-id"
              value={filters.deployment_id}
              onChange={(e) => setFilters((f) => ({ ...f, deployment_id: e.target.value }))}
              className="font-mono"
              placeholder="optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from">{t('observability.from')}</Label>
            <Input
              id="from"
              type="datetime-local"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">{t('observability.to')}</Label>
            <Input
              id="to"
              type="datetime-local"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lim">{t('observability.limit')}</Label>
            <Input
              id="lim"
              type="number"
              min={1}
              max={1000}
              value={filters.limit}
              onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value || 100) }))}
            />
          </div>
          <Button onClick={() => setApplied(filters)}>
            <Search className="mr-2 h-4 w-4" /> {t('common.search')}
          </Button>
        </CardContent>
      </Card>

      {list.error ? <ProblemAlert error={list.error} /> : null}
      <Card>
        <CardContent className="pt-6">
          {list.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (list.data ?? []).length === 0 ? (
            <EmptyState icon={<ScrollText className="h-8 w-8" />} title={t('observability.noLogs')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Deployment</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((row, i) => (
                  <TableRow key={row.id ?? i}>
                    <TableCell className="font-mono text-xs">
                      {row.ts || row.created_at
                        ? format(new Date((row.ts ?? row.created_at)!), 'yyyy-MM-dd HH:mm:ss')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <LogLevel value={row.level} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {String(row.deployment_id ?? '').slice(0, 8) || '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.message}</TableCell>
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

function LogLevel({ value }: { value: string }) {
  const v = (value ?? '').toLowerCase();
  if (v === 'error' || v === 'fatal') return <Badge variant="destructive">{value}</Badge>;
  if (v === 'warn' || v === 'warning') return <Badge variant="warning">{value}</Badge>;
  if (v === 'info') return <Badge variant="info">{value}</Badge>;
  return <Badge variant="outline">{value}</Badge>;
}
