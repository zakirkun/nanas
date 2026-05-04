import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Database, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { ResultGrid } from './ResultGrid';
import { api } from '@/api/client';

export function TablesBrowserPage() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const [table, setTable] = useState('');
  const [limit, setLimit] = useState(100);
  const [error, setError] = useState<unknown>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>> | null>(null);

  const fetchRows = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await api.GET('/v1/projects/{pid}/data/tables/{table}/rows', {
        params: { path: { pid: pid!, table }, query: { limit } },
      });
      if (err) throw err;
      return (data as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    },
    onSuccess: (rs) => {
      setRows(rs);
      setError(null);
    },
    onError: (e) => {
      setRows(null);
      setError(e);
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> {t('database.tables')}
          </CardTitle>
          <CardDescription>{t('projects.settings.dataAllowlistHelper')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <ProblemAlert error={error} /> : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="tbl-name">Table</Label>
              <Input
                id="tbl-name"
                placeholder="orders"
                value={table}
                onChange={(e) => setTable(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tbl-limit">Limit</Label>
              <Input
                id="tbl-limit"
                type="number"
                min={1}
                max={1000}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value || 100))}
              />
            </div>
            <Button onClick={() => fetchRows.mutate()} disabled={!table.trim() || fetchRows.isPending}>
              <Search className="mr-2 h-4 w-4" /> {t('common.search')}
            </Button>
          </div>
        </CardContent>
      </Card>
      {rows ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{table}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResultGrid rows={rows} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
