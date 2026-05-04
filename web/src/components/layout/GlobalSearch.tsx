import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk';
import { Code2, FolderOpen, LayoutDashboard, Plus, Radio, Search, Webhook } from 'lucide-react';
import { useProjectsList } from '@/features/projects/queries';
import { useFunctionsList } from '@/features/functions/queries';
import { api } from '@/api/client';
import { useQuery } from '@tanstack/react-query';

interface GlobalSearchProps {
  projectId?: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}

export function GlobalSearch({ projectId, open: controlledOpen, onOpenChange }: GlobalSearchProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const projects = useProjectsList();
  const fns = useFunctionsList(projectId, 1, 100, {});
  const triggers = useQuery({
    queryKey: ['triggers', projectId, 'search'],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/triggers', { params: { path: { pid: projectId! } } });
      if (error) throw error;
      return ((data as { triggers?: { id: string; type: string; target_fn: string }[] })?.triggers ?? []) as {
        id: string;
        type: string;
        target_fn: string;
      }[];
    },
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [open, setOpen]);

  const projectRows = useMemo(() => projects.data?.projects ?? [], [projects.data]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
      >
        <Search className="h-3.5 w-3.5" />
        <span>{t('topbar.searchPlaceholder', 'Search…')}</span>
        <kbd className="ml-2 rounded border bg-background px-1 font-mono text-[10px]">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t('topbar.searchPlaceholder', 'Search…')} />
        <CommandList>
          <CommandEmpty>{t('common.empty')}</CommandEmpty>
          <CommandGroup heading={t('nav.projects', 'Projects')}>
            {projectRows.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.name} ${p.id}`}
                onSelect={() => {
                  navigate(`/app/projects/${p.id}`);
                  setOpen(false);
                }}
              >
                <FolderOpen className="mr-2 h-4 w-4" /> {p.name}
              </CommandItem>
            ))}
            <CommandItem
              value="new-project"
              onSelect={() => {
                navigate('/app/projects');
                setOpen(false);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> {t('topbar.quickNewProject', 'New project')}
            </CommandItem>
          </CommandGroup>
          {projectId ? (
            <>
              <CommandGroup heading={t('nav.overview', 'Overview')}>
                <CommandItem
                  onSelect={() => {
                    navigate(`/app/projects/${projectId}`);
                    setOpen(false);
                  }}
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" /> overview
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading={t('nav.functions', 'Functions')}>
                {(fns.data ?? []).map((fn) => (
                  <CommandItem
                    key={fn.id}
                    value={`${fn.name} ${fn.slug ?? ''}`}
                    onSelect={() => {
                      navigate(`/app/projects/${projectId}/functions/${fn.id}`);
                      setOpen(false);
                    }}
                  >
                    <Code2 className="mr-2 h-4 w-4" /> {fn.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading={t('nav.triggers', 'Triggers')}>
                {(triggers.data ?? []).map((tr) => (
                  <CommandItem
                    key={tr.id}
                    value={`${tr.type} ${tr.id}`}
                    onSelect={() => {
                      navigate(`/app/projects/${projectId}/triggers`);
                      setOpen(false);
                    }}
                  >
                    <Webhook className="mr-2 h-4 w-4" /> {tr.type} · {tr.id.slice(0, 8)}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading={t('nav.realtime', 'Realtime')}>
                <CommandItem
                  onSelect={() => {
                    navigate(`/app/projects/${projectId}/realtime`);
                    setOpen(false);
                  }}
                >
                  <Radio className="mr-2 h-4 w-4" /> open realtime
                </CommandItem>
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
