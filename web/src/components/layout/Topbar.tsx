import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Menu, User } from 'lucide-react';
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

interface TopbarProps {
  projectId?: string;
}

export function Topbar({ projectId }: TopbarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const clear = useSession((s) => s.clear);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
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
      <div className="flex-1">
        <ProjectSwitcher activeId={projectId} />
      </div>
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
