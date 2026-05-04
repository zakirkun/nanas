import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { rawFetch } from '@/api/client';

interface PromSeries {
  metric: string;
  labels: Record<string, string>;
  value: number;
}

function parsePromText(text: string): PromSeries[] {
  const out: PromSeries[] = [];
  for (const lineRaw of text.split('\n')) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([0-9eE+\-.NaN]+)/);
    if (!m) continue;
    const [, metric, labelsBlob, valueStr] = m;
    if (!metric) continue;
    const labels: Record<string, string> = {};
    if (labelsBlob) {
      const inner = labelsBlob.slice(1, -1);
      const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(inner))) {
        if (mm[1]) labels[mm[1]] = (mm[2] ?? '').replace(/\\(.)/g, '$1');
      }
    }
    const value = Number(valueStr);
    if (Number.isFinite(value)) out.push({ metric, labels, value });
  }
  return out;
}

export function MetricsPage() {
  const { t } = useTranslation();
  const { pid } = useParams();

  const metrics = useQuery({
    queryKey: ['metrics', pid],
    enabled: !!pid,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await rawFetch('/metrics');
      if (!res.ok) throw new Error('Failed to load metrics');
      return parsePromText(await res.text());
    },
  });

  const projectId = pid ?? '';

  const invocations = useMemo(() => {
    if (!metrics.data) return [];
    const filtered = metrics.data.filter(
      (s) =>
        s.metric === 'nanas_invocations_total' &&
        (s.labels.project === projectId || !s.labels.project),
    );
    const byKey = new Map<string, number>();
    for (const s of filtered) {
      const key = `${s.labels.function ?? '?'}/${s.labels.result ?? '?'}`;
      byKey.set(key, (byKey.get(key) ?? 0) + s.value);
    }
    return Array.from(byKey.entries()).map(([name, count]) => ({ name, count }));
  }, [metrics.data, projectId]);

  const dbQueries = useMemo(() => {
    if (!metrics.data) return [];
    const filtered = metrics.data.filter(
      (s) => s.metric === 'nanas_db_query_total' && s.labels.project === projectId,
    );
    const byResult = new Map<string, number>();
    for (const s of filtered) {
      const k = s.labels.result ?? '?';
      byResult.set(k, (byResult.get(k) ?? 0) + s.value);
    }
    return Array.from(byResult.entries()).map(([result, count]) => ({ result, count }));
  }, [metrics.data, projectId]);

  const latencyBuckets = useMemo(() => {
    if (!metrics.data) return [];
    const filtered = metrics.data.filter(
      (s) =>
        s.metric === 'nanas_invocation_seconds_bucket' &&
        (s.labels.project === projectId || !s.labels.project),
    );
    const byLe = new Map<string, number>();
    for (const s of filtered) {
      if (!s.labels.le) continue;
      byLe.set(s.labels.le, (byLe.get(s.labels.le) ?? 0) + s.value);
    }
    return Array.from(byLe.entries())
      .map(([le, count]) => ({ le, count }))
      .sort((a, b) => Number(a.le) - Number(b.le));
  }, [metrics.data, projectId]);

  if (metrics.error) return <ProblemAlert error={metrics.error} />;
  if (metrics.isLoading) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invocations</CardTitle>
          <CardDescription>{t('observability.metricsHelper')}</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {invocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invocations yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={invocations}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">DB queries</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {dbQueries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No queries yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dbQueries}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="result" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Invocation latency buckets</CardTitle>
          <CardDescription>nanas_invocation_seconds_bucket (cumulative).</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {latencyBuckets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No samples yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="le" tick={{ fontSize: 11 }} label={{ value: 'le (s)', position: 'insideBottom', offset: -2 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
