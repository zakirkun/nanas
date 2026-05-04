import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Plus, Webhook, Trash2, Zap, ListTree } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { CodeEditor } from '@/components/editor/CodeEditor';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { EmptyState } from '@/components/data/EmptyState';
import { api, rawFetch } from '@/api/client';
import { ProblemError, isProblem } from '@/api/problem';
import { useLocalCache } from '@/hooks/useLocalCache';
import { addCached, removeCached } from '@/lib/localCache';

type TriggerType = 'http' | 'cron' | 'db_poll' | 'object';

const SAMPLES: Record<TriggerType, string> = {
  http: '{ "secret": "hunter2" }',
  cron: '{ "every_seconds": 60 }',
  db_poll: '{ "poll_seconds": 120 }',
  object: '{ "bucket": "events" }',
};

export function TriggersListPage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const items = useLocalCache('triggers', pid);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TriggerType>('http');
  const [target, setTarget] = useState('');
  const [config, setConfig] = useState(SAMPLES.http);
  const [error, setError] = useState<unknown>(null);

  const create = useMutation({
    mutationFn: async () => {
      let cfg: Record<string, unknown> = {};
      if (config.trim()) cfg = JSON.parse(config);
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
    onSuccess: (r) => {
      if (pid) {
        addCached('triggers', pid, {
          id: r.trigger_id,
          name: type,
          meta: { type, target_fn: target },
        });
      }
      setOpen(false);
      setError(null);
    },
    onError: (e) => setError(e),
  });

  const fire = useMutation({
    mutationFn: async (tid: string) => {
      const res = await rawFetch(`/v1/projects/${pid}/triggers/${tid}/test-fire`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (isProblem(body)) throw new ProblemError(res.status, body);
        throw new Error('Failed');
      }
      return body;
    },
    onSuccess: () => toast.success(t('triggers.fired')),
  });

  return (
    <div>
      <PageHeader
        title={t('triggers.title')}
        description="Local cache of triggers created via this UI."
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

      {items.length === 0 ? (
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('triggers.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('triggers.type')}</TableHead>
                  <TableHead>{t('common.id')}</TableHead>
                  <TableHead>{t('triggers.targetFunction')}</TableHead>
                  <TableHead>{t('common.createdAt')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const meta = it.meta as { type?: string; target_fn?: string } | undefined;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <Badge variant="outline">{meta?.type ?? it.name ?? '?'}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{it.id}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {meta?.target_fn?.slice(0, 8) ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(it.ts), 'yyyy-MM-dd HH:mm')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={fire.isPending}
                            onClick={() => fire.mutate(it.id)}
                          >
                            <Zap className="mr-2 h-3.5 w-3.5" /> {t('triggers.testFire')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => pid && removeCached('triggers', pid, it.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
              <Input
                id="trg-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="font-mono"
                placeholder="00000000-…"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('triggers.configJson')}</Label>
            <CodeEditor value={config} onChange={setConfig} language="json" minHeight="120px" />
          </div>
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
