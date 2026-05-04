import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useInvoke, useInvokeAsync } from './queries';

export function InvokeTab() {
  const { t } = useTranslation();
  const { pid, fid } = useParams();
  const [body, setBody] = useState('{\n  "input": {}\n}');
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [asyncMode, setAsyncMode] = useState(false);
  const invoke = useInvoke(pid!, fid!);
  const invokeAsync = useInvokeAsync(pid!, fid!);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('functions.invoke.title')}</CardTitle>
          <CardDescription>
            {asyncMode
              ? 'POST /v1/projects/:pid/functions/:fid/invoke/async'
              : 'POST /v1/projects/:pid/functions/:fid/invoke'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="async-mode" className="cursor-pointer">
              {t('functions.invoke.async', 'Async (queued)')}
            </Label>
            <Switch id="async-mode" checked={asyncMode} onCheckedChange={setAsyncMode} />
          </div>
          {error ? <ProblemAlert error={error} /> : null}
          <CodeEditor value={body} onChange={setBody} language="json" minHeight="220px" />
          <div className="flex justify-end">
            <Button
              disabled={invoke.isPending || invokeAsync.isPending}
              onClick={async () => {
                setError(null);
                try {
                  const parsed = JSON.parse(body);
                  if (asyncMode) {
                    const out = await invokeAsync.mutateAsync({ input: parsed.input ?? {} });
                    setResponse(out);
                  } else {
                    const out = await invoke.mutateAsync({ input: parsed.input ?? {} });
                    setResponse(out);
                  }
                } catch (e) {
                  setError(e);
                }
              }}
            >
              <Play className="mr-2 h-4 w-4" /> {t('functions.invoke.go')}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Response</CardTitle>
        </CardHeader>
        <CardContent>
          {response ? (
            <pre className="max-h-[420px] overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
              {JSON.stringify(response, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">No invocation yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
