import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { checkSchedulerHealth, type HealthResponse } from '@/lib/schedulerApi';

export type SchedulerHealthStatus = 'online' | 'degraded' | 'offline';

export interface SchedulerHealth {
  status: SchedulerHealthStatus;
  /** Raw health payload, if the backend responded. */
  data: HealthResponse | null;
  /** Whether backend storage is connected/configured. */
  storageReady: boolean;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Polls the configured scheduler backend's health endpoint so the UI can
 * surface whether scheduled publishing is actually working.
 *
 * - `online`   → backend reachable AND storage connected (posts will publish)
 * - `degraded` → backend reachable BUT storage not configured (won't publish)
 * - `offline`  → backend unreachable (falls back to local, tab-open publishing)
 */
export function useSchedulerHealth(): SchedulerHealth {
  const { config } = useAppContext();
  const backendUrl = config.schedulerBackendUrl ?? '';

  const query = useQuery({
    queryKey: ['scheduler-health', backendUrl],
    queryFn: () => checkSchedulerHealth(),
    // Re-check periodically so a backend that comes back online is detected.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 30_000,
  });

  let status: SchedulerHealthStatus = 'offline';
  let storageReady = false;

  if (query.data) {
    storageReady =
      query.data.storage === 'connected' || query.data.method === 'ready';
    status = query.data.ok
      ? storageReady
        ? 'online'
        : 'degraded'
      : 'offline';
  } else if (query.isError) {
    status = 'offline';
  }

  return {
    status,
    data: query.data ?? null,
    storageReady,
    isLoading: query.isLoading,
    refetch: () => query.refetch(),
  };
}
