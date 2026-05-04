import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShoppingBag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Pagination } from '@/components/data/Pagination';
import { Badge } from '@/components/ui/badge';
import { api } from '@/api/client';

interface Package {
  id: string;
  slug: string;
  title: string;
  latest_version?: string;
}

export function MarketplaceListPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const list = useQuery({
    queryKey: ['marketplace', 'list', page],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/marketplace/packages', {
        params: { query: { limit: pageSize, offset: (page - 1) * pageSize } },
      });
      if (error) throw error;
      return ((data as { packages?: Package[] } | undefined)?.packages ?? []) as Package[];
    },
  });

  const create = useMutation({
    mutationFn: async (vars: {
      slug: string;
      title: string;
      description?: string;
      visibility?: string;
    }) => {
      const { data, error } = await api.POST('/v1/marketplace/packages', {
        body: vars as { slug: string; title: string; description?: string; visibility?: string },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(t('common.saveSucceeded'));
      qc.invalidateQueries({ queryKey: ['marketplace'] });
      setOpen(false);
    },
    onError: (e) => setError(e),
  });

  const items = list.data ?? [];

  return (
    <div>
      <PageHeader
        title={t('marketplace.title')}
        description="GET /v1/marketplace/packages"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Publish package
          </Button>
        }
      />

      {list.error ? <ProblemAlert error={list.error} /> : null}

      {list.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="h-8 w-8" />} title={t('marketplace.noPackages')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  <Link to={`/app/marketplace/${p.slug}`} className="hover:underline">
                    {p.title || p.slug}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-mono text-xs text-muted-foreground">{p.slug}</p>
                {p.latest_version ? <Badge variant="info">v{p.latest_version}</Badge> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-4">
        <Pagination page={page} pageSize={pageSize} onChange={setPage} disabled={list.isLoading} />
      </div>

      <PublishPackageDialog
        open={open}
        onOpenChange={setOpen}
        onSubmit={(vars) => create.mutate(vars)}
        pending={create.isPending}
        error={error}
      />
    </div>
  );
}

interface PublishPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (vars: { slug: string; title: string; description?: string; visibility?: string }) => void;
  pending: boolean;
  error: unknown;
}

function PublishPackageDialog({ open, onOpenChange, onSubmit, pending, error }: PublishPackageDialogProps) {
  const { t } = useTranslation();
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [vis, setVis] = useState<'public' | 'unlisted'>('public');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish marketplace package</DialogTitle>
          <DialogDescription>POST /v1/marketplace/packages</DialogDescription>
        </DialogHeader>
        {error ? <ProblemAlert error={error} /> : null}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mp-slug">Slug</Label>
            <Input id="mp-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auth-helpers" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mp-title">Title</Label>
            <Input id="mp-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mp-desc">Description</Label>
            <Textarea id="mp-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <Select value={vis} onValueChange={(v) => setVis(v as typeof vis)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">public</SelectItem>
                <SelectItem value="unlisted">unlisted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={pending || !slug.trim()}
            onClick={() =>
              onSubmit({
                slug: slug.trim(),
                title: title.trim() || slug.trim(),
                ...(desc ? { description: desc } : {}),
                visibility: vis,
              })
            }
          >
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
