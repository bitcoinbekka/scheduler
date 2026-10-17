import { cancelScheduledEvent } from '@/lib/schedulerApi';
import type { SchedulerPost } from '@/lib/types';

export type CancelJobResult = 'cancelled' | 'gone' | 'published' | 'skipped' | 'error';

export function classifyCancelError(message: string): CancelJobResult {
  const m = message.toLowerCase();
  if (m.includes('not found') || m.includes('http 404')) return 'gone';
  if (m.includes('already published') || m.includes('http 409')) return 'published';
  return 'error';
}

/** Cancel a pending server job. 404 (already gone) is success. */
export async function cancelServerJob(serverEventId: string | null | undefined): Promise<CancelJobResult> {
  if (!serverEventId) return 'skipped';
  try {
    await cancelScheduledEvent(serverEventId);
    return 'cancelled';
  } catch (e) {
    return classifyCancelError(e instanceof Error ? e.message : String(e));
  }
}

export function isLiveAlarm(post: Pick<SchedulerPost, 'status' | 'serverEventId'>): boolean {
  if (post.status === 'published') return false;
  return post.status === 'scheduled' || Boolean(post.serverEventId);
}

export function asHeldDraft(post: SchedulerPost): SchedulerPost {
  return {
    ...post,
    status: 'draft',
    serverEventId: null,
  };
}
