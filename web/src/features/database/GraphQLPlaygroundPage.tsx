import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Play, FileCode2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/api/client';

const SAMPLE = `query Health {
  health
}
`;

export function GraphQLPlaygroundPage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const [query, setQuery] = useState(SAMPLE);
  const [variables, setVariables] = useState('{}');
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);

  const schema = useQuery({
    queryKey: ['projects', pid, 'graphql', 'schema'],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error: err } = await api.GET('/v1/projects/{pid}/graphql/schema', {
        params: { path: { pid: pid! } },
      });
      if (err) throw err;
      const sdl = (data as { schema?: string; sdl?: string } | undefined) ?? {};
      return sdl.schema ?? sdl.sdl ?? '';
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      let vars: unknown = {};
      if (variables.trim()) {
        vars = JSON.parse(variables);
      }
      const { data, error: err } = await api.POST('/v1/projects/{pid}/graphql', {
        params: { path: { pid: pid! } },
        body: { query, variables: vars } as { query: string; variables: unknown },
      });
      if (err) throw err;
      return data;
    },
    onSuccess: (data) => {
      setResponse(data);
      setError(null);
    },
    onError: (e) => {
      setResponse(null);
      setError(e);
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('database.graphql')}</CardTitle>
          <CardDescription>POST /v1/projects/:pid/graphql</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <ProblemAlert error={error} /> : null}
          <CodeEditor value={query} onChange={setQuery} language="javascript" minHeight="200px" />
          <CodeEditor
            value={variables}
            onChange={setVariables}
            language="json"
            minHeight="80px"
          />
          <div className="flex justify-end">
            <Button onClick={() => run.mutate()} disabled={run.isPending}>
              <Play className="mr-2 h-4 w-4" /> {t('database.run')}
            </Button>
          </div>
          {response ? (
            <pre className="max-h-[280px] overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
              {JSON.stringify(response, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCode2 className="h-4 w-4" /> SDL
          </CardTitle>
          <CardDescription>Auto-generated from the project's data allowlist.</CardDescription>
        </CardHeader>
        <CardContent>
          {schema.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : schema.error ? (
            <ProblemAlert error={schema.error} />
          ) : (
            <pre className="max-h-[420px] overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
              {schema.data || '# (empty)'}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
