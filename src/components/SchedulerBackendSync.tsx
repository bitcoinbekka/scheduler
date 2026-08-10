import { useEffect } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { setSchedulerBaseUrl } from '@/lib/schedulerApi';

/**
 * Keeps the scheduler API client's base URL in sync with AppConfig.
 *
 * The scheduler API functions (scheduleEvent, checkEventStatus, etc.) are
 * plain module functions rather than hooks, so they read the base URL from a
 * module-level variable. This component bridges the reactive AppConfig value
 * into that module whenever the user changes the backend URL in Settings.
 */
export function SchedulerBackendSync() {
  const { config } = useAppContext();

  useEffect(() => {
    setSchedulerBaseUrl(config.schedulerBackendUrl ?? '');
  }, [config.schedulerBackendUrl]);

  return null;
}
