import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { CopyButton } from '@/components/data/CopyButton';
import { Badge } from '@/components/ui/badge';
import { useEntrypoint, useUpsertEntrypoint, type EntrypointConfig } from './queries';
import { apiOrigin } from '@/api/client';

export function EntrypointTab() {
  const { t } = useTranslation();
  const { pid, fid } = useParams();
  const { data, isLoading, error } = useEntrypoint(pid!, fid!);
  const upsert = useUpsertEntrypoint(pid!, fid!);

  const [authMode, setAuthMode] = useState<EntrypointConfig['auth_mode']>('public');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (data) {
      setAuthMode(data.auth_mode);
      setEnabled(data.enabled);
    }
  }, [data]);

  const onSave = async () => {
    try {
      await upsert.mutateAsync({ auth_mode: authMode, enabled });
      toast.success(t('functions.entrypoint.saved'));
    } catch (_) {
      // toast handled globally
    }
  };

  const fullUrl = data?.public_url
    ? data.public_url.startsWith('http')
      ? data.public_url
      : `${apiOrigin()}${data.public_url}`
    : data?.project_slug && data?.function_slug
      ? `${apiOrigin()}/fn/${data.project_slug}/${data.function_slug}`
      : null;

  const curlSnippet = fullUrl
    ? authMode === 'public'
      ? `curl -X POST '${fullUrl}' -H 'Content-Type: application/json' -d '{}'`
      : authMode === 'signed'
        ? `curl -X POST '${fullUrl}' -H 'X-Entrypoint-Token: ${data?.secret_token ?? '<TOKEN>'}' -H 'Content-Type: application/json' -d '{}'`
        : `curl -X POST '${fullUrl}' -H 'Authorization: Bearer sk_xxx' -H 'Content-Type: application/json' -d '{}'`
    : null;

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('functions.entrypoint.title')}</CardTitle>
          <CardDescription>POST /v1/projects/:pid/functions/:fid/entrypoint</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <ProblemAlert error={error} /> : null}
          <div className="space-y-1.5">
            <Label htmlFor="ep-mode">{t('functions.entrypoint.authMode')}</Label>
            <Select value={authMode} onValueChange={(v) => setAuthMode(v as typeof authMode)}>
              <SelectTrigger id="ep-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">public</SelectItem>
                <SelectItem value="signed">signed</SelectItem>
                <SelectItem value="project_key">project_key</SelectItem>
              </SelectContent>
            </Select>
            {authMode === 'signed' ? (
              <p className="text-xs text-muted-foreground">{t('functions.entrypoint.secretHint')}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ep-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="ep-enabled" className="cursor-pointer">
              {t('functions.entrypoint.enabled')}
            </Label>
          </div>
          <div className="flex justify-end">
            <Button onClick={onSave} disabled={upsert.isPending}>
              <Save className="mr-2 h-4 w-4" /> {t('functions.entrypoint.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('functions.entrypoint.publicUrl')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {fullUrl ? (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <code className="break-all font-mono">{fullUrl}</code>
                  <CopyButton value={fullUrl} />
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">auth_mode: {data.auth_mode}</Badge>
              <Badge variant={data.enabled ? 'success' : 'destructive'}>
                {data.enabled ? 'enabled' : 'disabled'}
              </Badge>
              {data.project_slug ? (
                <Badge variant="info">project: {data.project_slug}</Badge>
              ) : null}
              {data.function_slug ? (
                <Badge variant="info">fn: {data.function_slug}</Badge>
              ) : null}
            </div>
            {data.secret_token ? (
              <div className="rounded-md border bg-amber-500/10 p-3 text-xs">
                <p className="mb-1 font-medium">{t('functions.entrypoint.secretToken')}</p>
                <div className="flex items-center justify-between gap-2">
                  <code className="break-all font-mono">{data.secret_token}</code>
                  <CopyButton value={data.secret_token} />
                </div>
              </div>
            ) : null}
            {curlSnippet ? (
              <div>
                <p className="mb-1 text-xs font-medium">{t('functions.entrypoint.curlSnippet')}</p>
                <div className="rounded-md border bg-muted p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <pre className="whitespace-pre-wrap break-all font-mono">{curlSnippet}</pre>
                    <CopyButton value={curlSnippet} />
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
