import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, UserPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { rawFetch } from '@/api/client';
import { ProblemError, isProblem } from '@/api/problem';

const schema = z.object({
  email: z.string().email(),
  role: z.enum(['viewer', 'developer', 'admin']),
});
type FormValues = z.infer<typeof schema>;

export function ProjectMembersTab() {
  const { t } = useTranslation();
  const { pid } = useParams();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', role: 'developer' },
  });

  const grant = useMutation({
    mutationFn: async (vars: FormValues) => {
      const res = await rawFetch(`/v1/projects/${pid}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (isProblem(body)) throw new ProblemError(res.status, body);
        throw new Error('Failed');
      }
      return body as { user_id: string; role: string };
    },
    onSuccess: () => {
      toast.success(t('projects.members.addedToast'));
      form.reset();
      setError(null);
    },
    onError: (e) => setError(e),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('projects.members.addMember')}</CardTitle>
          <CardDescription>{t('projects.members.userIdHelper')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit((v) => grant.mutate(v))}
            className="space-y-3"
            noValidate
          >
            {error ? <ProblemAlert error={error} /> : null}
            <div className="space-y-1.5">
              <Label htmlFor="member-email">{t('common.email')}</Label>
              <Input id="member-email" type="email" {...form.register('email')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-role">{t('projects.members.role')}</Label>
              <Select
                value={form.watch('role')}
                onValueChange={(v) => form.setValue('role', v as FormValues['role'])}
              >
                <SelectTrigger id="member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">viewer</SelectItem>
                  <SelectItem value="developer">developer</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={grant.isPending} className="w-full sm:w-auto">
              <UserPlus className="mr-2 h-4 w-4" /> {t('projects.members.addMember')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">{t('projects.tabs.members')}</CardTitle>
          <CardDescription>
            Project members are stored in the platform DB. The control plane currently exposes a
            grant endpoint only — listing happens via audit log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              POST /v1/projects/:pid/members
            </p>
            <p className="mt-2">
              Roles: <code className="font-mono">viewer</code>,{' '}
              <code className="font-mono">developer</code>,{' '}
              <code className="font-mono">admin</code>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
