import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { addCached } from '@/lib/localCache';

export interface FunctionRecord {
  fn_id: string;
  name: string;
}

export interface FunctionListItem {
  id: string;
  name: string;
  slug?: string | null;
  current_version?: string | null;
  runtime?: string | null;
  last_deployed_at?: string | null;
  last_deployment_status?: string | null;
  triggers_count: number;
  entrypoint_enabled: boolean;
  created_at: string;
}

export interface FunctionDetail {
  fn_id: string;
  name: string;
  slug?: string | null;
  current_version?: string | null;
  created_at: string;
  entrypoint?: { enabled: boolean; auth_mode: string };
}

export interface FunctionVersionRow {
  id: string;
  version: string;
  runtime: string;
  checksum: string;
  build_status: 'queued' | 'building' | 'complete' | 'failed' | string;
  source_uri: string;
  build_job_id: string;
  job_status: string;
  job_log: string;
  created_at: string;
}

export interface DeploymentRow {
  id: string;
  fn_version_id: string;
  version: string;
  runtime: string;
  region: string;
  status: 'deploying' | 'active' | 'superseded' | 'failed' | 'rolled_back' | string;
  strategy: string;
  resources: unknown;
  env: unknown;
  health_check_path?: string | null;
  timeout_ms: number;
  started_at: string;
  finished_at?: string | null;
  error_message?: string | null;
}

export interface VersionRegisterResult {
  version_id: string;
  version: string;
  build_job_id: string;
  build_status: string;
}

export interface BuildSummary {
  version_id: string;
  version: string;
  runtime: string;
  checksum: string;
  build_status: 'queued' | 'building' | 'complete' | 'failed' | string;
  source_uri: string;
  build_job_id: string;
  job_status: string;
  job_log: string;
}

export const functionKeys = {
  all: (pid: string) => ['functions', pid] as const,
  list: (pid: string, page: number, filters: unknown) =>
    ['functions', pid, 'list', page, filters] as const,
  detail: (pid: string, fid: string) => ['functions', pid, 'detail', fid] as const,
  versions: (pid: string, fid: string) => ['functions', pid, 'versions', fid] as const,
  deployments: (pid: string, fid: string) => ['functions', pid, 'deployments', fid] as const,
};

export function useFunctionsList(
  pid: string | undefined,
  page: number,
  pageSize: number,
  filters: unknown,
) {
  return useQuery({
    queryKey: pid ? functionKeys.list(pid, page, filters) : ['functions', 'noop'],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/functions', {
        params: { path: { pid: pid! }, query: { limit: pageSize, offset: (page - 1) * pageSize } },
      });
      if (error) throw error;
      return ((data as { functions?: FunctionListItem[] } | undefined)?.functions ?? []) as FunctionListItem[];
    },
  });
}

export function useFunctionDetail(pid: string | undefined, fid: string | undefined) {
  return useQuery({
    queryKey: pid && fid ? functionKeys.detail(pid, fid) : ['functions', 'noop'],
    enabled: !!pid && !!fid,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/functions/{fid}', {
        params: { path: { pid: pid!, fid: fid! } },
      });
      if (error) throw error;
      return data as FunctionDetail;
    },
  });
}

export function useFunctionVersions(pid: string | undefined, fid: string | undefined) {
  return useQuery({
    queryKey: pid && fid ? functionKeys.versions(pid, fid) : ['functions', 'noop'],
    enabled: !!pid && !!fid,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/functions/{fid}/versions', {
        params: { path: { pid: pid!, fid: fid! } },
      });
      if (error) throw error;
      return ((data as { versions?: FunctionVersionRow[] } | undefined)?.versions ?? []) as FunctionVersionRow[];
    },
  });
}

export function useFunctionDeployments(pid: string | undefined, fid: string | undefined) {
  return useQuery({
    queryKey: pid && fid ? functionKeys.deployments(pid, fid) : ['functions', 'noop'],
    enabled: !!pid && !!fid,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/projects/{pid}/functions/{fid}/deployments', {
        params: { path: { pid: pid!, fid: fid! } },
      });
      if (error) throw error;
      return ((data as { deployments?: DeploymentRow[] } | undefined)?.deployments ?? []) as DeploymentRow[];
    },
  });
}

export function useDeploymentByID(did: string | undefined, options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: did ? ['deployments', did] : ['deployments', 'noop'],
    enabled: !!did,
    refetchInterval: options?.refetchInterval ?? 1500,
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/deployments/{did}', {
        params: { path: { did: did! } },
      });
      if (error) throw error;
      return (data as { deployment?: DeploymentRow } | undefined)?.deployment ?? null;
    },
  });
}

export function useCreateFunction(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { name: string }) => {
      const { data, error } = await api.POST('/v1/projects/{pid}/functions', {
        params: { path: { pid: projectId } },
        body: vars,
      });
      if (error) throw error;
      return data as FunctionRecord;
    },
    onSuccess: (fn) => {
      addCached('functions', projectId, { id: fn.fn_id, name: fn.name });
      qc.invalidateQueries({ queryKey: functionKeys.all(projectId) });
    },
  });
}

export function usePresignArtifact(projectId: string, fid: string) {
  return useMutation({
    mutationFn: async (vars: { version: string; expires?: number }) => {
      const res = await api.POST(
        '/v1/projects/{pid}/functions/{fid}/artifacts/presign',
        { params: { path: { pid: projectId, fid } }, body: vars },
      );
      if (res.error) throw res.error;
      return res.data as { upload_url: string; method: string; bucket: string; artifact_key: string };
    },
  });
}

export function useRegisterVersion(projectId: string, fid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      version: string;
      runtime?: string;
      checksum?: string;
      artifact_key?: string;
      source_uri?: string;
    }) => {
      const { data, error } = await api.POST(
        '/v1/projects/{pid}/functions/{fid}/versions',
        { params: { path: { pid: projectId, fid } }, body: vars },
      );
      if (error) throw error;
      return data as VersionRegisterResult;
    },
    onSuccess: (v) => {
      addCached(`versions:${fid}`, projectId, {
        id: v.version_id,
        name: v.version,
        meta: { build_status: v.build_status, build_job_id: v.build_job_id },
      });
      qc.invalidateQueries({ queryKey: functionKeys.versions(projectId, fid) });
    },
  });
}

export function useBuildStatus(projectId: string, fid: string, vid: string | undefined) {
  return useQuery({
    queryKey: ['build', projectId, fid, vid],
    enabled: !!vid,
    refetchInterval: (q) => {
      const data = q.state.data as BuildSummary | undefined;
      return data && (data.build_status === 'complete' || data.build_status === 'failed') ? false : 2500;
    },
    queryFn: async () => {
      const { data, error } = await api.GET(
        '/v1/projects/{pid}/functions/{fid}/versions/{vid}/build',
        { params: { path: { pid: projectId, fid, vid: vid! } } },
      );
      if (error) throw error;
      return data as BuildSummary;
    },
  });
}

export function useDeploy(projectId: string, fid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      version?: string;
      region?: string;
      strategy?: string;
      resources?: { cpu?: string; memory?: string; max_concurrency?: number };
      env?: Record<string, string>;
      health_check_path?: string;
      timeout_ms?: number;
    }) => {
      const { data, error } = await api.POST(
        '/v1/projects/{pid}/functions/{fid}/deploy',
        { params: { path: { pid: projectId, fid } }, body: vars },
      );
      if (error) throw error;
      return data as { deployment_id: string; status: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: functionKeys.deployments(projectId, fid) });
      qc.invalidateQueries({ queryKey: functionKeys.all(projectId) });
    },
  });
}

export function useRollback(projectId: string, fid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST(
        '/v1/projects/{pid}/functions/{fid}/deployments/rollback',
        { params: { path: { pid: projectId, fid } } },
      );
      if (error) throw error;
      return data as { deployment_id: string; status: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: functionKeys.deployments(projectId, fid) }),
  });
}

export function useInvoke(projectId: string, fid: string) {
  return useMutation({
    mutationFn: async (vars: { input: unknown }) => {
      const { data, error } = await api.POST(
        '/v1/projects/{pid}/functions/{fid}/invoke',
        {
          params: { path: { pid: projectId, fid } },
          body: vars as { input: unknown },
        },
      );
      if (error) throw error;
      return data;
    },
  });
}

export function useInvokeAsync(projectId: string, fid: string) {
  return useMutation({
    mutationFn: async (vars: { input: unknown }) => {
      const { data, error } = await api.POST(
        '/v1/projects/{pid}/functions/{fid}/invoke/async',
        {
          params: { path: { pid: projectId, fid } },
          body: vars as { input: unknown },
        },
      );
      if (error) throw error;
      return data as { enqueue_id: string; status: string };
    },
  });
}

export interface EntrypointConfig {
  id?: string;
  function?: string;
  auth_mode: 'public' | 'signed' | 'project_key';
  enabled: boolean;
  public_url?: string;
  project_slug?: string;
  function_slug?: string;
  secret_token?: string;
}

export function useEntrypoint(projectId: string, fid: string) {
  return useQuery({
    queryKey: ['entrypoint', projectId, fid],
    enabled: !!fid,
    queryFn: async () => {
      const { data, error } = await api.GET(
        '/v1/projects/{pid}/functions/{fid}/entrypoint',
        { params: { path: { pid: projectId, fid } } },
      );
      if (error) {
        if ((error as { status?: number }).status === 404) return null;
        throw error;
      }
      return data as EntrypointConfig;
    },
    retry: false,
  });
}

export function useUpsertEntrypoint(projectId: string, fid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { auth_mode: EntrypointConfig['auth_mode']; enabled: boolean }) => {
      const { data, error } = await api.POST(
        '/v1/projects/{pid}/functions/{fid}/entrypoint',
        { params: { path: { pid: projectId, fid } }, body: vars },
      );
      if (error) throw error;
      return data as EntrypointConfig;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entrypoint', projectId, fid] }),
  });
}
