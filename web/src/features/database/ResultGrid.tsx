import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from 'react-i18next';

interface ResultGridProps {
  rows: Array<Record<string, unknown>>;
}

export function ResultGrid({ rows }: ResultGridProps) {
  const { t } = useTranslation();
  const columns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r ?? {}).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [rows]);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('database.noRows')}</p>;
  }

  return (
    <div className="max-h-[480px] overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c} className="font-mono text-xs">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c} className="font-mono text-xs">
                  {formatCell(row[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
