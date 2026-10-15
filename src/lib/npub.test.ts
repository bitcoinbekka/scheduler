import { describe, it, expect } from 'vitest';
import { parsePubkeyInput } from './npub';

const NPUB = 'npub1zg69v7ys40x77y352eufp27daufrg4ncjz4ummcjx3t83y9tehhsqepuh0';

describe('parsePubkeyInput', () => {
  it('decodes an npub', () => {
    const parsed = parsePubkeyInput(NPUB);
    expect(parsed?.npub).toBe(NPUB);
    expect(parsed?.hex).toHaveLength(64);
  });

  it('strips a nostr: prefix', () => {
    const parsed = parsePubkeyInput(`nostr:${NPUB}`);
    expect(parsed?.npub).toBe(NPUB);
  });

  it('decodes 64-char hex to npub', () => {
    const first = parsePubkeyInput(NPUB);
    expect(first).not.toBeNull();
    const again = parsePubkeyInput(first!.hex);
    expect(again?.npub).toBe(NPUB);
    expect(again?.hex).toBe(first!.hex);
  });

  it('returns null for garbage', () => {
    expect(parsePubkeyInput('not-a-key')).toBeNull();
    expect(parsePubkeyInput('')).toBeNull();
  });
});
