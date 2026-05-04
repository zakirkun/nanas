import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Download, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/data/EmptyState';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/data/CopyButton';
import { api } from '@/api/client';
import { useProjectsList } from '@/features/projects/queries';

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?(\+[\w.-]+)?$/;

interface VersionRow {
  version: string;
  runtime?: string;
  source_uri?: string;
  checksum?: string;
  notes?: string;
  created_at?: string;
}

export function MarketplaceDetailPage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const qc = useQueryClient();
  const [publishOpen, setPublishOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  const detail = useQuery({
    queryKey: ['marketplace', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/marketplace/packages/{slug}', {
        params: { path: { slug: slug! } },
      });
      if (error) throw error;
      return data as { id: string; slug: string; title?: string; version?: string };
    },
  });

  const versions = useQuery({
    queryKey: ['marketplace', slug, 'versions'],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/marketplace/packages/{slug}/versions', {
        params: { path: { slug: slug! } },
      });
      if (error) throw error;
      return ((data as { versions?: VersionRow[] } | undefined)?.versions ?? []) as VersionRow[];
    },
  });

  const publish = useMutation({
    mutationFn: async (vars: {
      version: string;
      runtime?: string;
      source_uri?: string;
      checksum?: string;
      notes?: string;
    }) => {
      const { data, error } = await api.POST('/v1/marketplace/packages/{slug}/versions', {
        params: { path: { slug: slug! } },
        body: vars,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(t('common.saveSucceeded'));
      qc.invalidateQueries({ queryKey: ['marketplace', slug] });
      setPublishOpen(false);
    },
  });

  return (
    <div>
      <PageHeader
        title={detail.data?.title ?? slug}
        description={
          <span className="flex items-center gap-2">
            <span className="font-mono">{slug}</span>
            {detail.data?.version ? <Badge variant="info">latest v{detail.data.version}</Badge> : null}
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/app/marketplace">
                <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back')}
              </Link>
            </Button>
            <Button onClick={() => setInstallOpen(true)}>
              <Download className="mr-2 h-4 w-4" /> {t('marketplace.install')}
            </Button>
            <Button onClick={() => setPublishOpen(true)} variant="secondary">
              <Plus className="mr-2 h-4 w-4" /> {t('marketplace.publishVersion')}
            </Button>
          </div>
        }
      />

      {detail.error ? <ProblemAlert error={detail.error} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versions</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {versions.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (versions.data ?? []).length === 0 ? (
            <EmptyState title={t('marketplace.noVersions')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Runtime</TableHead>
                  <TableHead>Checksum</TableHead>
                  <TableHead>Source URI</TableHead>
                  <TableHead>Published</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(versions.data ?? []).map((v) => (
                  <TableRow key={v.version}>
                    <TableCell className="font-mono">v{v.version}</TableCell>
                    <TableCell>{v.runtime ?? '—'}</TableCell>
                    <TableCell className="max-w-[160px] truncate font-mono text-xs">
                      <span title={v.checksum}>{v.checksum ?? '—'}</span>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate font-mono text-xs">
                      <span title={v.source_uri}>{v.source_uri ?? '—'}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {v.created_at ? format(new Date(v.created_at), 'yyyy-MM-dd') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PublishVersionDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        pending={publish.isPending}
        error={publish.error}
        onSubmit={(vars) => publish.mutate(vars)}
      />
      <InstallDialog open={installOpen} onOpenChange={setInstallOpen} slug={slug!} />
    </div>
  );
}

interface PublishProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: unknown;
  onSubmit: (vars: {
    version: string;
    runtime?: string;
    source_uri?: string;
    checksum?: string;
    notes?: string;
  }) => void;
}

function PublishVersionDialog({ open, onOpenChange, pending, error, onSubmit }: PublishProps) {
  const { t } = useTranslation();
  const [version, setVersion] = useState('');
  const [runtime, setRuntime] = useState('node');
  const [sourceUri, setSourceUri] = useState('');
  const [checksum, setChecksum] = useState('');
  const [notes, setNotes] = useState('');
  const valid = SEMVER.test(version.trim());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('marketplace.publishVersion')}</DialogTitle>
          <DialogDescription>POST /v1/marketplace/packages/:slug/versions</DialogDescription>
        </DialogHeader>
        {error ? <ProblemAlert error={error} /> : null}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mp-version">{t('marketplace.version')}</Label>
            <Input
              id="mp-version"
              placeholder="1.0.0"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="font-mono"
            />
            {version && !valid ? (
              <p className="text-xs text-destructive">Must be semver (e.g. 1.0.0)</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Runtime</Label>
            <Select value={runtime} onValueChange={setRuntime}>
              <SelectTrigger>
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
            <Label htmlFor="mp-uri">Source URI</Label>
            <Input
              id="mp-uri"
              placeholder="https://github.com/..."
              value={sourceUri}
              onChange={(e) => setSourceUri(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mp-chk">Checksum</Label>
            <Input
              id="mp-chk"
              placeholder="sha256:..."
              value={checksum}
              onChange={(e) => setChecksum(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mp-notes">Notes</Label>
            <Textarea id="mp-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={pending || !valid}
            onClick={() =>
              onSubmit({
                version: version.trim().replace(/^v/, ''),
                runtime,
                ...(sourceUri ? { source_uri: sourceUri } : {}),
                ...(checksum ? { checksum } : {}),
                ...(notes ? { notes } : {}),
              })
            }
          >
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('marketplace.publish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface InstallProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
}

function InstallDialog({ open, onOpenChange, slug }: InstallProps) {
  const { t } = useTranslation();
  const projects = useProjectsList();
  const [pid, setPid] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState<unknown>(null);
  const install = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/v1/projects/{pid}/marketplace/install', {
        params: { path: { pid } },
        body: { slug, ...(version ? { version } : {}) } as { slug: string; version?: string },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(t('marketplace.installed'));
      onOpenChange(false);
      setError(null);
    },
    onError: (e) => setError(e),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('marketplace.installInto')}</DialogTitle>
          <DialogDescription>POST /v1/projects/:pid/marketplace/install</DialogDescription>
        </DialogHeader>
        {error ? <ProblemAlert error={error} /> : null}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={pid} onValueChange={setPid}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectContent>
                {(projects.data?.projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inst-ver">Version</Label>
            <Input
              id="inst-ver"
              placeholder="(latest semver)"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Leave blank to install the highest semver.</p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <p className="mb-1 text-muted-foreground">Package:</p>
            <code className="font-mono">{slug}</code>
            <CopyButton value={slug} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!pid || install.isPending} onClick={() => install.mutate()}>
            {install.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('marketplace.install')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
