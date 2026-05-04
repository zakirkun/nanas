import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total?: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({ page, pageSize, total, onChange, disabled }: PaginationProps) {
  const hasPrev = page > 1;
  const hasNext = total === undefined ? true : page * pageSize < total;
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
      <span>
        Page {page}
        {total !== undefined ? ` of ${Math.max(1, Math.ceil(total / pageSize))}` : ''}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || !hasPrev}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || !hasNext}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
