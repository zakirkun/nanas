import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CopyButton } from '@/components/data/CopyButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useProject } from './queries';
import { useRealtime } from '@/hooks/useRealtime';
import { apiOrigin, rawFetch } from '@/api/client';
import { isProblem, ProblemError } from '@/api/problem';

interface ApiKeyRow {
  ID: string;
  Role: string;
  Name: string;
  CreatedAt: string;
  Revoked: string | null;
}

export function ProjectOverviewTab() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const { data, isLoading } = useProject(pid);

  const keys = useQuery({
    queryKey: ['projects', pid, 'keys'],
    enabled: !!pid,
    queryFn: async () => {
      const res = await rawFetch(`/v1/projects/${pid}/keys`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (isProblem(body)) throw new ProblemError(res.status, body);
        throw new Error('keys');
      }
      return (body as { keys?: ApiKeyRow[] })?.keys ?? [];
    },
  });

  const rt = useRealtime(pid, {
    channels: ['triggers', 'objects', 'entrypoint'],
    enabled: !!pid,
  });

  if (isLoading || !data) {
    return <Skeleton className="h-40 w-full" />;
  }

  const origin = apiOrigin() || (typeof window !== 'undefined' ? window.location.origin : '');
  const sampleKey = 'YOUR_PROJECT_API_KEY';
  const curlHealth = `curl -sS "${origin}/healthz"`;
  const curlQuery = `curl -sS -X POST "${origin}/v1/projects/${data.id}/db/query" \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"sql":"SELECT 1","params":[]}'`;

  const jsSnippet = `import { fetch } from "undici";
const base = "${origin}";
const key = "${sampleKey}";
const r = await fetch(base + "/v1/projects/${data.id}/db/query", {
  method: "POST",
  headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
  body: JSON.stringify({ sql: "SELECT 1", params: [] }),
});
console.log(await r.json());`;

  const flutterSnippet = `// Add package:http — outline only
final uri = Uri.parse("${origin}/v1/projects/${data.id}/db/query");
final key = "${sampleKey}";
// http.post(uri, headers: {...}, body: jsonEncode({...}));`;

  const fields: Array<[string, ReactNode]> = [
    [t('common.id'), <span className="font-mono">{data.id}</span>],
    [t('projects.tenantDb'), <span className="font-mono">{data.tenant_db_name ?? '—'}</span>],
    [t('projects.minioBucket'), <span className="font-mono">{data.minio_bucket ?? '—'}</span>],
    [t('projects.regionLabel'), <span className="font-mono">{data.region}</span>],
    [t('projects.owner'), <span className="font-mono">{data.owner_id}</span>],
    [
      t('common.createdAt'),
      <span className="font-mono">{data.created_at ? format(new Date(data.created_at), 'PPpp') : '—'}</span>,
    ],
  ];

  const activeKeys = (keys.data ?? []).filter((k) => !k.Revoked).slice(0, 3);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('projects.tabs.overview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-[140px_1fr]">
            {fields.map(([label, value]) => (
              <FieldRow key={label as string} label={label as string} value={value} />
            ))}
          </dl>
          {data.provision_error ? <p className="mt-3 text-sm text-destructive">{data.provision_error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('overview.quickStart', 'Quick start')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="mb-1 text-muted-foreground">curl · health</p>
            <div className="flex justify-end gap-2">
              <code className="block flex-1 overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">{curlHealth}</code>
              <CopyButton value={curlHealth} />
            </div>
          </div>
          <div>
            <p className="mb-1 text-muted-foreground">curl · SQL query</p>
            <div className="flex justify-end gap-2">
              <code className="block max-h-40 flex-1 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
                {curlQuery}
              </code>
              <CopyButton value={curlQuery.replace(/\\\n\s+/g, ' ')} />
            </div>
          </div>
          <div>
            <p className="mb-1 text-muted-foreground">Node / TS</p>
            <div className="flex justify-end gap-2">
              <code className="block max-h-40 flex-1 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
                {jsSnippet}
              </code>
              <CopyButton value={jsSnippet} />
            </div>
          </div>
          <div>
            <p className="mb-1 text-muted-foreground">Flutter (outline)</p>
            <div className="flex justify-end gap-2">
              <code className="block max-h-32 flex-1 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
                {flutterSnippet}
              </code>
              <CopyButton value={flutterSnippet} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('overview.replaceKey', 'Substitute a real API key from the Keys tab.')}</p>
        </CardContent>
      </Card>

      {data.slug ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Public function URL</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Configure a function entrypoint to receive public traffic. The base URL pattern is:
            </p>
            <code className="mt-3 block rounded-md bg-muted p-3 font-mono text-xs">
              {`POST /fn/${data.slug}/{function_slug}`}
            </code>
            <div className="mt-2 flex justify-end">
              <CopyButton value={`/fn/${data.slug}/`} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">{t('overview.recentEvents', 'Recent realtime events')}</CardTitle>
          <Badge variant="outline">{rt.status}</Badge>
        </CardHeader>
        <CardContent>
          <ul className="max-h-56 space-y-2 overflow-auto text-xs">
            {rt.events.slice(0, 10).map((ev, i) => (
              <li key={i} className="rounded border border-border/80 p-2 font-mono">
                <span className="text-muted-foreground">{ev.channel}</span>{' '}
                {format(new Date(ev.receivedAt), 'HH:mm:ss')}
                <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap">{JSON.stringify(ev.payload)}</pre>
              </li>
            ))}
            {rt.events.length === 0 ? <li className="text-muted-foreground">{t('common.empty')}</li> : null}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t('projects.tabs.apiKeys')}</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link to={`/app/projects/${pid}/keys`}>{t('overview.manageKeys', 'Manage all')}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {keys.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : activeKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('overview.noKeys', 'No active keys yet.')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activeKeys.map((k) => (
                <li key={k.ID} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                  <div>
                    <span className="font-medium">{k.Name || k.ID.slice(0, 8)}</span>
                    <Badge variant="outline" className="ml-2">
                      {k.Role}
                    </Badge>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">{k.ID}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </>
  );
}
