import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { rawFetch } from '@/api/client';
import { ProblemError, isProblem } from '@/api/problem';

const IDENT = /^[a-z_][a-z0-9_]*$/i;

export function ProjectSettingsTab() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const [tablesRaw, setTablesRaw] = useState('');
  const [error, setError] = useState<unknown>(null);

  const tables = tablesRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const invalid = tables.filter((t) => !IDENT.test(t));

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
            disabled={save.isPending || tables.length === 0 || invalid.length > 0}
          >
            <Save className="mr-2 h-4 w-4" /> {t('common.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
