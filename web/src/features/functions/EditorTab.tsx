import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { File, FileCode, Plus, Save, Send, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { cn } from '@/lib/utils';
import { api } from '@/api/client';
import { functionKeys, useRegisterVersion } from './queries';

type Runtime = 'node' | 'go' | 'python' | 'wasm';

interface SourceFile {
  path: string;
  content: string;
}

interface DraftPayload {
  fn_id: string;
  files: SourceFile[];
  env: Record<string, string>;
  runtime: Runtime;
  updated_at?: string;
}

const STARTERS: Record<Runtime, SourceFile[]> = {
  node: [
    {
      path: 'index.js',
      content:
        "// Default export receives { input, env, ctx } and returns the response body.\nexport default async function handler({ input, env, ctx }) {\n  return { ok: true, echo: input };\n}\n",
    },
  ],
  go: [
    {
      path: 'main.go',
      content:
        "package main\n\nimport (\n\t\"context\"\n)\n\n// Handler is the function entrypoint. The runtime injects context, input bytes,\n// env vars, and tenant DB / object-store configuration.\nfunc Handler(ctx context.Context, input []byte) ([]byte, error) {\n\treturn []byte(`{\"ok\":true}`), nil\n}\n",
    },
  ],
  python: [
    {
      path: 'main.py',
      content:
        "def handler(input, env, ctx):\n    return {\"ok\": True, \"echo\": input}\n",
    },
  ],
  wasm: [
    {
      path: 'README.md',
      content: '# WASM\n\nProvide a pre-compiled `.wasm` artifact via the artifact upload tab.\n',
    },
  ],
};

function languageFor(path: string): 'javascript' | 'json' | 'plain' {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.js') || path.endsWith('.ts') || path.endsWith('.go') || path.endsWith('.py'))
    return 'javascript';
  return 'plain';
}

export function EditorTab() {
  const { t } = useTranslation();
  const { pid, fid } = useParams();
  const qc = useQueryClient();

  const draft = useQuery({
    queryKey: ['function', pid, fid, 'draft'],
    enabled: !!pid && !!fid,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/functions/{fid}/draft', {
        params: { path: { pid: pid!, fid: fid! } },
      });
      if (error) throw error;
      return (data as DraftPayload) ?? { fn_id: fid!, files: [], env: {}, runtime: 'node' };
    },
  });

  const [files, setFiles] = useState<SourceFile[]>([]);
  const [activePath, setActivePath] = useState<string>('');
  const [runtime, setRuntime] = useState<Runtime>('node');
  const [envText, setEnvText] = useState<string>('{}');
  const [version, setVersion] = useState('0.1.0');
  const [error, setError] = useState<unknown>(null);

  // Hydrate state once when draft arrives.
  useEffect(() => {
    if (!draft.data) return;
    const initialFiles = draft.data.files.length > 0 ? draft.data.files : STARTERS.node;
    setFiles(initialFiles);
    setActivePath(initialFiles[0]?.path ?? '');
    setRuntime(((draft.data.runtime as Runtime) ?? 'node') as Runtime);
    setEnvText(JSON.stringify(draft.data.env ?? {}, null, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.data?.fn_id]);

  const activeIndex = useMemo(() => files.findIndex((f) => f.path === activePath), [files, activePath]);

  const updateActiveContent = (content: string) => {
    if (activeIndex < 0) return;
    setFiles((prev) => prev.map((f, i) => (i === activeIndex ? { ...f, content } : f)));
  };

  const addFile = () => {
    const name = window.prompt('New file path (e.g. helpers/util.js)');
    if (!name) return;
    if (files.some((f) => f.path === name)) {
      toast.error('A file with this path already exists.');
      return;
    }
    setFiles((prev) => [...prev, { path: name, content: '' }]);
    setActivePath(name);
  };

  const removeFile = (path: string) => {
    if (files.length <= 1) {
      toast.error('Keep at least one file.');
      return;
    }
    const next = files.filter((f) => f.path !== path);
    setFiles(next);
    if (activePath === path) setActivePath(next[0]?.path ?? '');
  };

  const swapRuntime = (next: Runtime) => {
    setRuntime(next);
    if (files.length === 0) {
      setFiles(STARTERS[next]);
      setActivePath(STARTERS[next][0]?.path ?? '');
    }
  };

  const parseEnv = (): Record<string, string> | null => {
    try {
      const v = JSON.parse(envText || '{}') as unknown;
      if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('object expected');
      return v as Record<string, string>;
    } catch (e) {
      setError(e);
      return null;
    }
  };

  const saveDraft = useMutation({
    mutationFn: async () => {
      const env = parseEnv();
      if (env == null) throw new Error('invalid env');
      const { data, error: err } = await api.POST('/v1/projects/{pid}/functions/{fid}/draft', {
        params: { path: { pid: pid!, fid: fid! } },
        body: { files, env, runtime } as { files: SourceFile[]; env: Record<string, string>; runtime: Runtime },
      });
      if (err) throw err;
      return data;
    },
    onSuccess: () => {
      toast.success(t('common.saveSucceeded'));
      setError(null);
      qc.invalidateQueries({ queryKey: ['function', pid, fid, 'draft'] });
    },
    onError: (e) => setError(e),
  });

  const uploadSource = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await api.POST('/v1/projects/{pid}/functions/{fid}/source', {
        params: { path: { pid: pid!, fid: fid! } },
        body: { version, files } as { version: string; files: SourceFile[] },
      });
      if (err) throw err;
      return data as { artifact_key: string; checksum: string; size: number };
    },
  });

  const register = useRegisterVersion(pid!, fid!);

  const publish = useMutation({
    mutationFn: async () => {
      const env = parseEnv();
      if (env == null) throw new Error('invalid env');
      const src = await uploadSource.mutateAsync();
      const meta = { ...env };
      void meta;
      await register.mutateAsync({
        version,
        runtime,
        checksum: src.checksum,
        artifact_key: src.artifact_key,
      });
    },
    onSuccess: () => {
      toast.success(t('functions.versions.registered'));
      setError(null);
      qc.invalidateQueries({ queryKey: functionKeys.versions(pid!, fid!) });
    },
    onError: (e) => setError(e),
  });

  if (draft.isLoading) return <Skeleton className="h-96 w-full" />;
  if (draft.error) return <ProblemAlert error={draft.error} />;

  const active = files[activeIndex];

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr_280px]">
      {/* Left: files */}
      <Card className="self-start">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1">
              <FileCode className="h-3.5 w-3.5" /> Files
            </span>
            <Button size="sm" variant="ghost" onClick={addFile}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-2 pb-2">
          {files.map((f) => (
            <div
              key={f.path}
              className={cn(
                'group flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted',
                activePath === f.path && 'bg-muted',
              )}
              onClick={() => setActivePath(f.path)}
            >
              <span className="flex items-center gap-2 truncate">
                <File className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-mono text-xs">{f.path}</span>
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(f.path);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Center: editor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="text-sm font-mono">{active?.path ?? '—'}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveDraft.mutate()}
              disabled={saveDraft.isPending}
            >
              {saveDraft.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-2 h-3.5 w-3.5" />
              )}
              Save Draft
            </Button>
            <Button
              size="sm"
              onClick={() => publish.mutate()}
              disabled={publish.isPending || !version.trim()}
            >
              {publish.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-2 h-3.5 w-3.5" />
              )}
              Publish v{version}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <ProblemAlert error={error} /> : null}
          <CodeEditor
            value={active?.content ?? ''}
            onChange={updateActiveContent}
            language={active ? languageFor(active.path) : 'plain'}
            minHeight="380px"
          />
        </CardContent>
      </Card>

      {/* Right: settings + env */}
      <Card className="self-start">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Settings</CardTitle>
          <CardDescription>Persisted with the draft.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ed-runtime">{t('functions.versions.runtime')}</Label>
            <Select value={runtime} onValueChange={(v) => swapRuntime(v as Runtime)}>
              <SelectTrigger id="ed-runtime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="node">Node.js</SelectItem>
                <SelectItem value="go">Go</SelectItem>
                <SelectItem value="python">Python</SelectItem>
                <SelectItem value="wasm">WASM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-version">{t('functions.versions.version')}</Label>
            <Input
              id="ed-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Env / Secrets</Label>
            <CodeEditor value={envText} onChange={setEnvText} language="json" minHeight="160px" />
            <p className="text-xs text-muted-foreground">
              JSON object of key/value pairs injected as env vars at build time.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
