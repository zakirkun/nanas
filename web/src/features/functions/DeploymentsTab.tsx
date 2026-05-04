import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Rocket, Clock } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { CodeEditor } from '@/components/editor/CodeEditor';
import {
  useDeploy,
  useDeploymentByID,
  useFunctionDeployments,
  useFunctionVersions,
  useRollback,
} from './queries';

type Strategy = 'rolling' | 'canary' | 'recreate';

interface DeploySpec {
  version: string;
  region: string;
  strategy: Strategy;
  cpu: string;
  memory: string;
  max_concurrency: number;
  envText: string;
  health_check_path: string;
  timeout_ms: number;
}

const DEFAULT_SPEC: DeploySpec = {
  version: '',
  region: 'default',
  strategy: 'rolling',
  cpu: '200m',
  memory: '256Mi',
  max_concurrency: 10,
  envText: '{}',
  health_check_path: '/_health',
  timeout_ms: 5000,
};

export function DeploymentsTab() {
  const { t } = useTranslation();
  const { pid, fid } = useParams();
  const [spec, setSpec] = useState<DeploySpec>(DEFAULT_SPEC);
  const [error, setError] = useState<unknown>(null);
  const [activeDeploymentID, setActiveDeploymentID] = useState<string | null>(null);

  const versions = useFunctionVersions(pid, fid);
  const deployments = useFunctionDeployments(pid, fid);
  const deploy = useDeploy(pid!, fid!);
  const rollback = useRollback(pid!, fid!);

  // Poll the active deployment until it reaches a terminal state.
  const active = useDeploymentByID(activeDeploymentID ?? undefined, {
    refetchInterval: activeDeploymentID ? 1500 : false,
  });

  const completeVersions = (versions.data ?? []).filter((v) => v.build_status === 'complete');

  const onDeploy = async () => {
    setError(null);
    try {
      const env = parseEnvObject(spec.envText);
      const r = await deploy.mutateAsync({
        version: spec.version,
        region: spec.region,
        strategy: spec.strategy,
        resources: {
          cpu: spec.cpu,
          memory: spec.memory,
          max_concurrency: spec.max_concurrency,
        },
        env,
        health_check_path: spec.health_check_path,
        timeout_ms: spec.timeout_ms,
      });
      setActiveDeploymentID(r.deployment_id);
      toast.success(t('functions.deployments.deployed'));
    } catch (e) {
      setError(e);
    }
  };

  const onRollback = async () => {
    setError(null);
    try {
      const r = await rollback.mutateAsync();
      setActiveDeploymentID(r.deployment_id);
      toast.success(t('functions.deployments.rolledBack'));
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4" /> {t('functions.deployments.deploy')}
          </CardTitle>
          <CardDescription>
            POST /v1/projects/:pid/functions/:fid/deploy — strategy / resources / env / timeout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <ProblemAlert error={error} /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dep-ver">{t('functions.versions.version')}</Label>
              <Select
                value={spec.version}
                onValueChange={(v) => setSpec((s) => ({ ...s, version: v }))}
              >
                <SelectTrigger id="dep-ver">
                  <SelectValue placeholder="Pick a version" />
                </SelectTrigger>
                <SelectContent>
                  {completeVersions.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      no complete builds
                    </SelectItem>
                  ) : (
                    completeVersions.map((v) => (
                      <SelectItem key={v.id} value={v.version}>
                        v{v.version} · {v.runtime}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-strategy">strategy</Label>
              <Select
                value={spec.strategy}
                onValueChange={(v) => setSpec((s) => ({ ...s, strategy: v as Strategy }))}
              >
                <SelectTrigger id="dep-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rolling">rolling</SelectItem>
                  <SelectItem value="canary">canary</SelectItem>
                  <SelectItem value="recreate">recreate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="dep-region">region</Label>
              <Input
                id="dep-region"
                value={spec.region}
                onChange={(e) => setSpec((s) => ({ ...s, region: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-cpu">CPU</Label>
              <Input
                id="dep-cpu"
                value={spec.cpu}
                onChange={(e) => setSpec((s) => ({ ...s, cpu: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-mem">Memory</Label>
              <Input
                id="dep-mem"
                value={spec.memory}
                onChange={(e) => setSpec((s) => ({ ...s, memory: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="dep-conc">max_concurrency</Label>
              <Input
                id="dep-conc"
                type="number"
                min={1}
                value={spec.max_concurrency}
                onChange={(e) =>
                  setSpec((s) => ({ ...s, max_concurrency: Math.max(1, Number(e.target.value)) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-health">health_check_path</Label>
              <Input
                id="dep-health"
                value={spec.health_check_path}
                onChange={(e) => setSpec((s) => ({ ...s, health_check_path: e.target.value }))}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-timeout">timeout_ms</Label>
              <Input
                id="dep-timeout"
                type="number"
                min={100}
                value={spec.timeout_ms}
                onChange={(e) =>
                  setSpec((s) => ({ ...s, timeout_ms: Math.max(100, Number(e.target.value)) }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>env (JSON object of key/value strings)</Label>
            <CodeEditor
              value={spec.envText}
              onChange={(v) => setSpec((s) => ({ ...s, envText: v }))}
              language="json"
              minHeight="100px"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={onDeploy} disabled={deploy.isPending || !spec.version}>
              {deploy.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              {t('functions.deployments.deploy')}
            </Button>
            <Button variant="destructive" onClick={onRollback} disabled={rollback.isPending}>
              {rollback.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              {t('functions.deployments.rollback')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Live deployment
          </CardTitle>
          <CardDescription>Polls /v1/deployments/:did every 1.5s.</CardDescription>
        </CardHeader>
        <CardContent>
          {!activeDeploymentID ? (
            <p className="text-sm text-muted-foreground">No deployment in progress.</p>
          ) : active.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : active.data ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">deployment_id:</span>{' '}
                <code className="font-mono">{active.data.id}</code>
              </p>
              <p className="flex items-center gap-2">
                <span className="text-muted-foreground">status:</span>
                <Badge variant={statusBadge(active.data.status)}>{active.data.status}</Badge>
                {active.data.status === 'deploying' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
              </p>
              <p>
                <span className="text-muted-foreground">version:</span> v{active.data.version}
              </p>
              <p>
                <span className="text-muted-foreground">strategy:</span> {active.data.strategy}
              </p>
              <p>
                <span className="text-muted-foreground">started:</span>{' '}
                {format(new Date(active.data.started_at), 'yyyy-MM-dd HH:mm:ss')}
              </p>
              {active.data.error_message ? (
                <p className="text-destructive">{active.data.error_message}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Deployment history</CardTitle>
        </CardHeader>
        <CardContent>
          {deployments.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (deployments.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No deployments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>deployment</TableHead>
                  <TableHead>version</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>strategy</TableHead>
                  <TableHead>region</TableHead>
                  <TableHead>started</TableHead>
                  <TableHead>finished</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(deployments.data ?? []).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.id.slice(0, 8)}</TableCell>
                    <TableCell className="font-mono text-xs">v{d.version}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadge(d.status)}>{d.status}</Badge>
                    </TableCell>
                    <TableCell>{d.strategy}</TableCell>
                    <TableCell className="font-mono text-xs">{d.region}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(d.started_at), 'yyyy-MM-dd HH:mm')}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {d.finished_at ? format(new Date(d.finished_at), 'yyyy-MM-dd HH:mm') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function parseEnvObject(text: string): Record<string, string> {
  if (!text.trim()) return {};
  const v = JSON.parse(text) as unknown;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error('env must be a JSON object');
  }
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = typeof val === 'string' ? val : JSON.stringify(val);
  }
  return out;
}

function statusBadge(status: string): 'success' | 'destructive' | 'warning' | 'outline' | 'secondary' {
  if (status === 'active') return 'success';
  if (status === 'failed') return 'destructive';
  if (status === 'deploying') return 'warning';
  if (status === 'superseded' || status === 'rolled_back') return 'secondary';
  return 'outline';
}
