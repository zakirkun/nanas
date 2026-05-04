import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Rocket } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { useDeploy, useRollback } from './queries';

export function DeploymentsTab() {
  const { t } = useTranslation();
  const { pid, fid } = useParams();
  const [version, setVersion] = useState('');
  const [region, setRegion] = useState('default');
  const [error, setError] = useState<unknown>(null);
  const [last, setLast] = useState<{ deployment_id: string; status: string } | null>(null);

  const deploy = useDeploy(pid!, fid!);
  const rollback = useRollback(pid!, fid!);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4" /> {t('functions.deployments.deploy')}
          </CardTitle>
          <CardDescription>Promotes a complete build to active.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <ProblemAlert error={error} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dep-ver">{t('functions.versions.version')}</Label>
              <Input
                id="dep-ver"
                placeholder="0.1.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-region">Region</Label>
              <Input
                id="dep-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={async () => {
              setError(null);
              try {
                const r = await deploy.mutateAsync({ version, region });
                setLast(r);
                toast.success(t('functions.deployments.deployed'));
              } catch (e) {
                setError(e);
              }
            }}
            disabled={deploy.isPending}
          >
            {deploy.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('functions.deployments.deploy')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4" /> {t('functions.deployments.rollback')}
          </CardTitle>
          <CardDescription>
            Reactivates the previous deployment for this function.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="destructive"
            onClick={async () => {
              setError(null);
              try {
                const r = await rollback.mutateAsync();
                setLast(r);
                toast.success(t('functions.deployments.rolledBack'));
              } catch (e) {
                setError(e);
              }
            }}
            disabled={rollback.isPending}
          >
            {rollback.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('functions.deployments.rollback')}
          </Button>
        </CardContent>
      </Card>

      {last ? (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Last deployment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">deployment_id:</span>{' '}
              <code className="font-mono">{last.deployment_id}</code>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">status:</span>
              <Badge variant={last.status === 'active' ? 'success' : 'outline'}>
                {last.status}
              </Badge>
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
