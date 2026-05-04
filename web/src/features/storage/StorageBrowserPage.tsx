import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Upload, Download, FileUp, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { CopyButton } from '@/components/data/CopyButton';
import { api } from '@/api/client';
import { validateObjectKey } from '@/lib/objectKey';
import { formatBytes, cn } from '@/lib/utils';

interface PresignResponse {
  upload_url?: string;
  download_url?: string;
  url?: string;
  method?: string;
  bucket?: string;
}

export function StorageBrowserPage() {
  const { t } = useTranslation();
  const { pid } = useParams();

  return (
    <div>
      <PageHeader title={t('storage.title')} description={t('storage.keyHelper')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <UploadCard pid={pid!} />
        <DownloadCard pid={pid!} />
      </div>
    </div>
  );
}

function UploadCard({ pid }: { pid: string }) {
  const { t } = useTranslation();
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
        xhr.open(presigned.method || 'PUT', presigned.upload_url!, true);
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
    } catch (e) {
      toast.error(t('storage.uploadFailed'));
      setError(e);
      setProgress(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" /> {t('storage.uploadTitle')}
        </CardTitle>
        <CardDescription>{t('storage.uploadHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <ProblemAlert error={error} /> : null}
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
            {presign.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t('storage.createPresign')}
          </Button>
          <Button onClick={upload} disabled={!presigned?.upload_url || !file || progress !== null}>
            {progress !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('storage.uploadButton')} {progress !== null ? `${progress}%` : null}
          </Button>
        </div>
        {presigned?.upload_url ? (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <code className="break-all font-mono">{presigned.upload_url.slice(0, 90)}…</code>
              <CopyButton value={presigned.upload_url} />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DownloadCard({ pid }: { pid: string }) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [expires, setExpires] = useState(3600);
  const [error, setError] = useState<unknown>(null);
  const [url, setUrl] = useState<string | null>(null);
  const keyErr = key ? validateObjectKey(key) : null;

  const presign = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await api.POST('/v1/projects/{pid}/storage/download', {
        params: { path: { pid } },
        body: { key, expires } as { key: string; expires: number },
      });
      if (err) throw err;
      return data as PresignResponse;
    },
    onSuccess: (d) => {
      setUrl(d.download_url ?? d.url ?? null);
      setError(null);
    },
    onError: (e) => setError(e),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="h-4 w-4" /> {t('storage.downloadTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <ProblemAlert error={error} /> : null}
        <div className="space-y-1.5">
          <Label htmlFor="dl-key">{t('storage.keyLabel')}</Label>
          <Input
            id="dl-key"
            placeholder="documents/report.pdf"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          {keyErr ? <p className="text-xs text-destructive">{keyErr}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dl-expires">{t('storage.expirySeconds')}</Label>
          <Input
            id="dl-expires"
            type="number"
            min={60}
            value={expires}
            onChange={(e) => setExpires(Number(e.target.value || 3600))}
          />
        </div>
        <Button onClick={() => presign.mutate()} disabled={!key.trim() || !!keyErr}>
          {t('storage.createPresign')}
        </Button>
        {url ? (
          <div className="space-y-2">
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <code className="break-all font-mono">{url.slice(0, 90)}…</code>
                <CopyButton value={url} />
              </div>
            </div>
            <Button asChild variant="secondary">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> {t('storage.downloadButton')}
              </a>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
