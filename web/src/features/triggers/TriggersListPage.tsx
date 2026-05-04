import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Plus, Webhook, Zap, ListTree, Filter } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { EmptyState } from '@/components/data/EmptyState';
import { api } from '@/api/client';
import { useFunctionsList } from '@/features/functions/queries';
import { useTriggersList, useToggleTrigger, useTestFireTrigger, type TriggerListItem, triggerKeys } from './queries';
import { PayloadDSLBuilder, type DSLConfig, type DSLDryRunResult } from './PayloadDSLBuilder';

type TriggerType = 'http' | 'cron' | 'db_poll' | 'object';
type TypeFilter = 'all' | TriggerType;

const SAMPLES: Record<TriggerType, string> = {
  http: '{ "secret": "hunter2" }',
  cron: '{ "every_seconds": 60 }',
  db_poll: '{ "poll_seconds": 120 }',
  object: '{ "bucket": "events" }',
};

export function TriggersListPage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TriggerType>('http');
  const [target, setTarget] = useState('');
  const [config, setConfig] = useState(SAMPLES.http);
  const [transform, setTransform] = useState<DSLConfig>({});
  const [error, setError] = useState<unknown>(null);
  const [filterType, setFilterType] = useState<TypeFilter>('all');
  const [filterFn, setFilterFn] = useState<string>('all');

  const list = useTriggersList(pid);
  const fns = useFunctionsList(pid, 1, 200, 'all');
  const toggle = useToggleTrigger(pid!);
  const fire = useTestFireTrigger(pid!);

  const filtered = useMemo(() => {
    const items = list.data ?? [];
    return items.filter((it) => {
      if (filterType !== 'all' && it.type !== filterType) return false;
      if (filterFn !== 'all' && it.target_fn !== filterFn) return false;
      return true;
    });
  }, [list.data, filterType, filterFn]);

  const create = useMutation({
    mutationFn: async () => {
      let cfg: Record<string, unknown> = {};
      if (config.trim()) cfg = JSON.parse(config);
      // Merge the visual DSL into config.payload_transform so the backend
      // applies it during dispatch (Phase 6 dispatchTriggerWithDSL).
      const hasTransform = transform && (transform.map || transform.filter || transform.reduce);
      if (hasTransform) {
        cfg = { ...cfg, payload_transform: transform };
      }
      const { data, error: err } = await api.POST('/v1/projects/{pid}/triggers', {
        params: { path: { pid: pid! } },
        body: { type, target_fn: target, config: cfg } as {
          type: TriggerType;
          target_fn: string;
          config: Record<string, unknown>;
        },
      });
      if (err) throw err;
      return data as { trigger_id: string; status: string };
    },
    onSuccess: () => {
      setOpen(false);
      setTarget('');
      setTransform({});
      setError(null);
      qc.invalidateQueries({ queryKey: triggerKeys.all(pid!) });
    },
    onError: (e) => setError(e),
  });

  // We can only dry-run after a trigger exists (it needs a tid), but the new
  // dialog can preview using a transient trigger by leaning on a placeholder
  // trigger id when one's been created — so for the create flow we evaluate
  // locally via the same backend endpoint targeting an existing trigger if the
  // user picks one. For the simpler create flow we omit the dry-run preview.
  const noopDryRun: ((sample: unknown, override: DSLConfig) => Promise<DSLDryRunResult>) | undefined =
    undefined;
  void noopDryRun;

  return (
    <div>
      <PageHeader
        title={t('triggers.title')}
        description="GET /v1/projects/:pid/triggers"
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to={`/app/projects/${pid}/triggers/dlq`}>
                <ListTree className="mr-2 h-4 w-4" /> {t('triggers.dlq')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/app/projects/${pid}/triggers/cdc`}>
                <Webhook className="mr-2 h-4 w-4" /> {t('triggers.cdc.title')}
              </Link>
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> {t('triggers.newTrigger')}
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 md:grid-cols-[180px_280px_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="trg-filter-type">
              <span className="flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> {t('triggers.type')}
              </span>
            </Label>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as TypeFilter)}>
              <SelectTrigger id="trg-filter-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all</SelectItem>
                <SelectItem value="http">http</SelectItem>
                <SelectItem value="cron">cron</SelectItem>
                <SelectItem value="db_poll">db_poll</SelectItem>
                <SelectItem value="object">object</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trg-filter-fn">{t('triggers.targetFunction')}</Label>
            <Select value={filterFn} onValueChange={setFilterFn}>
              <SelectTrigger id="trg-filter-fn">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all</SelectItem>
                {(fns.data ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {list.error ? <ProblemAlert error={list.error} /> : null}

      <Card>
        <CardContent className="pt-6">
          {list.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Webhook className="h-8 w-8" />}
              title={t('common.empty')}
              description={t('triggers.title')}
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> {t('triggers.newTrigger')}
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('triggers.type')}</TableHead>
                  <TableHead>{t('triggers.targetFunction')}</TableHead>
                  <TableHead>enabled</TableHead>
                  <TableHead>dispatch</TableHead>
                  <TableHead>last fired</TableHead>
                  <TableHead>DLQ</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((it) => (
                  <TriggerRow
                    key={it.id}
                    item={it}
                    onToggle={(v) => toggle.mutate({ tid: it.id, enabled: v })}
                    onFire={() => {
                      fire
                        .mutateAsync(it.id)
                        .then(() => toast.success(t('triggers.fired')))
                        .catch(() => undefined);
                    }}
                    busy={toggle.isPending || fire.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('triggers.newTrigger')}</DialogTitle>
            <DialogDescription>POST /v1/projects/:pid/triggers</DialogDescription>
          </DialogHeader>
          {error ? <ProblemAlert error={error} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="trg-type">{t('triggers.type')}</Label>
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v as TriggerType);
                  setConfig(SAMPLES[v as TriggerType]);
                }}
              >
                <SelectTrigger id="trg-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">http</SelectItem>
                  <SelectItem value="cron">cron</SelectItem>
                  <SelectItem value="db_poll">db_poll</SelectItem>
                  <SelectItem value="object">object</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trg-target">{t('triggers.targetFunction')}</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id="trg-target">
                  <SelectValue placeholder="Pick a function" />
                </SelectTrigger>
                <SelectContent>
                  {(fns.data ?? []).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Tabs defaultValue="config">
            <TabsList>
              <TabsTrigger value="config">{t('triggers.configJson')}</TabsTrigger>
              <TabsTrigger value="transform">payload_transform (DSL)</TabsTrigger>
            </TabsList>
            <TabsContent value="config">
              <CodeEditor
                value={config}
                onChange={setConfig}
                language="json"
                minHeight="120px"
              />
            </TabsContent>
            <TabsContent value="transform">
              <PayloadDSLBuilder value={transform} onChange={setTransform} />
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !target.trim()}
            >
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TriggerRow({
  item,
  onToggle,
  onFire,
  busy,
}: {
  item: TriggerListItem;
  onToggle: (v: boolean) => void;
  onFire: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const fnName = item.target_fn_name ?? item.target_fn.slice(0, 8);
  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline">{item.type}</Badge>
      </TableCell>
      <TableCell>
        <span className="font-mono text-xs">{fnName}</span>
      </TableCell>
      <TableCell>
        <Switch checked={item.enabled} onCheckedChange={onToggle} disabled={busy} />
      </TableCell>
      <TableCell className="font-mono text-xs">{item.dispatch_count}</TableCell>
      <TableCell className="font-mono text-xs">
        {item.last_fired_at ? format(new Date(item.last_fired_at), 'yyyy-MM-dd HH:mm') : '—'}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {item.dlq_count > 0 ? (
          <Badge variant="destructive">{item.dlq_count}</Badge>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" disabled={busy} onClick={onFire}>
          <Zap className="mr-2 h-3.5 w-3.5" /> {t('triggers.testFire')}
        </Button>
      </TableCell>
    </TableRow>
  );
}
