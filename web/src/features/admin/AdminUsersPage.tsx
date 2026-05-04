import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ShieldCheck, Save } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/data/EmptyState';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { Pagination } from '@/components/data/Pagination';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { api } from '@/api/client';
import { useSession, type PlatformRole } from '@/auth/session';

interface AdminUser {
  id: string;
  email: string;
  role?: string;
  platform_role: PlatformRole;
  created_at: string;
}

const ROLES: PlatformRole[] = ['user', 'staff', 'super_admin'];

export function AdminUsersPage() {
  const { t } = useTranslation();
  const me = useSession((s) => s.user);
  const isSuper = me?.platform_role === 'super_admin';
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const list = useQuery({
    queryKey: ['admin', 'users', page],
    queryFn: async () => {
      const { data, error } = await api.GET('/admin/users', {
        params: { query: { limit: pageSize, offset: (page - 1) * pageSize } },
      });
      if (error) throw error;
      return ((data as { users?: AdminUser[] } | undefined)?.users ?? []) as AdminUser[];
    },
  });

  const update = useMutation({
    mutationFn: async (vars: { id: string; platform_role: PlatformRole }) => {
      const { data, error } = await api.PATCH('/admin/users/{id}', {
        params: { path: { id: vars.id } },
        body: { platform_role: vars.platform_role } as { platform_role: PlatformRole },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(t('admin.rolesUpdated'));
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  return (
    <div>
      <PageHeader
        title={t('admin.users')}
        description="GET /admin/users · super_admin can edit roles"
      />
      {list.error ? <ProblemAlert error={list.error} /> : null}
      <Card>
        <CardContent className="pt-6">
          {list.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (list.data ?? []).length === 0 ? (
            <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title={t('common.empty')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.email')}</TableHead>
                  <TableHead>{t('admin.userRole')}</TableHead>
                  <TableHead>{t('common.createdAt')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    canEdit={isSuper && u.id !== me?.id}
                    onSave={(role) => update.mutate({ id: u.id, platform_role: role })}
                    busy={update.isPending}
                  />
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
    </div>
  );
}

function UserRow({
  user,
  canEdit,
  onSave,
  busy,
}: {
  user: AdminUser;
  canEdit: boolean;
  onSave: (role: PlatformRole) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [role, setRole] = useState<PlatformRole>(user.platform_role);
  const dirty = role !== user.platform_role;
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span>{user.email}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{user.id}</span>
        </div>
      </TableCell>
      <TableCell>
        {canEdit ? (
          <Select value={role} onValueChange={(v) => setRole(v as PlatformRole)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={user.platform_role === 'super_admin' ? 'default' : 'outline'}>
            {user.platform_role}
          </Badge>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {user.created_at ? format(new Date(user.created_at), 'yyyy-MM-dd') : '—'}
      </TableCell>
      <TableCell className="text-right">
        {canEdit ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || busy}
            onClick={() => onSave(role)}
          >
            <Save className="mr-2 h-3.5 w-3.5" /> {t('admin.saveRole')}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
