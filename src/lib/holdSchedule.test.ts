import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyCancelError, cancelServerJob, isLiveAlarm, asHeldDraft } from './holdSchedule';
import { cancelScheduledEvent } from './schedulerApi';
import { createNewPost } from './types';

vi.mock('./schedulerApi', () => ({
  cancelScheduledEvent: vi.fn(),
}));

const cancelMock = vi.mocked(cancelScheduledEvent);

describe('classifyCancelError', () => {
  it('treats not found as gone', () => {
    expect(classifyCancelError('Not found')).toBe('gone');
    expect(classifyCancelError('HTTP 404')).toBe('gone');
  });

  it('treats already published as published', () => {
    expect(classifyCancelError('Already published, cannot cancel')).toBe('published');
    expect(classifyCancelError('HTTP 409')).toBe('published');
  });

  it('treats other errors as error', () => {
    expect(classifyCancelError('network down')).toBe('error');
  });
});

describe('cancelServerJob', () => {
  beforeEach(() => {
    cancelMock.mockReset();
  });

  it('skips when there is no server id', async () => {
    expect(await cancelServerJob(null)).toBe('skipped');
    expect(await cancelServerJob('')).toBe('skipped');
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('returns cancelled on success', async () => {
    cancelMock.mockResolvedValueOnce({ ok: true });
    expect(await cancelServerJob('job-1')).toBe('cancelled');
    expect(cancelMock).toHaveBeenCalledWith('job-1');
  });

  it('returns gone when the server job is missing', async () => {
    cancelMock.mockRejectedValueOnce(new Error('Not found'));
    expect(await cancelServerJob('job-1')).toBe('gone');
  });

  it('returns published when the job already went out', async () => {
    cancelMock.mockRejectedValueOnce(new Error('Already published, cannot cancel'));
    expect(await cancelServerJob('job-1')).toBe('published');
  });
});

describe('isLiveAlarm / asHeldDraft', () => {
  it('treats scheduled posts as live', () => {
    const post = createNewPost('pk');
    post.status = 'scheduled';
    expect(isLiveAlarm(post)).toBe(true);
  });

  it('treats a draft with a server id as live', () => {
    const post = createNewPost('pk');
    post.status = 'draft';
    post.serverEventId = 'job-1';
    expect(isLiveAlarm(post)).toBe(true);
  });

  it('does not treat published posts as live', () => {
    const post = createNewPost('pk');
    post.status = 'published';
    post.serverEventId = 'job-1';
    expect(isLiveAlarm(post)).toBe(false);
  });

  it('clears the server id when holding as a draft', () => {
    const post = createNewPost('pk');
    post.status = 'scheduled';
    post.serverEventId = 'job-1';
    post.scheduledAt = 1792306800;
    const held = asHeldDraft(post);
    expect(held.status).toBe('draft');
    expect(held.serverEventId).toBeNull();
    expect(held.scheduledAt).toBe(1792306800);
    expect(held.id).toBe(post.id);
  });
});
