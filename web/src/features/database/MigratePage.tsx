import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Play, Database } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { api } from '@/api/client';

const SAMPLE = `-- Allow-listed: CREATE TABLE, CREATE INDEX, selected CREATE EXTENSION, COMMENT ON.
CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_created_at_idx ON notes (created_at DESC);
`;

export function MigratePage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const [sql, setSql] = useState(SAMPLE);
  const [error, setError] = useState<unknown>(null);

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
    },
    onError: (e) => setError(e),
  });

  return (
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
            DDL is parsed and rejected if it falls outside the allowlist. Use the Query tab for
            DML.
          </AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <Button onClick={() => migrate.mutate()} disabled={migrate.isPending || !sql.trim()}>
            <Play className="mr-2 h-4 w-4" /> {t('database.run')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
