import { useTranslation } from 'react-i18next';
import { Badge, type BadgeProps } from '@/components/ui/badge';

type Variant = NonNullable<BadgeProps['variant']>;

const variantByStatus: Record<string, Variant> = {
  ready: 'success',
  active: 'success',
  complete: 'success',
  enabled: 'success',
  pending: 'warning',
  queued: 'info',
  building: 'info',
  failed: 'destructive',
  superseded: 'secondary',
  disabled: 'destructive',
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation();
  if (!value) return <Badge variant="outline">{t('common.none')}</Badge>;
  const variant: Variant = variantByStatus[value] ?? 'outline';
  return <Badge variant={variant}>{value}</Badge>;
}
