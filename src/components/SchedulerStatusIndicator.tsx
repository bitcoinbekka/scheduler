import { Link } from 'react-router-dom';
import { Loader2, ServerCog } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSchedulerHealth, type SchedulerHealthStatus } from '@/hooks/useSchedulerHealth';
import { cn } from '@/lib/utils';

const STATUS_META: Record<SchedulerHealthStatus, { dot: string; label: string; text: string; hint: string }> = {
  online: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    label: 'Scheduler online',
    hint: 'Backend reachable and storage connected. Scheduled posts will publish automatically — safe to close this tab.',
  },
  degraded: {
    dot: 'bg-amber-500 animate-pulse-dot',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Scheduler degraded',
    hint: 'Backend is reachable but storage is not configured. Server-side scheduling will fail. Check your backend configuration.',
  },
  offline: {
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    label: 'Scheduler offline',
    hint: 'Backend unreachable. Posts fall back to local publishing, which requires this tab to stay open. Configure a backend in Settings.',
  },
};

/**
 * Compact scheduler backend status shown in the sidebar. Clicking it links to
 * Settings where the backend URL can be configured and tested.
 */
export function SchedulerStatusIndicator() {
  const { status, isLoading } = useSchedulerHealth();
  const meta = STATUS_META[status];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/settings"
          className="flex items-center gap-2 mx-3 mb-2 px-3 py-2 rounded-lg bg-secondary/40 hover:bg-secondary transition-colors"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          ) : (
            <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)} />
          )}
          <span className={cn('text-xs font-medium flex-1 truncate', isLoading ? 'text-muted-foreground' : meta.text)}>
            {isLoading ? 'Checking scheduler…' : meta.label}
          </span>
          <ServerCog className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[240px]">
        <p className="text-xs">{meta.hint}</p>
      </TooltipContent>
    </Tooltip>
  );
}
