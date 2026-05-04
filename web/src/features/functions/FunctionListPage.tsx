import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Plus, Code2, Trash2, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/data/EmptyState';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { useLocalCache } from '@/hooks/useLocalCache';
import { addCached, removeCached } from '@/lib/localCache';
import { useCreateFunction } from './queries';

export function FunctionListPage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const navigate = useNavigate();
  const items = useLocalCache('functions', pid);
  const [open, setOpen] = useState(false);
  const [importId, setImportId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const create = useCreateFunction(pid!);

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

  const onImport = () => {
    if (!importId.trim() || !pid) return;
    addCached('functions', pid, { id: importId.trim() });
    setImportId('');
  };

  return (
    <div>
      <PageHeader
        title={t('functions.title')}
        description="Local cache of functions you've created or imported in this browser."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> {t('functions.newFunction')}
          </Button>
        }
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm">Open by ID</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[260px] space-y-1.5">
              <Label htmlFor="fn-import">Function ID</Label>
              <Input
                id="fn-import"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={importId}
                onChange={(e) => setImportId(e.target.value)}
                className="font-mono"
              />
            </div>
            <Button onClick={onImport} variant="outline" disabled={!importId.trim()}>
              <Search className="mr-2 h-4 w-4" /> Add
            </Button>
            <Button
              onClick={() => importId.trim() && navigate(`/app/projects/${pid}/functions/${importId.trim()}`)}
              disabled={!importId.trim()}
              variant="ghost"
            >
              {t('common.next')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {items.length === 0 ? (
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <Card key={it.id} className="transition-shadow hover:shadow-md">
              <CardContent className="space-y-2 pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      to={`/app/projects/${pid}/functions/${it.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {it.name ?? '(no name)'}
                    </Link>
                    <p className="font-mono text-[10px] text-muted-foreground">{it.id}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => pid && removeCached('functions', pid, it.id)}
                    aria-label={t('common.remove')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(it.ts), 'yyyy-MM-dd HH:mm')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
