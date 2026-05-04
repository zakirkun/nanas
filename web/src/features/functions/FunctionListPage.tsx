import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Plus, Code2, Search, Lock, Globe, Filter, ArrowDownAZ, ArrowDownUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/EmptyState';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Pagination } from '@/components/data/Pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreateFunction, useFunctionsList, type FunctionListItem } from './queries';
import { computeFunctionStatus } from './status';

type RuntimeFilter = 'all' | 'go' | 'node' | 'python' | 'wasm';
type StatusFilter = 'all' | 'active' | 'draft' | 'failed';
type VisibilityFilter = 'all' | 'public' | 'private';
type SortKey = 'created_at' | 'name' | 'last_deployed_at';

interface Filters {
  q: string;
  runtime: RuntimeFilter;
  status: StatusFilter;
  visibility: VisibilityFilter;
  sort: SortKey;
}

const DEFAULT_FILTERS: Filters = {
  q: '',
  runtime: 'all',
  status: 'all',
  visibility: 'all',
  sort: 'created_at',
};

export function FunctionListPage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [importId, setImportId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const create = useCreateFunction(pid!);

  const list = useFunctionsList(pid, page, pageSize, filters);

  const filtered = useMemo(() => {
    const items = list.data ?? [];
    return items
      .filter((it) => {
        if (filters.q && !`${it.name} ${it.slug ?? ''}`.toLowerCase().includes(filters.q.toLowerCase())) {
          return false;
        }
        if (filters.runtime !== 'all' && it.runtime !== filters.runtime) return false;
        if (filters.status !== 'all') {
          const s = computeFunctionStatus(it);
          if (s !== filters.status) return false;
        }
        if (filters.visibility !== 'all') {
          const want = filters.visibility === 'public';
          if (it.entrypoint_enabled !== want) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (filters.sort === 'name') return a.name.localeCompare(b.name);
        if (filters.sort === 'last_deployed_at') {
          const av = a.last_deployed_at ? new Date(a.last_deployed_at).getTime() : 0;
          const bv = b.last_deployed_at ? new Date(b.last_deployed_at).getTime() : 0;
          return bv - av;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [list.data, filters]);

  const onCreate = async () => {
    setError(null);
    try {
      const fn = await create.mutateAsync({ name });
      setName('');
      setOpen(false);
      navigate(`/app/projects/${pid}/functions/${fn.fn_id}`);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('functions.title')}
        description={t('functions.listDescription', 'List of functions in this project.')}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> {t('functions.newFunction')}
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 md:grid-cols-[1fr_140px_140px_140px_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="fn-q">
              <span className="flex items-center gap-1">
                <Search className="h-3.5 w-3.5" /> {t('common.search')}
              </span>
            </Label>
            <Input
              id="fn-q"
              placeholder={t('functions.namePlaceholder')}
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fn-runtime">
              <span className="flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> {t('functions.versions.runtime')}
              </span>
            </Label>
            <Select
              value={filters.runtime}
              onValueChange={(v) => setFilters((f) => ({ ...f, runtime: v as RuntimeFilter }))}
            >
              <SelectTrigger id="fn-runtime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all</SelectItem>
                <SelectItem value="node">node</SelectItem>
                <SelectItem value="go">go</SelectItem>
                <SelectItem value="python">python</SelectItem>
                <SelectItem value="wasm">wasm</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fn-status">{t('common.status')}</Label>
            <Select
              value={filters.status}
              onValueChange={(v) => setFilters((f) => ({ ...f, status: v as StatusFilter }))}
            >
              <SelectTrigger id="fn-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="draft">draft</SelectItem>
                <SelectItem value="failed">failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fn-vis">
              <span className="flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" /> visibility
              </span>
            </Label>
            <Select
              value={filters.visibility}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, visibility: v as VisibilityFilter }))
              }
            >
              <SelectTrigger id="fn-vis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all</SelectItem>
                <SelectItem value="public">public</SelectItem>
                <SelectItem value="private">private</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fn-sort">
              <span className="flex items-center gap-1">
                <ArrowDownUp className="h-3.5 w-3.5" /> sort
              </span>
            </Label>
            <Select
              value={filters.sort}
              onValueChange={(v) => setFilters((f) => ({ ...f, sort: v as SortKey }))}
            >
              <SelectTrigger id="fn-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">created</SelectItem>
                <SelectItem value="last_deployed_at">last deployed</SelectItem>
                <SelectItem value="name">name (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {list.error ? <ProblemAlert error={list.error} /> : null}

      <Card>
        <CardContent className="pt-6">
          {list.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Code2 className="h-8 w-8" />}
              title={t('common.empty')}
              description={t('functions.title')}
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> {t('functions.newFunction')}
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="flex items-center gap-1">
                      <ArrowDownAZ className="h-3.5 w-3.5" /> {t('common.name')}
                    </span>
                  </TableHead>
                  <TableHead>{t('functions.versions.runtime')}</TableHead>
                  <TableHead>version</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>visibility</TableHead>
                  <TableHead>triggers</TableHead>
                  <TableHead>last deploy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((it) => (
                  <FnRow key={it.id} pid={pid!} item={it} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="mt-4">
        <Pagination
          page={page}
          pageSize={pageSize}
          onChange={setPage}
          disabled={list.isLoading}
        />
      </div>

      <Card className="mt-6">
        <CardContent className="pt-6">
          <Label htmlFor="fn-import" className="text-xs uppercase tracking-wide text-muted-foreground">
            Import by ID
          </Label>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Input
              id="fn-import"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={importId}
              onChange={(e) => setImportId(e.target.value)}
              className="font-mono max-w-md"
            />
            <Button
              variant="outline"
              disabled={!importId.trim()}
              onClick={() => navigate(`/app/projects/${pid}/functions/${importId.trim()}`)}
            >
              {t('common.next')}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Useful for jumping to a function created via API key without listing the full project.
          </p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('functions.createFunction')}</DialogTitle>
            <DialogDescription>
              A slug will be generated from the name automatically.
            </DialogDescription>
          </DialogHeader>
          {error ? <ProblemAlert error={error} /> : null}
          <div className="space-y-1.5">
            <Label htmlFor="fn-name">{t('common.name')}</Label>
            <Input
              id="fn-name"
              autoFocus
              placeholder={t('functions.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onCreate} disabled={!name.trim() || create.isPending}>
              {t('functions.createFunction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function statusVariant(s: 'active' | 'draft' | 'failed'): 'success' | 'warning' | 'destructive' | 'outline' {
  if (s === 'active') return 'success';
  if (s === 'failed') return 'destructive';
  return 'warning';
}

function FnRow({ pid, item }: { pid: string; item: FunctionListItem }) {
  const status = computeFunctionStatus(item);
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <Link to={`/app/projects/${pid}/functions/${item.id}`} className="font-medium hover:underline">
            {item.name}
          </Link>
          {item.slug ? (
            <span className="font-mono text-[10px] text-muted-foreground">{item.slug}</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        {item.runtime ? <Badge variant="outline">{item.runtime}</Badge> : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="font-mono text-xs">{item.current_version ?? '—'}</TableCell>
      <TableCell>
        <Badge variant={statusVariant(status)}>{status}</Badge>
      </TableCell>
      <TableCell>
        {item.entrypoint_enabled ? (
          <Badge variant="info" className="gap-1">
            <Globe className="h-3 w-3" /> public
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <Lock className="h-3 w-3" /> private
          </Badge>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">{item.triggers_count}</TableCell>
      <TableCell className="font-mono text-xs">
        {item.last_deployed_at ? format(new Date(item.last_deployed_at), 'yyyy-MM-dd HH:mm') : '—'}
      </TableCell>
    </TableRow>
  );
}
