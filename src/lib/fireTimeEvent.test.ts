import { describe, it, expect } from 'vitest';
import { templateFromBuild, stampCreatedAt } from './fireTimeEvent';
import { buildEvent } from './eventBuilder';
import { createNewPost } from './types';

const PUB = 'ab'.repeat(32);

describe('fire-time unsigned template', () => {
  it('does not freeze created_at from schedule time', () => {
    const post = createNewPost(PUB);
    post.content = 'Three fruit marmalade from Jimble.';
    const built = buildEvent(post);
    const scheduleTime = built.created_at;
    const template = templateFromBuild(built, PUB);
    const fireTime = scheduleTime + 86400;
    const stamped = stampCreatedAt(template, fireTime);
    expect(stamped.created_at).toBe(fireTime);
    expect(stamped.created_at).not.toBe(scheduleTime);
    expect(stamped.pubkey).toBe(PUB);
    expect(stamped.content).toContain('marmalade');
    expect(stamped.kind).toBe(1);
  });

  it('rejects a non-hex pubkey', () => {
    expect(() => templateFromBuild({ kind: 1, content: 'x', tags: [] }, 'npub1abc')).toThrow(/pubkey/);
  });
});
