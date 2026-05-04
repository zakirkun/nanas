import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, rawFetch } from '@/api/client';
import { isProblem, ProblemError } from '@/api/problem';

export interface TriggerListItem {
  id: string;
  type: 'http' | 'cron' | 'db_poll' | 'object' | string;
  target_fn: string;
  target_fn_name?: string | null;
  config: unknown;
  enabled: boolean;
  last_fired_at?: string | null;
  last_dispatch_status?: string | null;
  dispatch_count: number;
  dlq_count: number;
  created_at: string;
}

export const triggerKeys = {
  all: (pid: string) => ['triggers', pid] as const,
  list: (pid: string) => ['triggers', pid, 'list'] as const,
  detail: (pid: string, tid: string) => ['triggers', pid, 'detail', tid] as const,
  status: (pid: string, tid: string) => ['triggers', pid, 'status', tid] as const,
};

export function useTriggersList(pid: string | undefined) {
  return useQuery({
    queryKey: pid ? triggerKeys.list(pid) : ['triggers', 'noop'],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/triggers', {
        params: { path: { pid: pid! } },
      });
      if (error) throw error;
      return ((data as { triggers?: TriggerListItem[] } | undefined)?.triggers ?? []) as TriggerListItem[];
    },
  });
}

export function useToggleTrigger(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { tid: string; enabled: boolean }) => {
      const { data, error } = await api.PATCH('/v1/projects/{pid}/triggers/{tid}', {
        params: { path: { pid, tid: vars.tid } },
        body: { enabled: vars.enabled },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: triggerKeys.list(pid) }),
  });
}

export function useTestFireTrigger(pid: string) {
  return useMutation({
    mutationFn: async (tid: string) => {
      const res = await rawFetch(`/v1/projects/${pid}/triggers/${tid}/test-fire`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (isProblem(body)) throw new ProblemError(res.status, body);
        throw new Error('Failed');
      }
      return body;
    },
  });
}

export function useTriggerStatus(pid: string | undefined, tid: string | undefined) {
  return useQuery({
    queryKey: pid && tid ? triggerKeys.status(pid, tid) : ['triggers', 'noop'],
    enabled: !!pid && !!tid,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/triggers/{tid}/status', {
        params: { path: { pid: pid!, tid: tid! } },
      });
      if (error) throw error;
      return data as {
        trigger_id: string;
        enabled: boolean;
        dispatch_count: number;
        dlq_count: number;
        last_fired_at: string | null;
        last_dispatch_status: string | null;
      };
    },
  });
}
