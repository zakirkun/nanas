import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { useBuildStatus } from './queries';
import { useLocalCache } from '@/hooks/useLocalCache';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function BuildsTab() {
  const { t } = useTranslation();
  const { pid, fid } = useParams();
  const versions = useLocalCache(`versions:${fid}`, pid);
  const [vid, setVid] = useState<string>(versions[0]?.id ?? '');

  const build = useBuildStatus(pid!, fid!, vid);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('functions.versions.buildStatus')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vid-select">{t('functions.versions.version')}</Label>
              <Select value={vid} onValueChange={setVid}>
                <SelectTrigger id="vid-select">
                  <SelectValue placeholder="Pick a version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name ?? v.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vid-input">Version ID</Label>
              <Input
                id="vid-input"
                value={vid}
                onChange={(e) => setVid(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          {build.error ? <ProblemAlert error={build.error} /> : null}
          {build.data ? (
            <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm">
              <Row label="version" value={build.data.version} />
              <Row label="runtime" value={build.data.runtime} />
              <Row
                label="build_status"
                value={
                  <Badge variant={build.data.build_status === 'complete' ? 'success' : build.data.build_status === 'failed' ? 'destructive' : 'info'}>
                    {build.data.build_status}
                  </Badge>
                }
              />
              <Row label="job_status" value={build.data.job_status} />
              <Row label="checksum" value={<code className="font-mono">{build.data.checksum}</code>} />
              <Row label="source_uri" value={<code className="font-mono">{build.data.source_uri}</code>} />
              {build.data.job_log ? (
                <pre className="mt-2 max-h-[260px] overflow-auto rounded-md bg-background p-2 text-xs">
                  {build.data.job_log}
                </pre>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
