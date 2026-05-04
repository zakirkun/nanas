import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { FileUp, Loader2, Upload, Plus } from 'lucide-react';
import { toast } from 'sonner';
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
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { EmptyState } from '@/components/data/EmptyState';
import { useFunctionVersions, usePresignArtifact, useRegisterVersion } from './queries';

export function VersionsTab() {
  const { t } = useTranslation();
  const { pid, fid } = useParams();
  const versions = useFunctionVersions(pid, fid);
  const [version, setVersion] = useState('');
  const [runtime, setRuntime] = useState<'go' | 'node' | 'python'>('node');
  const [checksum, setChecksum] = useState('');
  const [artifactKey, setArtifactKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const presign = usePresignArtifact(pid!, fid!);
  const register = useRegisterVersion(pid!, fid!);

  const presignAndUpload = async () => {
    setError(null);
    if (!file || !version) return;
    try {
      const ps = await presign.mutateAsync({ version });
      setArtifactKey(ps.artifact_key);
      setProgress(0);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(ps.method, ps.upload_url, true);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
      });
      setProgress(null);
      toast.success(t('storage.uploadDone'));
    } catch (e) {
      setError(e);
      setProgress(null);
    }
  };

  const onRegister = async () => {
    setError(null);
    try {
      await register.mutateAsync({
        version,
        runtime,
        ...(checksum ? { checksum } : {}),
        ...(artifactKey ? { artifact_key: artifactKey } : {}),
      });
      toast.success(t('functions.versions.registered'));
      setVersion('');
      setChecksum('');
      setArtifactKey('');
      setFile(null);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('functions.versions.newVersion')}</CardTitle>
          <CardDescription>
            Step 1: presign + upload artifact tarball. Step 2: register the version (build queues
            automatically). For in-browser authoring use the Editor tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <ProblemAlert error={error} /> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ver">{t('functions.versions.version')}</Label>
              <Input
                id="ver"
                placeholder="0.1.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rt">{t('functions.versions.runtime')}</Label>
              <Select value={runtime} onValueChange={(v) => setRuntime(v as typeof runtime)}>
                <SelectTrigger id="rt">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="node">Node.js</SelectItem>
                  <SelectItem value="go">Go</SelectItem>
                  <SelectItem value="python">Python</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chk">{t('functions.versions.checksum')}</Label>
              <Input
                id="chk"
                placeholder="sha256:…"
                value={checksum}
                onChange={(e) => setChecksum(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          <div
            className="cursor-pointer rounded-md border-2 border-dashed p-4 text-center"
            onClick={() => inputRef.current?.click()}
          >
            <FileUp className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {file ? file.name : 'Click to choose artifact (.tar.gz)'}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".tar.gz,.tgz,application/gzip,application/x-tar"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {artifactKey ? (
            <p className="text-xs text-muted-foreground">
              Artifact key: <code className="font-mono">{artifactKey}</code>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={presignAndUpload}
              disabled={!file || !version || presign.isPending || progress !== null}
            >
              {progress !== null ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {t('functions.versions.presignFirst')} {progress !== null ? `${progress}%` : ''}
            </Button>
            <Button onClick={onRegister} disabled={!version || register.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {t('functions.versions.uploadAndRegister')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('functions.versions.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {versions.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (versions.data ?? []).length === 0 ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('functions.versions.version')}</TableHead>
                  <TableHead>{t('functions.versions.runtime')}</TableHead>
                  <TableHead>{t('functions.versions.checksum')}</TableHead>
                  <TableHead>{t('functions.versions.buildStatus')}</TableHead>
                  <TableHead>{t('common.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(versions.data ?? []).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono">v{v.version}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{v.runtime}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs">
                      <span title={v.checksum}>{v.checksum}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          v.build_status === 'complete'
                            ? 'success'
                            : v.build_status === 'failed'
                              ? 'destructive'
                              : 'info'
                        }
                      >
                        {v.build_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(v.created_at), 'yyyy-MM-dd HH:mm')}
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
