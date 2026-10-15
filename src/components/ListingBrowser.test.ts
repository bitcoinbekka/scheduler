import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { buildPromoContent } from '@/lib/listingImport';
import type { ExistingListing } from '@/hooks/useMyListings';

const PUBKEY = 'df476caf4888bf5d99c6a710ea6ae943d3e693d29cdc75c4eff1cfb634839bb8';

function listing(partial: Partial<ExistingListing> = {}): ExistingListing {
  return {
    event: {
      id: 'abc123',
      pubkey: PUBKEY,
      created_at: 1,
      kind: 30402,
      tags: [],
      content: '',
      sig: 'sig',
    },
    dTag: 'axe',
    title: 'Hand-Forged Viking Axe',
    summary: 'Carbon steel',
    content: '',
    price: '100000',
    currency: 'SAT',
    priceFrequency: '',
    location: 'Reykjavik',
    status: 'active',
    categories: ['tools'],
    images: [{ url: 'https://example.com/axe.jpg' }],
    publishedAt: null,
    ...partial,
  };
}

describe('buildPromoContent', () => {
  it('tags the listing author as a nostr:npub mention', () => {
    const text = buildPromoContent(listing());
    const npub = nip19.npubEncode(PUBKEY);
    expect(text).toContain(`nostr:${npub}`);
    expect(text).toContain('Hand-Forged Viking Axe');
    expect(text).toContain('https://plebeian.market/products/abc123');
  });
});
