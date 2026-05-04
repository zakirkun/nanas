import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Menu, User, Bell, Plus, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LangSwitch, ThemeSwitch } from './LangSwitch';
import { useSession } from '@/auth/session';
import { ProjectSwitcher } from './ProjectSwitcher';
import { useState } from 'react';
import { Sheet } from './Sheet';
import { Sidebar } from './Sidebar';
import { GlobalSearch } from './GlobalSearch';
import { useProject } from '@/features/projects/queries';
import { Badge } from '@/components/ui/badge';
import { useRealtime } from '@/hooks/useRealtime';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCreateProject } from '@/features/projects/queries';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TopbarProps {
  projectId?: string;
}

export function Topbar({ projectId }: TopbarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const clear = useSession((s) => s.clear);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: project } = useProject(projectId);
  const rt = useRealtime(projectId, {
    channels: ['triggers', 'objects', 'entrypoint'],
    enabled: !!projectId,
  });
  const createProject = useCreateProject();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>
      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)}>
        <Sidebar projectId={projectId} />
      </Sheet>
      <div className="flex flex-1 items-center gap-2 overflow-hidden">
        <ProjectSwitcher activeId={projectId} />
        <GlobalSearch projectId={projectId} />
      </div>
      {projectId && project ? (
        <div className="hidden items-center gap-1 md:flex text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          <span className="max-w-[120px] truncate">{project.region}</span>
        </div>
      ) : null}
      {projectId ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {rt.events.length > 0 ? (
                <Badge className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-0.5 text-[10px]" variant="destructive">
                  {Math.min(9, rt.events.length)}
                </Badge>
              ) : null}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('topbar.notifications', 'Realtime feed')}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[360px] space-y-2 overflow-auto text-xs">
              {rt.events.length === 0 ? (
                <p className="text-muted-foreground">{t('common.empty')}</p>
              ) : (
                rt.events.slice(0, 40).map((ev, i) => (
                  <pre key={i} className="rounded bg-muted p-2 font-mono">
                    {JSON.stringify({ channel: ev.channel, payload: ev.payload }, null, 2)}
                  </pre>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('projects.createProject')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="np-name">{t('common.name')}</Label>
            <Input id="np-name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
          </div>
          <Button
            className="w-full"
            disabled={!newProjectName.trim() || createProject.isPending}
            onClick={async () => {
              const p = await createProject.mutateAsync({ name: newProjectName.trim() });
              setNewProjectOpen(false);
              setNewProjectName('');
              navigate(`/app/projects/${p.id}`);
            }}
          >
            {t('projects.createProject')}
          </Button>
        </DialogContent>
      </Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
            <Plus className="mr-1 h-4 w-4" /> {t('topbar.quickMenu', 'New')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setNewProjectOpen(true);
            }}
          >
            {t('topbar.quickNewProject', 'New project')}
          </DropdownMenuItem>
          {projectId ? (
            <>
              <DropdownMenuItem onClick={() => navigate(`/app/projects/${projectId}/functions`)}>
                {t('functions.newFunction')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/app/projects/${projectId}/triggers`)}>
                {t('topbar.quickNewTrigger', 'New trigger')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/app/projects/${projectId}/keys`)}>
                {t('topbar.quickMintKey', 'Mint API key')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ThemeSwitch />
      <LangSwitch />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden md:inline">{user?.email ?? '—'}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t('common.loggedInAs')}</DropdownMenuLabel>
          <DropdownMenuItem disabled>
            <span className="truncate">{user?.email ?? '—'}</span>
          </DropdownMenuItem>
          {user?.platform_role ? (
            <DropdownMenuItem disabled className="text-xs uppercase tracking-wider">
              {user.platform_role}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              clear();
              navigate('/login');
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> {t('common.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
