import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { api } from '@/api/client';

export function IntegrationsPage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [defaultFrom, setDefaultFrom] = useState('');
  const [err, setErr] = useState<unknown>(null);

  const list = useQuery({
    queryKey: ['integrations', pid],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/integrations', { params: { path: { pid: pid! } } });
      if (error) throw error;
      return (data as { integrations?: unknown[] })?.integrations ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/v1/projects/{pid}/integrations/email', {
        params: { path: { pid: pid! } },
        body: { api_key: apiKey, default_from: defaultFrom || undefined },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setErr(null);
      setApiKey('');
      qc.invalidateQueries({ queryKey: ['integrations', pid] });
    },
    onError: (e) => setErr(e),
  });

  return (
    <div>
      <PageHeader title={t('integrations.title', 'Integrations')} description={t('integrations.subtitle', 'Email and more.')} />
      {list.error ? <ProblemAlert error={list.error} /> : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" /> SendGrid
          </CardTitle>
          <CardDescription>
            {t('integrations.sendgridHelp', 'API key is encrypted at rest when TENANT_SECRET_ENCRYPTION_KEY is set on the API.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {err ? <ProblemAlert error={err} /> : null}
          <div className="space-y-1.5">
            <Label htmlFor="sg-key">API key</Label>
            <Input
              id="sg-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="SG...."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sg-from">Default from</Label>
            <Input
              id="sg-from"
              value={defaultFrom}
              onChange={(e) => setDefaultFrom(e.target.value)}
              placeholder="hello@example.com"
            />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !apiKey.trim()}>
            {t('common.save')}
          </Button>
          {list.data && Array.isArray(list.data) && list.data.length > 0 ? (
            <p className="text-xs text-muted-foreground">{t('integrations.configured', 'Adapter row present in project_integrations.')}</p>
          ) : null}
          <TestEmail pid={pid!} defaultFrom={defaultFrom} />
        </CardContent>
      </Card>
    </div>
  );
}

function TestEmail({ pid, defaultFrom }: { pid: string; defaultFrom: string }) {
  const { t } = useTranslation();
  const [to, setTo] = useState('');
  const [subj, setSubj] = useState('Nanas test');
  const [html, setHtml] = useState('<p>Hello from Nanas</p>');
  const [err, setErr] = useState<unknown>(null);
  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/v1/projects/{pid}/integrations/email/send', {
        params: { path: { pid } },
        body: { to, subject: subj, html, from: defaultFrom || undefined },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => setErr(null),
    onError: (e) => setErr(e),
  });
  return (
    <div className="mt-6 rounded-md border p-4 space-y-2">
      <p className="text-sm font-medium">{t('integrations.testSend', 'Test send')}</p>
      {err ? <ProblemAlert error={err} /> : null}
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label>To</Label>
          <Input value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label>Subject</Label>
          <Input value={subj} onChange={(e) => setSubj(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>HTML</Label>
        <Textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={3} />
      </div>
      <Button type="button" variant="secondary" disabled={send.isPending || !to} onClick={() => send.mutate()}>
        Send
      </Button>
    </div>
  );
}
