import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { addCached } from '@/lib/localCache';

export interface FunctionRecord {
  fn_id: string;
  name: string;
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
      qc.invalidateQueries({ queryKey: ['functions', projectId] });
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
      qc.invalidateQueries({ queryKey: ['versions', projectId, fid] });
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
    mutationFn: async (vars: { version?: string; region?: string }) => {
      const { data, error } = await api.POST(
        '/v1/projects/{pid}/functions/{fid}/deploy',
        { params: { path: { pid: projectId, fid } }, body: vars },
      );
      if (error) throw error;
      return data as { deployment_id: string; status: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments', projectId, fid] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments', projectId, fid] }),
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
        // 404 = not configured yet — return null instead of throwing
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
