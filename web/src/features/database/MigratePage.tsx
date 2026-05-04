import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Database } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { api } from '@/api/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

const SAMPLE = `-- Allow-listed: CREATE TABLE, CREATE INDEX, selected CREATE EXTENSION, COMMENT ON.
CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_created_at_idx ON notes (created_at DESC);
`;

interface MigrationRow {
  id: number;
  sql: string;
  status: string;
  error_message?: string | null;
  applied_at: string;
}

export function MigratePage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const qc = useQueryClient();
  const [sql, setSql] = useState(SAMPLE);
  const [error, setError] = useState<unknown>(null);

  const history = useQuery({
    queryKey: ['migrations', pid],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error: err } = await api.GET('/v1/projects/{pid}/migrations', {
        params: { path: { pid: pid! }, query: { limit: 50 } },
      });
      if (err) throw err;
      return ((data as { migrations?: MigrationRow[] })?.migrations ?? []) as MigrationRow[];
    },
  });

  const migrate = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await api.POST('/v1/projects/{pid}/db/migrate', {
        params: { path: { pid: pid! } },
        body: { sql },
      });
      if (err) throw err;
      return data;
    },
    onSuccess: () => {
      toast.success(t('database.applied'));
      setError(null);
      qc.invalidateQueries({ queryKey: ['migrations', pid] });
    },
    onError: (e) => setError(e),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> {t('database.migrate')}
          </CardTitle>
          <CardDescription>{t('database.ddlHelper')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <ProblemAlert error={error} /> : null}
          <CodeEditor value={sql} onChange={setSql} language="sql" minHeight="260px" />
          <Alert>
            <AlertTitle>Reminder</AlertTitle>
            <AlertDescription>
              DDL is parsed and rejected if it falls outside the allowlist. Use the Query tab for DML.
            </AlertDescription>
          </Alert>
          <div className="flex justify-end">
            <Button onClick={() => migrate.mutate()} disabled={migrate.isPending || !sql.trim()}>
              <Play className="mr-2 h-4 w-4" /> {t('database.run')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('database.migrationHistory', 'Migration history')}</CardTitle>
          <CardDescription>GET /v1/projects/:pid/migrations</CardDescription>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : history.error ? (
            <ProblemAlert error={history.error} />
          ) : (history.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('common.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applied</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SQL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {row.applied_at ? format(new Date(row.applied_at), 'yyyy-MM-dd HH:mm') : '—'}
                    </TableCell>
                    <TableCell className="text-xs">{row.status}</TableCell>
                    <TableCell className="max-w-md truncate font-mono text-xs" title={row.sql}>
                      {row.sql}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
