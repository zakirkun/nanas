import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface FlameSpan {
  id: string;
  parentID?: string;
  name: string;
  startedAt: number; // ms epoch
  endedAt: number; // ms epoch
  kind: string;
  status: string;
}

interface FlamegraphProps {
  spans: FlameSpan[];
  onHover?: (id: string | null) => void;
  highlightID?: string | null;
}

interface FlameLayout {
  span: FlameSpan;
  depth: number;
  leftPct: number;
  widthPct: number;
}

/**
 * A minimal SVG-free flamegraph. Spans are placed by depth using parent
 * references; each row's bars share the same horizontal scale (root window).
 * No external charting library is needed — this keeps the SPA bundle small.
 */
export function Flamegraph({ spans, onHover, highlightID }: FlamegraphProps) {
  const layout = useMemo<FlameLayout[]>(() => buildLayout(spans), [spans]);
  const maxDepth = layout.reduce((acc, l) => Math.max(acc, l.depth), 0);

  return (
    <div className="space-y-1">
      {Array.from({ length: maxDepth + 1 }, (_, depth) => (
        <div key={depth} className="relative h-7 w-full overflow-hidden rounded bg-muted/50">
          {layout
            .filter((l) => l.depth === depth)
            .map((l) => (
              <div
                key={l.span.id}
                className={cn(
                  'absolute top-0 flex h-full items-center overflow-hidden rounded px-2 text-[11px] text-foreground transition-opacity',
                  l.span.status === 'error'
                    ? 'bg-destructive/40 hover:bg-destructive/60'
                    : 'bg-primary/30 hover:bg-primary/50',
                  highlightID === l.span.id && 'ring-2 ring-primary',
                )}
                style={{ left: `${l.leftPct}%`, width: `${Math.max(0.5, l.widthPct)}%` }}
                onMouseEnter={() => onHover?.(l.span.id)}
                onMouseLeave={() => onHover?.(null)}
                title={`${l.span.name} · ${(l.span.endedAt - l.span.startedAt).toFixed(2)}ms`}
              >
                <span className="truncate font-mono">{l.span.name}</span>
              </div>
            ))}
        </div>
      ))}
      <div className="flex justify-between pt-1 text-[10px] text-muted-foreground">
        <span>0ms</span>
        <span>{spanRangeMs(spans).toFixed(1)}ms</span>
      </div>
    </div>
  );
}

function buildLayout(spans: FlameSpan[]): FlameLayout[] {
  if (spans.length === 0) return [];
  const min = Math.min(...spans.map((s) => s.startedAt));
  const max = Math.max(...spans.map((s) => s.endedAt));
  const total = Math.max(1, max - min);
  const byID = new Map(spans.map((s) => [s.id, s]));
  const depthCache = new Map<string, number>();
  const depthOf = (id: string): number => {
    if (depthCache.has(id)) return depthCache.get(id)!;
    const span = byID.get(id);
    if (!span?.parentID || !byID.has(span.parentID)) {
      depthCache.set(id, 0);
      return 0;
    }
    const d = depthOf(span.parentID) + 1;
    depthCache.set(id, d);
    return d;
  };
  return spans
    .map<FlameLayout>((s) => ({
      span: s,
      depth: depthOf(s.id),
      leftPct: ((s.startedAt - min) / total) * 100,
      widthPct: ((s.endedAt - s.startedAt) / total) * 100,
    }))
    .sort((a, b) => a.depth - b.depth || a.leftPct - b.leftPct);
}

function spanRangeMs(spans: FlameSpan[]): number {
  if (spans.length === 0) return 0;
  const min = Math.min(...spans.map((s) => s.startedAt));
  const max = Math.max(...spans.map((s) => s.endedAt));
  return max - min;
}
