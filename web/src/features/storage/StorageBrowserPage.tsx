import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Upload, Download, FileUp, Loader2, Trash2, RefreshCw, Folder } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { CopyButton } from '@/components/data/CopyButton';
import { EmptyState } from '@/components/data/EmptyState';
import { api, rawFetch, resolveApiHttpUrl, xhrApiHeaders } from '@/api/client';
import { isProblem, ProblemError } from '@/api/problem';
import { validateObjectKey } from '@/lib/objectKey';
import { formatBytes, cn } from '@/lib/utils';

interface PresignResponse {
  upload_url?: string;
  download_url?: string;
  url?: string;
  method?: string;
  bucket?: string;
}

interface StoredObject {
  key: string;
  size: number;
  etag: string;
  content_type?: string;
  last_modified?: string;
}

export function StorageBrowserPage() {
  const { t } = useTranslation();
  const { pid } = useParams();

  return (
    <div>
      <PageHeader title={t('storage.title')} description="GET /v1/projects/:pid/storage/objects" />
      <UploadCard pid={pid!} />
      <ObjectsCard pid={pid!} />
    </div>
  );
}

function UploadCard({ pid }: { pid: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const [expires, setExpires] = useState(3600);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [presigned, setPresigned] = useState<PresignResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const keyErr = key ? validateObjectKey(key) : null;

  const presign = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await api.POST('/v1/projects/{pid}/storage/upload', {
        params: { path: { pid } },
        body: { key, expires },
      });
      if (err) throw err;
      return data as PresignResponse;
    },
    onSuccess: (d) => {
      setPresigned(d);
      setError(null);
    },
    onError: (e) => setError(e),
  });

  const upload = async () => {
    if (!file || !presigned?.upload_url) return;
    setProgress(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const url = resolveApiHttpUrl(presigned.upload_url!);
        xhr.open(presigned.method || 'PUT', url, true);
        const headers = xhrApiHeaders();
        Object.entries(headers).forEach(([k, v]) => {
          xhr.setRequestHeader(k, v);
        });
        xhr.setRequestHeader(
          'Content-Type',
          file.type && file.type.length > 0 ? file.type : 'application/octet-stream',
        );
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
      });
      toast.success(t('storage.uploadDone'));
      setProgress(null);
      qc.invalidateQueries({ queryKey: ['storage', pid] });
    } catch (e) {
      toast.error(t('storage.uploadFailed'));
      setError(e);
      setProgress(null);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" /> {t('storage.uploadTitle')}
        </CardTitle>
        <CardDescription>{t('storage.uploadHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <ProblemAlert error={error} /> : null}
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <div className="space-y-1.5">
            <Label htmlFor="up-key">{t('storage.keyLabel')}</Label>
            <Input
              id="up-key"
              placeholder="documents/report.pdf"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            {keyErr ? <p className="text-xs text-destructive">{keyErr}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="up-expires">{t('storage.expirySeconds')}</Label>
            <Input
              id="up-expires"
              type="number"
              min={60}
              value={expires}
              onChange={(e) => setExpires(Number(e.target.value || 3600))}
            />
          </div>
        </div>
        <div
          className={cn(
            'rounded-md border-2 border-dashed p-4 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-input',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) {
              setFile(f);
              if (!key) setKey(f.name);
            }
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
        >
          <FileUp className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {file ? `${file.name} (${formatBytes(file.size)})` : t('storage.uploadHint')}
          </p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !key) setKey(f.name);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => presign.mutate()}
            disabled={presign.isPending || !key.trim() || !!keyErr}
            variant="outline"
          >
            {presign.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('storage.createPresign')}
          </Button>
          <Button onClick={upload} disabled={!presigned?.upload_url || !file || progress !== null}>
            {progress !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('storage.uploadButton')} {progress !== null ? `${progress}%` : null}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ObjectsCard({ pid }: { pid: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [prefix, setPrefix] = useState('');
  const [appliedPrefix, setAppliedPrefix] = useState('');

  const objects = useQuery({
    queryKey: ['storage', pid, appliedPrefix],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/storage/objects', {
        params: { path: { pid }, query: { prefix: appliedPrefix, limit: 500 } },
      });
      if (error) throw error;
      return ((data as { objects?: StoredObject[] } | undefined)?.objects ?? []) as StoredObject[];
    },
  });

  const presignDownload = useMutation({
    mutationFn: async (key: string) => {
      const { data, error } = await api.POST('/v1/projects/{pid}/storage/download', {
        params: { path: { pid } },
        body: { key, expires: 3600 } as { key: string; expires: number },
      });
      if (error) throw error;
      const row = (data as { download_url?: string; url?: string } | undefined) ?? {};
      const dl = row.download_url ?? row.url ?? '';
      if (!dl) throw new Error('No download path');
      if (dl.startsWith('http://') || dl.startsWith('https://')) {
        return { kind: 'redirect' as const, url: dl };
      }
      const res = await rawFetch(dl, { method: 'GET' });
      if (!res.ok) {
        const text = await res.text();
        let body: unknown = null;
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            //
          }
        }
        if (isProblem(body)) throw new ProblemError(res.status, body);
        throw new Error('Download failed');
      }
      const blob = await res.blob();
      return { kind: 'blob' as const, blob, filename: key.split('/').pop() ?? 'download' };
    },
    onSuccess: (result) => {
      if (result.kind === 'redirect') {
        window.open(result.url, '_blank', 'noopener,noreferrer');
        return;
      }
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });

  const remove = useMutation({
    mutationFn: async (key: string) => {
      // The DELETE route accepts the key as a path suffix.
      const path = `/v1/projects/${pid}/storage/objects/${encodeURI(key)}`;
      const res = await rawFetch(path, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (isProblem(body)) throw new ProblemError(res.status, body);
        throw new Error('Failed');
      }
      return body;
    },
    onSuccess: () => {
      toast.success(t('common.deleteSucceeded'));
      qc.invalidateQueries({ queryKey: ['storage', pid] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Folder className="h-4 w-4" /> Objects
          </span>
          <div className="flex items-center gap-2">
            <Input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="prefix/"
              className="h-8 w-48 font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAppliedPrefix(prefix)}
              disabled={objects.isLoading}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Apply
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {objects.error ? <ProblemAlert error={objects.error} /> : null}
        {objects.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (objects.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Folder className="h-8 w-8" />}
            title="No objects found"
            description={appliedPrefix ? `No keys starting with ${appliedPrefix}.` : 'Upload one above.'}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>key</TableHead>
                <TableHead>size</TableHead>
                <TableHead>etag</TableHead>
                <TableHead>last modified</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(objects.data ?? []).map((obj) => (
                <TableRow key={obj.key}>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="truncate" title={obj.key}>
                        {obj.key}
                      </span>
                      <CopyButton value={obj.key} label="" />
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{formatBytes(obj.size)}</TableCell>
                  <TableCell className="max-w-[140px] truncate font-mono text-[11px]">
                    <Badge variant="outline">{obj.etag.slice(1, 9)}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {obj.last_modified
                      ? format(new Date(obj.last_modified), 'yyyy-MM-dd HH:mm')
                      : '—'}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => presignDownload.mutate(obj.key)}
                      disabled={presignDownload.isPending}
                    >
                      <Download className="mr-2 h-3.5 w-3.5" /> {t('storage.downloadButton')}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Delete ${obj.key}?`)) remove.mutate(obj.key);
                      }}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

