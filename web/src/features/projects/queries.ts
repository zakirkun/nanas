import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';

export interface Project {
  id: string;
  name: string;
  slug?: string | null;
  owner_id: string;
  region: string;
  provision_status: 'pending' | 'ready' | 'failed';
  provision_error?: string | null;
  tenant_db_name?: string | null;
  minio_bucket?: string | null;
  disabled: boolean;
  created_at: string;
}

export const projectKeys = {
  all: ['projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
  detail: (pid: string) => [...projectKeys.all, 'detail', pid] as const,
};

export function useProjectsList() {
  const token = useSession((s) => s.token);
  return useQuery({
    queryKey: projectKeys.list(),
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects', {});
      if (error) throw error;
      return (data as { projects?: Project[] } | undefined) ?? { projects: [] };
    },
  });
}

export function useProject(pid: string | undefined) {
  const token = useSession((s) => s.token);
  return useQuery({
    queryKey: pid ? projectKeys.detail(pid) : ['projects', 'detail', 'noop'],
    enabled: !!token && !!pid,
    refetchInterval: (q) => {
      const proj = q.state.data as Project | undefined;
      return proj?.provision_status === 'pending' ? 3000 : false;
    },
    queryFn: async () => {
      if (!pid) throw new Error('missing project id');
      const { data, error } = await api.GET('/v1/projects/{pid}', { params: { path: { pid } } });
      if (error) throw error;
      return data as Project;
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { name: string; region?: string }) => {
      const { data, error } = await api.POST('/v1/projects', { body: vars });
      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.list() }),
  });
}
