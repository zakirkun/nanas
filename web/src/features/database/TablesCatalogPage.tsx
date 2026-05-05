import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LayoutGrid, Minus, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/api/client';

function dedupeSortedTables(tables: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of tables) {
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export function TablesCatalogPage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const qc = useQueryClient();

  const catalog = useQuery({
    queryKey: ['projects', pid, 'tenant-catalog-tables'],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/data/catalog/tables', {
        params: { path: { pid: pid! } },
      });
      if (error) throw error;
      return (data as { tables?: string[] }).tables ?? [];
    },
    enabled: !!pid,
  });

  const allowlist = useQuery({
    queryKey: ['projects', pid, 'data-allowlist'],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/settings/data-allowlist', {
        params: { path: { pid: pid! } },
      });
      if (error) throw error;
      return (data as { tables?: string[] }).tables ?? [];
    },
    enabled: !!pid,
  });

  const patch = useMutation({
    mutationFn: async (tables: string[]) => {
      const { error } = await api.PATCH('/v1/projects/{pid}/settings/data-allowlist', {
        params: { path: { pid: pid! } },
        body: { tables },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('common.saveSucceeded'));
      qc.invalidateQueries({ queryKey: ['projects', pid, 'data-allowlist'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const allowedLower = new Set((allowlist.data ?? []).map((x) => x.toLowerCase()));

  const loading = catalog.isLoading || allowlist.isLoading;
  const listErr = catalog.error ?? allowlist.error;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutGrid className="h-4 w-4" /> {t('database.catalog')}
          </CardTitle>
          <CardDescription>{t('database.catalogHelper')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {listErr ? <ProblemAlert error={listErr} /> : null}
          {patch.error ? <ProblemAlert error={patch.error} /> : null}
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('database.tableName')}</TableHead>
                  <TableHead className="w-[140px]">{t('database.allowlistColumn')}</TableHead>
                  <TableHead className="w-[240px] text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(catalog.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      {t('database.catalogEmpty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  (catalog.data ?? []).map((name) => {
                    const onList = allowedLower.has(name.toLowerCase());
                    return (
                      <TableRow key={name}>
                        <TableCell className="font-mono text-sm">{name}</TableCell>
                        <TableCell>
                          {onList ? (
                            <Badge variant="secondary">{t('database.allowlisted')}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {!onList ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={patch.isPending}
                                onClick={() =>
                                  patch.mutate(dedupeSortedTables([...(allowlist.data ?? []), name]))
                                }
                              >
                                <Plus className="mr-1 h-3.5 w-3.5" /> {t('database.addToAllowlist')}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={patch.isPending}
                                onClick={() =>
                                  patch.mutate(
                                    dedupeSortedTables(
                                      (allowlist.data ?? []).filter(
                                        (x) => x.toLowerCase() !== name.toLowerCase(),
                                      ),
                                    ),
                                  )
                                }
                              >
                                <Minus className="mr-1 h-3.5 w-3.5" />{' '}
                                {t('database.removeFromAllowlist')}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" asChild>
                              <Link to={`/app/projects/${pid}/database/tables`}>
                                {t('database.browseRows')}
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
