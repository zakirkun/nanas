import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { useCreateProject } from './queries';
import { useNavigate } from 'react-router-dom';

const schema = z.object({
  name: z.string().min(1).max(120),
  region: z.string().max(40).optional(),
});

type FormValues = z.infer<typeof schema>;

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateProject();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', region: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const project = await create.mutateAsync({
        name: values.name,
        ...(values.region ? { region: values.region } : {}),
      });
      form.reset();
      onOpenChange(false);
      navigate(`/app/projects/${project.id}`);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('projects.createProject')}</DialogTitle>
          <DialogDescription>{t('projects.regionHelper')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
          {error ? <ProblemAlert error={error} /> : null}
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">{t('common.name')}</Label>
            <Input
              id="proj-name"
              autoFocus
              placeholder={t('projects.namePlaceholder')}
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-region">{t('projects.regionLabel')}</Label>
            <Input id="proj-region" placeholder="default" {...form.register('region')} />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('projects.createProject')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
