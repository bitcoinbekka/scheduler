import { useState, useEffect } from 'react';
import { Server, CheckCircle2, AlertTriangle, XCircle, Loader2, RotateCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppContext } from '@/hooks/useAppContext';
import { useSchedulerHealth } from '@/hooks/useSchedulerHealth';
import { useToast } from '@/hooks/useToast';
import { checkSchedulerHealth, DEFAULT_SCHEDULER_PATH } from '@/lib/schedulerApi';
import { cn } from '@/lib/utils';

export function SchedulerBackendSettings() {
  const { config, updateConfig } = useAppContext();
  const { status, data, isLoading, refetch } = useSchedulerHealth();
  const { toast } = useToast();

  const [draftUrl, setDraftUrl] = useState(config.schedulerBackendUrl ?? '');
  const [testing, setTesting] = useState(false);

  // Keep the input in sync if config changes elsewhere.
  useEffect(() => {
    setDraftUrl(config.schedulerBackendUrl ?? '');
  }, [config.schedulerBackendUrl]);

  const dirty = (draftUrl.trim().replace(/\/+$/, '')) !== (config.schedulerBackendUrl ?? '').replace(/\/+$/, '');

  const handleSave = () => {
    const cleaned = draftUrl.trim().replace(/\/+$/, '');
    updateConfig(c => ({ ...c, schedulerBackendUrl: cleaned }));
    toast({
      title: 'Backend saved',
      description: cleaned
        ? `Using custom backend: ${cleaned}`
        : 'Using the built-in default backend.',
    });
    // Give the sync effect a tick, then re-check health.
    setTimeout(() => refetch(), 100);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await checkSchedulerHealth(draftUrl);
      const storageOk = result.storage === 'connected' || result.method === 'ready';
      toast({
        title: result.ok ? 'Backend reachable' : 'Backend responded with an error',
        description: storageOk
          ? 'Storage is connected. Scheduled posts will publish.'
          : 'Reachable, but storage is not configured — posts will not publish server-side.',
        variant: result.ok && storageOk ? 'default' : 'destructive',
      });
    } catch (err) {
      toast({
        title: 'Backend unreachable',
        description: err instanceof Error ? err.message : 'Could not connect to the scheduler backend.',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleReset = () => {
    setDraftUrl('');
    updateConfig(c => ({ ...c, schedulerBackendUrl: '' }));
    toast({ title: 'Reset to default backend' });
    setTimeout(() => refetch(), 100);
  };

  const statusConfig = {
    online: { icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Online', desc: 'Backend reachable and storage connected. Scheduled posts publish automatically.' },
    degraded: { icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Degraded', desc: 'Reachable, but storage is not configured. Server-side scheduling will fail.' },
    offline: { icon: XCircle, className: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Offline', desc: 'Backend unreachable. Posts fall back to local publishing (this tab must stay open).' },
  }[status];

  const StatusIcon = statusConfig.icon;
  const activeBackend = config.schedulerBackendUrl || `${DEFAULT_SCHEDULER_PATH} (built-in default)`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Server className="w-4 h-4" />
          Scheduler Backend
        </CardTitle>
        <CardDescription>
          The backend stores your pre-signed posts and publishes them at the scheduled time.
          Leave blank to use the built-in backend, or point it at your own self-hosted server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live status */}
        <div className={cn('flex items-start gap-3 p-3 rounded-lg border', statusConfig.bg)}>
          {isLoading ? (
            <Loader2 className="w-5 h-5 mt-0.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <StatusIcon className={cn('w-5 h-5 mt-0.5 shrink-0', statusConfig.className)} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className={cn('text-sm font-semibold', statusConfig.className)}>
                {isLoading ? 'Checking…' : statusConfig.label}
              </p>
              <button
                onClick={() => refetch()}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Re-check now"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{statusConfig.desc}</p>
            <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
              {activeBackend}
            </p>
            {data?.storage && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Storage: <span className="font-medium">{data.storage}</span>
              </p>
            )}
          </div>
        </div>

        {/* Backend URL input */}
        <div className="space-y-2">
          <Label htmlFor="scheduler-backend-url">Backend URL</Label>
          <Input
            id="scheduler-backend-url"
            type="url"
            inputMode="url"
            placeholder="https://scheduler.your-server.com"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Full origin of your self-hosted scheduler (no trailing slash needed).
            Leave empty to use the default backend bundled with this deployment.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={!dirty}>
            Save
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Test connection
          </Button>
          {config.schedulerBackendUrl && (
            <Button variant="ghost" onClick={handleReset}>
              Reset to default
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
