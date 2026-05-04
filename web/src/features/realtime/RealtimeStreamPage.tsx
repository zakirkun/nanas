import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Radio, RotateCw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/EmptyState';
import { useRealtime } from '@/hooks/useRealtime';

const ALL = ['triggers', 'objects', 'entrypoint'] as const;
type Channel = (typeof ALL)[number];

export function RealtimeStreamPage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const [selected, setSelected] = useState<Channel[]>(['triggers', 'objects', 'entrypoint']);

  const rt = useRealtime(pid, { channels: selected, enabled: !!pid });

  return (
    <div>
      <PageHeader
        title={t('realtime.title')}
        description="GET /v1/projects/:pid/realtime/ws"
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={rt.status} />
            <Button variant="outline" size="sm" onClick={rt.reconnect}>
              <RotateCw className="mr-2 h-3.5 w-3.5" /> reconnect
            </Button>
            <Button variant="outline" size="sm" onClick={rt.clear} disabled={rt.events.length === 0}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> clear
            </Button>
          </div>
        }
      />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm">{t('realtime.channels')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {ALL.map((c) => (
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

function StatusPill({ status }: { status: string }) {
  const variant: 'success' | 'destructive' | 'warning' | 'outline' =
    status === 'open' ? 'success' : status === 'closed' ? 'destructive' : status === 'reconnecting' ? 'warning' : 'outline';
  return (
    <Badge variant={variant}>
      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-current" />
      {status}
    </Badge>
  );
}
