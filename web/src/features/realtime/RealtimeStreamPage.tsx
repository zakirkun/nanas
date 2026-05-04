import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Radio, RotateCw, Trash2, Code2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { CopyButton } from '@/components/data/CopyButton';
import { EmptyState } from '@/components/data/EmptyState';
import { useRealtime } from '@/hooks/useRealtime';
import { useQueryRealtime, type QueryMode } from '@/hooks/useQueryRealtime';

const ALL_CHANNELS = ['triggers', 'objects', 'entrypoint', 'cdc'] as const;
type Channel = (typeof ALL_CHANNELS)[number];

export function RealtimeStreamPage() {
  const { t } = useTranslation();
  const { pid } = useParams();

  return (
    <div>
      <PageHeader title={t('realtime.title')} description="GET /v1/projects/:pid/realtime/ws" />
      <Tabs defaultValue="channels">
        <TabsList>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="query">Query</TabsTrigger>
        </TabsList>
        <TabsContent value="channels">
          <ChannelsTab pid={pid!} />
        </TabsContent>
        <TabsContent value="query">
          <QueryTab pid={pid!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChannelsTab({ pid }: { pid: string }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Channel[]>(['triggers', 'objects', 'entrypoint', 'cdc']);
  const rt = useRealtime(pid, { channels: selected });
  return (
    <div className="space-y-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <span>{t('realtime.channels')}</span>
            <div className="flex items-center gap-2">
              <StatusPill status={rt.status} />
              <Button size="sm" variant="outline" onClick={rt.reconnect}>
                <RotateCw className="mr-2 h-3.5 w-3.5" /> reconnect
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={rt.clear}
                disabled={rt.events.length === 0}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> clear
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {ALL_CHANNELS.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(c)}
                  onCheckedChange={(v) => {
                    setSelected((prev) =>
                      v ? Array.from(new Set([...prev, c])) : prev.filter((x) => x !== c),
                    );
                  }}
                />
                <Label className="cursor-pointer">{c}</Label>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('realtime.events')}</CardTitle>
        </CardHeader>
        <CardContent>
          {rt.events.length === 0 ? (
            <EmptyState icon={<Radio className="h-8 w-8" />} title={t('realtime.noEvents')} />
          ) : (
            <ul className="space-y-2">
              {rt.events.map((ev, i) => (
                <li key={i} className="rounded-md border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge variant="info">{ev.channel}</Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {format(new Date(ev.receivedAt), 'HH:mm:ss.SSS')}
                    </span>
                  </div>
                  <pre className="overflow-auto rounded bg-background p-2 font-mono text-xs">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QueryTab({ pid }: { pid: string }) {
  const [draft, setDraft] = useState("SELECT * FROM orders WHERE status = 'open'");
  const [query, setQuery] = useState<string | null>(null);
  const [mode, setMode] = useState<QueryMode>('diff');
  const rt = useQueryRealtime(pid, { query, mode });

  const sdkSnippet = `import { NanasClient } from '@nanas/sdk';\n\nconst client = new NanasClient({ projectId: '${pid}' });\nconst sub = await client.realtime.subscribe({\n  query: ${JSON.stringify(query ?? draft)},\n  mode: '${mode}',\n});\nsub.on('event', (e) => console.log(e));\n`;

  return (
    <div className="space-y-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Code2 className="h-3.5 w-3.5" /> SQL-style subscription
          </CardTitle>
          <CardDescription>
            <code className="font-mono">SELECT * FROM &lt;table&gt; [WHERE …]</code> only. Filters use
            the platform DSL (PRD section 14).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeEditor
            value={draft}
            onChange={setDraft}
            language="sql"
            minHeight="120px"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qmode">mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as QueryMode)}>
                <SelectTrigger id="qmode" className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diff">diff</SelectItem>
                  <SelectItem value="full">full</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => setQuery(draft)}
              disabled={rt.status === 'connecting' || rt.status === 'open'}
            >
              Subscribe
            </Button>
            <Button variant="outline" onClick={() => setQuery(null)} disabled={!query}>
              Unsubscribe
            </Button>
            <StatusPill status={rt.status} />
            {rt.subscriptionID ? (
              <Badge variant="outline" className="font-mono text-xs">
                sub: {rt.subscriptionID.slice(0, 8)}
              </Badge>
            ) : null}
          </div>
          {rt.error ? <p className="text-sm text-destructive">{rt.error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            Events
            <div className="flex items-center gap-2">
              <CopyButton value={sdkSnippet} label="Copy SDK snippet" />
              <Button variant="outline" size="sm" onClick={rt.clear} disabled={rt.events.length === 0}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> clear
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rt.events.length === 0 ? (
            <EmptyState
              icon={<Radio className="h-8 w-8" />}
              title="Subscribe a query to see events here"
              description="Insert/update/delete on the table will stream as `op:event` messages."
            />
          ) : (
            <ul className="space-y-2">
              {rt.events.map((ev, i) => (
                <li key={i} className="rounded-md border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge variant={typeBadge(ev.type)}>{ev.type}</Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                  <pre className="overflow-auto rounded bg-background p-2 font-mono text-xs">
                    {JSON.stringify(ev.rows, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const variant: 'success' | 'destructive' | 'warning' | 'outline' =
    status === 'open'
      ? 'success'
      : status === 'closed' || status === 'error'
        ? 'destructive'
        : status === 'reconnecting'
          ? 'warning'
          : 'outline';
  return (
    <Badge variant={variant}>
      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-current" />
      {status}
    </Badge>
  );
}

function typeBadge(t: string): 'success' | 'info' | 'destructive' | 'outline' {
  if (t === 'insert') return 'success';
  if (t === 'update') return 'info';
  if (t === 'delete') return 'destructive';
  return 'outline';
}
