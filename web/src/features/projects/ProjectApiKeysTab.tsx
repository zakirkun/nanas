import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { KeyRound, Plus, RotateCw, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/data/EmptyState';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { CopyButton } from '@/components/data/CopyButton';
import { api, rawFetch } from '@/api/client';
import { ProblemError, isProblem } from '@/api/problem';

interface ApiKeyRow {
  ID: string;
  Role: string;
  Name: string;
  QuotaRPM: number | null;
  Revoked: string | null;
  CreatedAt: string;
}

export function ProjectApiKeysTab() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [role, setRole] = useState<'viewer' | 'developer' | 'admin'>('developer');
  const [plainKey, setPlainKey] = useState<{ id: string; key: string } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const list = useQuery({
    queryKey: ['projects', pid, 'keys'],
    enabled: !!pid,
    queryFn: async () => {
      const res = await rawFetch(`/v1/projects/${pid}/keys`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (isProblem(body)) throw new ProblemError(res.status, body);
        throw new Error('Failed');
      }
      return (body as { keys?: ApiKeyRow[] }).keys ?? [];
    },
  });

  const mint = useMutation({
    mutationFn: async () => {
      const res = await rawFetch(`/v1/projects/${pid}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (isProblem(body)) throw new ProblemError(res.status, body);
        throw new Error('Failed');
      }
      return body as { id: string; key: string; role: string };
    },
    onSuccess: (data) => {
      setPlainKey({ id: data.id, key: data.key });
      setName('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['projects', pid, 'keys'] });
    },
    onError: (e) => setError(e),
  });

  const revoke = useMutation({
    mutationFn: async (kid: string) => {
      const res = await rawFetch(`/v1/projects/${pid}/keys/${kid}/revoke`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (isProblem(body)) throw new ProblemError(res.status, body);
        throw new Error('Failed');
      }
      return body;
    },
    onSuccess: () => {
      toast.success(t('common.deleteSucceeded'));
      qc.invalidateQueries({ queryKey: ['projects', pid, 'keys'] });
    },
  });

  const setQuota = useMutation({
    mutationFn: async ({ kid, rpm }: { kid: string; rpm: number | null }) => {
      const { error } = await api.PATCH('/v1/projects/{pid}/keys/{kid}/quota', {
        params: { path: { pid: pid!, kid } },
        body: { rpm } as { rpm: number | null },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('common.saveSucceeded'));
      qc.invalidateQueries({ queryKey: ['projects', pid, 'keys'] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('projects.apiKeys.newKey')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <ProblemAlert error={error} /> : null}
          {plainKey ? (
            <div className="rounded-md border-2 border-amber-500/40 bg-amber-500/10 p-3">
              <p className="mb-2 text-sm font-medium">{t('projects.apiKeys.showOnce')}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs">
                  {plainKey.key}
                </code>
                <CopyButton value={plainKey.key} />
                <Button variant="ghost" size="icon" onClick={() => setPlainKey(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">{t('projects.apiKeys.keyName')}</Label>
              <Input
                id="key-name"
                placeholder={t('projects.apiKeys.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key-role">{t('projects.members.role')}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger id="key-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">viewer</SelectItem>
                  <SelectItem value="developer">developer</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => mint.mutate()} disabled={mint.isPending} className="w-full">
                <Plus className="mr-2 h-4 w-4" /> {t('projects.apiKeys.newKey')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('projects.apiKeys.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : list.error ? (
            <ProblemAlert error={list.error} />
          ) : (list.data ?? []).length === 0 ? (
            <EmptyState
              icon={<KeyRound className="h-6 w-6" />}
              title={t('common.empty')}
              description={t('projects.apiKeys.title')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('projects.members.role')}</TableHead>
                  <TableHead>{t('projects.apiKeys.quotaLabel')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.createdAt')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((row) => (
                  <KeyRow
                    key={row.ID}
                    row={row}
                    onRevoke={() => revoke.mutate(row.ID)}
                    onSetQuota={(rpm) => setQuota.mutate({ kid: row.ID, rpm })}
                    busy={revoke.isPending || setQuota.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KeyRow({
  row,
  onRevoke,
  onSetQuota,
  busy,
}: {
  row: ApiKeyRow;
  onRevoke: () => void;
  onSetQuota: (rpm: number | null) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [quota, setQuota] = useState(row.QuotaRPM != null ? String(row.QuotaRPM) : '');
  const revoked = !!row.Revoked;
  return (
    <TableRow>
      <TableCell className="font-medium">{row.Name || '—'}</TableCell>
      <TableCell>
        <Badge variant="outline">{row.Role}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            value={quota}
            onChange={(e) => setQuota(e.target.value.replace(/\D/g, ''))}
            placeholder="—"
            className="h-8 w-24"
            disabled={revoked}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || revoked}
            onClick={() => onSetQuota(quota === '' ? null : Number(quota))}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
      <TableCell>
        {revoked ? <Badge variant="destructive">revoked</Badge> : <Badge variant="success">active</Badge>}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {row.CreatedAt ? format(new Date(row.CreatedAt), 'yyyy-MM-dd HH:mm') : '—'}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          disabled={revoked || busy}
          onClick={onRevoke}
        >
          {t('projects.apiKeys.revoke')}
        </Button>
      </TableCell>
    </TableRow>
  );
}
