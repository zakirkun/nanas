import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronsUpDown, Check, Plus, Boxes } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useProjectsList } from '@/features/projects/queries';
import { shortId } from '@/lib/utils';

export function ProjectSwitcher({ activeId }: { activeId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useProjectsList();
  const projects = data?.projects ?? [];
  const active = activeId ? projects.find((p) => p.id === activeId) : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Boxes className="h-4 w-4" />
          <span className="max-w-[16ch] truncate">
            {active?.name ?? (isLoading ? t('common.loading') : t('nav.projects'))}
          </span>
          {active ? (
            <span className="hidden text-xs font-mono text-muted-foreground md:inline">
              {shortId(active.id)}
            </span>
          ) : null}
          <ChevronsUpDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t('nav.projects')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.length === 0 ? (
          <DropdownMenuItem disabled>{t('projects.noProjects')}</DropdownMenuItem>
        ) : (
          projects.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => navigate(`/app/projects/${p.id}`)}
              className="flex items-center gap-2"
            >
              {active?.id === p.id ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <span className="h-3.5 w-3.5" />
              )}
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {p.provision_status}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/app/projects?new=1')}>
          <Plus className="mr-2 h-4 w-4" /> {t('projects.newProject')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
