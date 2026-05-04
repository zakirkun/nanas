import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { EmptyState } from '@/components/data/EmptyState';
import { Badge } from '@/components/ui/badge';
import { api } from '@/api/client';
import { Flamegraph, type FlameSpan } from './Flamegraph';

interface SpanRecord {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  name: string;
  kind: string;
  started_at: string;
  ended_at: string;
  duration_ns: number;
  status_code: string;
  attributes?: Record<string, unknown>;
}

export function TracesPage() {
  const { pid } = useParams();
  const [params, setParams] = useSearchParams();
  const initialID = params.get('trace_id');
  const [selectedID, setSelectedID] = useState<string | null>(initialID);

  const traces = useQuery({
    queryKey: ['traces', pid],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/observability/traces', {
        params: { path: { pid: pid! }, query: { limit: 50 } },
      });
      if (error) throw error;
      return ((data as { traces?: SpanRecord[] } | undefined)?.traces ?? []) as SpanRecord[];
    },
  });

  const trace = useQuery({
    queryKey: ['traces', pid, 'detail', selectedID],
    enabled: !!selectedID,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/observability/traces', {
        params: { query: { trace_id: selectedID! } },
      });
      if (error) throw error;
      const t = (data as { trace?: { trace_id: string; spans: SpanRecord[] } } | undefined)?.trace;
      return t ?? { trace_id: selectedID!, spans: [] };
    },
  });

  const spans = trace.data?.spans ?? [];

  const flame: FlameSpan[] = useMemo(() => {
    if (spans.length === 0) return [];
    return spans.map((s) => ({
      id: s.span_id,
      parentID: s.parent_span_id,
      name: s.name,
      startedAt: new Date(s.started_at).getTime(),
      endedAt: new Date(s.ended_at).getTime(),
      kind: s.kind,
      status: s.status_code,
    }));
  }, [spans]);

  const [hoveredID, setHoveredID] = useState<string | null>(null);
  const hoveredSpan = hoveredID ? spans.find((s) => s.span_id === hoveredID) ?? null : null;

  return (
    <div>
      <PageHeader title="Traces" description="GET /v1/projects/:pid/observability/traces" />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-sm">Recent traces</CardTitle>
            <CardDescription>One row per trace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {traces.error ? <ProblemAlert error={traces.error} /> : null}
            {traces.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (traces.data ?? []).length === 0 ? (
              <EmptyState icon={<Activity className="h-6 w-6" />} title="No traces yet" />
            ) : (
              (traces.data ?? []).map((tr) => (
                <button
                  key={tr.trace_id}
                  type="button"
                  onClick={() => {
                    setSelectedID(tr.trace_id);
                    params.set('trace_id', tr.trace_id);
                    setParams(params, { replace: true });
                  }}
                  className={`w-full rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted ${
                    selectedID === tr.trace_id ? 'border-primary bg-muted' : 'border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate font-mono">{tr.trace_id.slice(0, 12)}…</span>
                    <Badge variant={statusBadge(tr.status_code)} className="text-[10px]">
                      {tr.status_code}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-muted-foreground">
                    <span className="truncate">{tr.name}</span>
                    <span className="font-mono">{(tr.duration_ns / 1e6).toFixed(1)}ms</span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Flamegraph{' '}
                {selectedID ? (
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                    {selectedID}
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedID ? (
                <p className="text-sm text-muted-foreground">Select a trace to inspect spans.</p>
              ) : trace.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : flame.length === 0 ? (
                <EmptyState title="No spans recorded" />
              ) : (
                <Flamegraph spans={flame} onHover={setHoveredID} highlightID={hoveredID} />
              )}
            </CardContent>
          </Card>

          {hoveredSpan ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Span detail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">name:</span> {hoveredSpan.name}
                </p>
                <p>
                  <span className="text-muted-foreground">kind:</span> {hoveredSpan.kind}
                </p>
                <p>
                  <span className="text-muted-foreground">duration:</span>{' '}
                  {(hoveredSpan.duration_ns / 1e6).toFixed(2)}ms
                </p>
                <p>
                  <span className="text-muted-foreground">started:</span>{' '}
                  {format(new Date(hoveredSpan.started_at), 'HH:mm:ss.SSS')}
                </p>
                <p>
                  <span className="text-muted-foreground">status:</span> {hoveredSpan.status_code}
                </p>
                {hoveredSpan.attributes ? (
                  <pre className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
                    {JSON.stringify(hoveredSpan.attributes, null, 2)}
                  </pre>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function statusBadge(s: string): 'success' | 'destructive' | 'warning' | 'outline' {
  if (s === 'ok') return 'success';
  if (s === 'error') return 'destructive';
  if (s === 'warn') return 'warning';
  return 'outline';
}
