import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { parseListing } from './useMyListings';

function listingEvent(overrides: Partial<NostrEvent> & { tags?: string[][] } = {}): NostrEvent {
  return {
    id: 'evt1',
    pubkey: 'df476caf4888bf5d99c6a710ea6ae943d3e693d29cdc75c4eff1cfb634839bb8',
    created_at: 1_700_000_000,
    kind: 30402,
    tags: overrides.tags ?? [
      ['d', 'viking-axe'],
      ['title', 'Hand-Forged Viking Axe'],
      ['summary', 'Carbon steel'],
      ['price', '100000', 'SAT'],
      ['image', 'https://example.com/axe.jpg', '1200x800'],
      ['status', 'active'],
    ],
    content: 'A real axe.',
    sig: 'sig',
    ...overrides,
  };
}

describe('parseListing', () => {
  it('reads NIP-99 title, price, and images', () => {
    const parsed = parseListing(listingEvent());
    expect(parsed?.dTag).toBe('viking-axe');
    expect(parsed?.title).toBe('Hand-Forged Viking Axe');
    expect(parsed?.price).toBe('100000');
    expect(parsed?.currency).toBe('SAT');
    expect(parsed?.images[0]).toEqual({ url: 'https://example.com/axe.jpg', dimensions: '1200x800' });
  });

  it('returns null without a d tag', () => {
    expect(parseListing(listingEvent({ tags: [['title', 'Nope']] }))).toBeNull();
  });

  it('picks up imeta images that are not in image tags', () => {
    const parsed = parseListing(listingEvent({
      tags: [
        ['d', 'axe'],
        ['imeta', 'url https://example.com/from-imeta.png', 'dim 800x600'],
      ],
    }));
    expect(parsed?.images).toEqual([
      { url: 'https://example.com/from-imeta.png', dimensions: '800x600' },
    ]);
  });
});
