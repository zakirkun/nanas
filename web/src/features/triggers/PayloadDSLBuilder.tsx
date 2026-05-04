import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CodeEditor } from '@/components/editor/CodeEditor';

export interface DSLConfig {
  map?: string[];
  filter?: string;
  reduce?: { op: 'sum' | 'avg' | 'count' | 'min' | 'max'; field?: string };
}

interface PayloadDSLBuilderProps {
  value: DSLConfig;
  onChange: (next: DSLConfig) => void;
  onDryRun?: (sample: unknown, override: DSLConfig) => Promise<DSLDryRunResult>;
}

export interface DSLDryRunResult {
  output: unknown;
  passed: boolean;
  reduced: unknown;
}

interface ConditionRow {
  field: string;
  op: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'IN' | 'IS NULL' | 'IS NOT NULL';
  value: string;
}

/**
 * PRD section 7: Payload DSL builder. Two-mode editor — a friendly Visual form
 * for `map`/conditions/`reduce`, and a JSON tab that stays as the source of
 * truth. Both views read from / write to the same DSLConfig prop. Dry-run uses
 * the platform endpoint to evaluate against a sample payload.
 */
export function PayloadDSLBuilder({ value, onChange, onDryRun }: PayloadDSLBuilderProps) {
  const { t } = useTranslation();
  void t;
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [json, setJson] = useState(JSON.stringify(value ?? {}, null, 2));
  const [sample, setSample] = useState('{\n  "amount": 99,\n  "status": "open",\n  "rows": []\n}');
  const [result, setResult] = useState<DSLDryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep JSON tab synced when value changes from outside.
  useEffect(() => {
    setJson(JSON.stringify(value ?? {}, null, 2));
  }, [value]);

  const conditions = useMemo<ConditionRow[]>(() => parseFilter(value.filter ?? ''), [value.filter]);

  const setMap = (next: string[]) => onChange({ ...value, map: next.length ? next : undefined });
  const setReduce = (next: DSLConfig['reduce']) => onChange({ ...value, reduce: next });
  const setConditions = (next: ConditionRow[]) =>
    onChange({ ...value, filter: next.length ? serialiseFilter(next) : undefined });

  const applyJson = () => {
    try {
      const parsed = JSON.parse(json) as DSLConfig;
      onChange(parsed);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const runDryRun = async () => {
    if (!onDryRun) return;
    try {
      const parsedSample = JSON.parse(sample);
      const r = await onDryRun(parsedSample, value);
      setResult(r);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
        <TabsList>
          <TabsTrigger value="visual">Visual</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="visual" className="space-y-3">
          <MapBuilder value={value.map ?? []} onChange={setMap} />
          <ConditionsBuilder value={conditions} onChange={setConditions} />
          <ReduceBuilder value={value.reduce} onChange={setReduce} />
        </TabsContent>
        <TabsContent value="json" className="space-y-2">
          <CodeEditor value={json} onChange={setJson} language="json" minHeight="180px" />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={applyJson}>
              Apply JSON
            </Button>
            {error ? <span className="text-xs text-destructive">{error}</span> : null}
          </div>
        </TabsContent>
      </Tabs>

      {onDryRun ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Dry-run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Sample event payload</Label>
            <CodeEditor value={sample} onChange={setSample} language="json" minHeight="120px" />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={runDryRun}>
                <Play className="mr-2 h-3.5 w-3.5" /> Evaluate
              </Button>
              {result ? (
                <Badge variant={result.passed ? 'success' : 'destructive'}>
                  {result.passed ? 'passed filter' : 'filtered out'}
                </Badge>
              ) : null}
            </div>
            {result ? (
              <pre className="max-h-[180px] overflow-auto rounded bg-muted p-3 font-mono text-xs">
                {JSON.stringify({ output: result.output, reduced: result.reduced }, null, 2)}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function MapBuilder({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="space-y-2">
      <Label>map (project these fields)</Label>
      <div className="flex flex-wrap gap-1">
        {value.map((f) => (
          <Badge key={f} variant="outline" className="gap-1">
            {f}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== f))}
              className="ml-1"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="amount"
          className="font-mono"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!draft.trim()) return;
            onChange(Array.from(new Set([...value, draft.trim()])));
            setDraft('');
          }}
        >
          <Plus className="mr-2 h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}

function ConditionsBuilder({
  value,
  onChange,
}: {
  value: ConditionRow[];
  onChange: (next: ConditionRow[]) => void;
}) {
  const update = (i: number, patch: Partial<ConditionRow>) =>
    onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  return (
    <div className="space-y-2">
      <Label>filter (joined by AND)</Label>
      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_1fr_auto] gap-2">
          <Input
            placeholder="amount"
            value={row.field}
            onChange={(e) => update(i, { field: e.target.value })}
            className="font-mono"
          />
          <Select value={row.op} onValueChange={(v) => update(i, { op: v as ConditionRow['op'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['=', '!=', '<', '<=', '>', '>=', 'IN', 'IS NULL', 'IS NOT NULL'] as const).map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={row.op.startsWith('IS') ? '(none)' : "'open' or 1 or [1,2]"}
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            className="font-mono"
            disabled={row.op === 'IS NULL' || row.op === 'IS NOT NULL'}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...value, { field: '', op: '=', value: '' }])}
      >
        <Plus className="mr-2 h-3.5 w-3.5" /> Add condition
      </Button>
    </div>
  );
}

function ReduceBuilder({
  value,
  onChange,
}: {
  value: DSLConfig['reduce'];
  onChange: (next: DSLConfig['reduce']) => void;
}) {
  const op = value?.op ?? '';
  const field = value?.field ?? '';
  return (
    <div className="space-y-2">
      <Label>reduce (over rows[])</Label>
      <div className="grid grid-cols-[160px_1fr_auto] gap-2">
        <Select
          value={op || '__none__'}
          onValueChange={(v) =>
            onChange(v === '__none__' ? undefined : { op: v as 'sum' | 'avg' | 'count' | 'min' | 'max', field })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">(none)</SelectItem>
            <SelectItem value="sum">sum</SelectItem>
            <SelectItem value="avg">avg</SelectItem>
            <SelectItem value="count">count</SelectItem>
            <SelectItem value="min">min</SelectItem>
            <SelectItem value="max">max</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="amount"
          value={field}
          disabled={!op || op === 'count'}
          onChange={(e) =>
            onChange(op ? { op: op as 'sum' | 'avg' | 'count' | 'min' | 'max', field: e.target.value } : undefined)
          }
          className="font-mono"
        />
      </div>
    </div>
  );
}

// --- helpers: serialise/parse simple AND-joined comparisons ---

const SIMPLE_FILTER = /^\s*([\w.]+)\s*(=|!=|<>|<=|>=|<|>|IN|IS\s+NOT\s+NULL|IS\s+NULL)\s*(.*)$/i;

function parseFilter(filter: string): ConditionRow[] {
  if (!filter.trim()) return [];
  // We support a flat AND chain only on the visual side. JSON tab handles
  // arbitrary expressions.
  const parts = splitTopAnd(filter);
  const rows: ConditionRow[] = [];
  for (const part of parts) {
    const m = SIMPLE_FILTER.exec(part.trim());
    if (!m) continue;
    const op = normaliseOp(m[2] ?? '=');
    rows.push({
      field: m[1] ?? '',
      op,
      value: stripQuotes((m[3] ?? '').trim()),
    });
  }
  return rows;
}

function normaliseOp(raw: string): ConditionRow['op'] {
  const up = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (up === 'IS NULL') return 'IS NULL';
  if (up === 'IS NOT NULL') return 'IS NOT NULL';
  if (up === '<>') return '!=';
  if (up === 'IN') return 'IN';
  return up as ConditionRow['op'];
}

function stripQuotes(s: string): string {
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  return s;
}

function splitTopAnd(filter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  const upper = filter.toUpperCase();
  for (let i = 0; i < filter.length; i++) {
    const ch = filter[i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && upper.startsWith(' AND ', i)) {
      parts.push(current);
      current = '';
      i += 4;
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function serialiseFilter(rows: ConditionRow[]): string {
  return rows
    .filter((r) => r.field)
    .map((r) => {
      if (r.op === 'IS NULL' || r.op === 'IS NOT NULL') return `${r.field} ${r.op}`;
      if (r.op === 'IN') return `${r.field} IN (${r.value || ''})`;
      const value = isNumberLike(r.value) || r.value === 'true' || r.value === 'false' || r.value === 'null'
        ? r.value
        : `'${r.value.replace(/'/g, "\\'")}'`;
      return `${r.field} ${r.op} ${value}`;
    })
    .join(' AND ');
}

function isNumberLike(v: string): boolean {
  if (!v) return false;
  return /^-?\d+(\.\d+)?$/.test(v.trim());
}
