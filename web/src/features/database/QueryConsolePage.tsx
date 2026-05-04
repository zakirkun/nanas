import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { ResultGrid } from './ResultGrid';
import { api } from '@/api/client';

interface QueryResult {
  rows?: Array<Record<string, unknown>> | null;
  result?: string;
  explain?: unknown;
}

export function QueryConsolePage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const [sql, setSql] = useState('SELECT 1 AS hello;');
  const [paramsText, setParamsText] = useState('[]');
  const [explain, setExplain] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  const run = useMutation({
    mutationFn: async () => {
      let parsed: unknown[];
      try {
        const v = JSON.parse(paramsText || '[]');
        if (!Array.isArray(v)) throw new Error('params must be a JSON array');
        parsed = v;
      } catch (e) {
        throw e;
      }
      const { data, error: err } = await api.POST('/v1/projects/{pid}/db/query', {
        params: { path: { pid: pid! } },
        body: { sql, params: parsed, explain },
      });
      if (err) throw err;
      return data as QueryResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (e) => {
      setResult(null);
      setError(e);
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('database.query')}</CardTitle>
          <CardDescription>{t('database.queryHelper')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <ProblemAlert error={error} /> : null}
          <CodeEditor value={sql} onChange={setSql} language="sql" minHeight="180px" />
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="params">{t('database.params')}</Label>
              <CodeEditor
                value={paramsText}
                onChange={setParamsText}
                language="json"
                minHeight="60px"
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="explain" checked={explain} onCheckedChange={setExplain} />
              <Label htmlFor="explain" className="cursor-pointer">
                {t('database.explain')}
              </Label>
            </div>
            <Button onClick={() => run.mutate()} disabled={run.isPending || !sql.trim()}>
              <Play className="mr-2 h-4 w-4" /> {t('database.run')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Result</CardTitle>
          </CardHeader>
          <CardContent>
            {result.explain !== undefined ? (
              <pre className="max-h-[420px] overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                {JSON.stringify(result.explain, null, 2)}
              </pre>
            ) : result.rows ? (
              <ResultGrid rows={result.rows ?? []} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {result.result ?? t('database.noRows')}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
