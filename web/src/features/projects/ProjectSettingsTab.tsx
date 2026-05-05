import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, Crown, Users, History } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { rawFetch, api } from '@/api/client';
import { ProblemError, isProblem } from '@/api/problem';

const IDENT = /^[a-z_][a-z0-9_]*$/i;

interface PermissionRow {
  id: string;
  subject_id: string;
  email?: string | null;
  role: string;
  resource?: string | null;
  created_at: string;
}

export function ProjectSettingsTab() {
  const { t } = useTranslation();
  const { pid } = useParams();

  return (
    <div className="space-y-4">
      <DataAllowlistCard pid={pid!} />
      <RetentionCard pid={pid!} />
      <AuditMiniCard pid={pid!} />
      <RolesMatrixCard pid={pid!} />
      <p className="text-xs text-muted-foreground">
        {t('common.tagline')} — {t('common.appName')}
      </p>
    </div>
  );
}

function DataAllowlistCard({ pid }: { pid: string }) {
  const { t } = useTranslation();
  const [tablesRaw, setTablesRaw] = useState('');
  const [error, setError] = useState<unknown>(null);

  const tables = tablesRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const invalid = tables.filter((tbl) => !IDENT.test(tbl));

  const save = useMutation({
    mutationFn: async () => {
      const res = await rawFetch(`/v1/projects/${pid}/settings/data-allowlist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (isProblem(body)) throw new ProblemError(res.status, body);
        throw new Error('Failed');
      }
      return body;
    },
    onSuccess: () => {
      toast.success(t('common.saveSucceeded'));
      setError(null);
    },
    onError: (e) => setError(e),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('projects.settings.dataAllowlist')}</CardTitle>
        <CardDescription>{t('projects.settings.dataAllowlistHelper')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <ProblemAlert error={error} /> : null}
        <div className="space-y-1.5">
          <Label htmlFor="allowlist">Tables</Label>
          <Textarea
            id="allowlist"
            placeholder="orders, customers, audit_log"
            value={tablesRaw}
            onChange={(e) => setTablesRaw(e.target.value)}
            className="min-h-[120px] font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">{t('projects.settings.tableNameHint')}</p>
          {invalid.length > 0 ? (
            <p className="text-xs text-destructive">
              Invalid identifiers: <code className="font-mono">{invalid.join(', ')}</code>
            </p>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || invalid.length > 0}
          >
            <Save className="mr-2 h-4 w-4" /> {t('common.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RetentionCard({ pid }: { pid: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['projects', pid, 'retention'],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/settings/retention', {
        params: { path: { pid } },
      });
      if (error) throw error;
      return data as { logs_days: number; traces_days: number };
    },
  });
  const [logs, setLogs] = useState(30);
  const [traces, setTraces] = useState(7);

  useEffect(() => {
    if (settings.data) {
      setLogs(settings.data.logs_days);
      setTraces(settings.data.traces_days);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PATCH('/v1/projects/{pid}/settings/retention', {
        params: { path: { pid } },
        body: { logs_days: logs, traces_days: traces },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(t('common.saveSucceeded'));
      qc.invalidateQueries({ queryKey: ['projects', pid, 'retention'] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Retention</CardTitle>
        <CardDescription>How long logs and traces are kept (PRD section 12).</CardDescription>
      </CardHeader>
      <CardContent>
        {settings.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : settings.error ? (
          <ProblemAlert error={settings.error} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ret-logs">logs_days ({logs})</Label>
              <Input
                id="ret-logs"
                type="range"
                min={1}
                max={90}
                value={logs}
                onChange={(e) => setLogs(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ret-trace">traces_days ({traces})</Label>
              <Input
                id="ret-trace"
                type="range"
                min={1}
                max={90}
                value={traces}
                onChange={(e) => setTraces(Number(e.target.value))}
              />
            </div>
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-2 h-4 w-4" /> {t('common.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditMiniCard({ pid }: { pid: string }) {
  const { t } = useTranslation();
  const audit = useQuery({
    queryKey: ['projects', pid, 'audit', 'mini'],
    queryFn: async () => {
      const res = await rawFetch(`/v1/projects/${pid}/audit?limit=5`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error('audit');
      return body as { events?: { action: string; resource?: string; created_at: string }[] };
    },
    retry: false,
  });

  if (!audit.isSuccess) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> {t('settings.auditRecent', 'Recent audit')}
        </CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link to={`/app/projects/${pid}/audit`}>{t('settings.auditViewAll', 'View all')}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {(audit.data?.events ?? []).map((ev, i) => {
            const e = ev as Record<string, string>;
            const action = e.action ?? e.Action ?? '—';
            const created = e.created_at ?? e.CreatedAt ?? '';
            return (
              <li key={i} className="flex justify-between gap-2 border-b border-border/60 py-1 last:border-0">
                <span className="font-mono text-xs">{action}</span>
                <span className="text-xs text-muted-foreground">
                  {created ? new Date(created).toISOString().slice(0, 19) : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function RolesMatrixCard({ pid }: { pid: string }) {
  const list = useQuery({
    queryKey: ['projects', pid, 'permissions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/permissions', {
        params: { path: { pid } },
      });
      if (error) throw error;
      return data as { permissions: PermissionRow[]; owner_id: string };
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> Roles matrix
        </CardTitle>
        <CardDescription>Read-only view of every project subject and role.</CardDescription>
      </CardHeader>
      <CardContent>
        {list.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : list.error ? (
          <ProblemAlert error={list.error} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>subject</TableHead>
                <TableHead>role</TableHead>
                <TableHead>resource</TableHead>
                <TableHead>since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.permissions?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{p.email ?? p.subject_id.slice(0, 8)}</span>
                      {list.data.owner_id === p.subject_id ? (
                        <Badge variant="default" className="gap-1">
                          <Crown className="h-3 w-3" /> owner
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={roleBadge(p.role)}>{p.role}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.resource ?? 'project'}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {new Date(p.created_at).toISOString().slice(0, 10)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function roleBadge(role: string): 'default' | 'success' | 'info' | 'outline' {
  if (role === 'admin') return 'default';
  if (role === 'developer') return 'success';
  if (role === 'viewer') return 'info';
  return 'outline';
}
