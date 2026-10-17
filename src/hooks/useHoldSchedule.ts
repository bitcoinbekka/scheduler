import { useCallback } from 'react';
import { useScheduler } from '@/contexts/SchedulerContext';
import { useToast } from '@/hooks/useToast';
import { asHeldDraft, cancelServerJob, type CancelJobResult } from '@/lib/holdSchedule';
import type { SchedulerPost } from '@/lib/types';

function blockedToast(result: CancelJobResult): { title: string; description: string } | null {
  if (result === 'published') {
    return {
      title: 'Already published',
      description: 'This post already went out.',
    };
  }
  if (result === 'error') {
    return {
      title: 'Could not reach the server',
      description: 'The original send time is still set. Try again.',
    };
  }
  return null;
}

export function useHoldSchedule() {
  const { updatePost, removePost } = useScheduler();
  const { toast } = useToast();

  const holdAsDraft = useCallback(async (post: SchedulerPost): Promise<boolean> => {
    const result = await cancelServerJob(post.serverEventId);
    const blocked = blockedToast(result);
    if (blocked) {
      toast({ ...blocked, variant: 'destructive' });
      return false;
    }
    updatePost(asHeldDraft(post));
    toast({
      title: 'Held as draft',
      description: result === 'skipped'
        ? 'This post is back in Drafts.'
        : 'The server alarm is cancelled. This post is in Drafts.',
    });
    return true;
  }, [updatePost, toast]);

  const deleteAndCancel = useCallback(async (post: SchedulerPost): Promise<boolean> => {
    const result = await cancelServerJob(post.serverEventId);
    const blocked = blockedToast(result);
    if (blocked) {
      toast({
        title: blocked.title === 'Already published' ? 'Already published' : 'Could not delete',
        description: blocked.description,
        variant: 'destructive',
      });
      return false;
    }
    removePost(post.id);
    toast({ title: 'Post deleted' });
    return true;
  }, [removePost, toast]);

  return { holdAsDraft, deleteAndCancel };
}
