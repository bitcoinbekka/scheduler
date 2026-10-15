import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { buildEvent, buildDvmPublishRequest } from './eventBuilder';
import { createNewPost } from './types';
import type { SchedulerPost } from './types';

const LISTING_PUBKEY = 'df476caf4888bf5d99c6a710ea6ae943d3e693d29cdc75c4eff1cfb634839bb8';
const LISTING_NADDR = nip19.naddrEncode({
  kind: 30402,
  pubkey: LISTING_PUBKEY,
  identifier: 'viking-axe',
});

/** Helper: create a promo note post */
function makePromoPost(overrides: Partial<SchedulerPost> = {}): SchedulerPost {
  const post = createNewPost('abc123pubkey');
  post.content = 'Check out my Hand-Forged Viking Axe! 100,000 sats\n\n📍 Reykjavik, Iceland';
  post.media = [
    {
      url: 'https://example.com/axe.jpg',
      mimeType: 'image/jpeg',
      dimensions: '1200x800',
      sha256: 'abc123hash',
      alt: 'Hand-forged Viking axe',
    },
  ];
  post.importedListing = {
    title: 'Hand-Forged Viking Axe',
    summary: 'Authentic carbon steel axe, hand-forged in Iceland.',
    price: '100000',
    currency: 'SAT',
    location: 'Reykjavik, Iceland',
    categories: ['tools', 'handmade', 'bitcoin'],
    images: [{ url: 'https://example.com/axe.jpg', dimensions: '1200x800' }],
    authorPubkey: LISTING_PUBKEY,
    naddr: LISTING_NADDR,
  };
  return { ...post, ...overrides };
}

describe('buildEvent — kind 1 promo note', () => {
  it('always produces kind 1', () => {
    const post = makePromoPost();
    const event = buildEvent(post);
    expect(event.kind).toBe(1);
  });

  it('includes content with media URLs appended', () => {
    const post = makePromoPost();
    const event = buildEvent(post);
    expect(event.content).toContain('Check out my Hand-Forged Viking Axe!');
    expect(event.content).toContain('https://example.com/axe.jpg');
  });

  it('does not duplicate media URL if already in content', () => {
    const post = createNewPost('author123');
    post.content = 'Check this out https://example.com/photo.jpg';
    post.media = [{ url: 'https://example.com/photo.jpg' }];

    const event = buildEvent(post);
    const matches = event.content.match(/https:\/\/example\.com\/photo\.jpg/g);
    expect(matches?.length).toBe(1);
  });

  it('includes NIP-92 imeta tags for media', () => {
    const post = makePromoPost();
    const event = buildEvent(post);

    const imetaTags = event.tags.filter(t => t[0] === 'imeta');
    expect(imetaTags.length).toBe(1);
    expect(imetaTags[0]).toContain('url https://example.com/axe.jpg');
    expect(imetaTags[0]).toContain('m image/jpeg');
    expect(imetaTags[0]).toContain('dim 1200x800');
    expect(imetaTags[0]).toContain('x abc123hash');
    expect(imetaTags[0]).toContain('alt Hand-forged Viking axe');
  });

  it('uses current time for created_at (not future)', () => {
    const post = makePromoPost({ scheduledAt: Math.floor(Date.now() / 1000) + 3600 });
    const event = buildEvent(post);
    // created_at should be roughly "now", not the scheduled time
    const now = Math.floor(Date.now() / 1000);
    expect(event.created_at).toBeGreaterThanOrEqual(now - 5);
    expect(event.created_at).toBeLessThanOrEqual(now + 5);
  });

  it('works for a plain note without imported listing', () => {
    const post = createNewPost('author123');
    post.content = 'Hello Nostr!';

    const event = buildEvent(post);
    expect(event.kind).toBe(1);
    expect(event.content).toBe('Hello Nostr!');
    expect(event.tags.length).toBe(0);
  });

  it('adds a NIP-99 a-tag from a real listing naddr', () => {
    const post = makePromoPost();
    const event = buildEvent(post);
    const aTag = event.tags.find(t => t[0] === 'a');
    expect(aTag).toEqual(['a', `30402:${LISTING_PUBKEY}:viking-axe`]);
    const pTags = event.tags.filter(t => t[0] === 'p').map(t => t[1]);
    expect(pTags).toContain(LISTING_PUBKEY);
    expect(new Set(pTags).size).toBe(pTags.length);
  });

  it('skips a-tag when the stored naddr is garbage', () => {
    const post = makePromoPost();
    post.importedListing = { ...post.importedListing!, naddr: 'naddr1not-real' };
    const event = buildEvent(post);
    expect(event.tags.find(t => t[0] === 'a')).toBeUndefined();
  });

  it('includes multiple media attachments', () => {
    const post = createNewPost('author123');
    post.content = 'Multi-image post';
    post.media = [
      { url: 'https://example.com/photo1.jpg', mimeType: 'image/jpeg' },
      { url: 'https://example.com/photo2.jpg', mimeType: 'image/jpeg' },
    ];

    const event = buildEvent(post);
    expect(event.content).toContain('https://example.com/photo1.jpg');
    expect(event.content).toContain('https://example.com/photo2.jpg');
    expect(event.tags.filter(t => t[0] === 'imeta').length).toBe(2);
  });
});

describe('buildEvent — NIP-40 expiration', () => {
  it('includes expiration tag when expiresAt is set', () => {
    const expiryTs = Math.floor(Date.now() / 1000) + 86400 * 7;
    const post = makePromoPost({ expiresAt: expiryTs });

    const event = buildEvent(post);
    const expTag = event.tags.find(t => t[0] === 'expiration');
    expect(expTag).toEqual(['expiration', String(expiryTs)]);
  });

  it('omits expiration tag when expiresAt is null', () => {
    const post = makePromoPost({ expiresAt: null });
    const event = buildEvent(post);

    const expTag = event.tags.find(t => t[0] === 'expiration');
    expect(expTag).toBeUndefined();
  });
});

describe('buildDvmPublishRequest — NIP-90 (kind 5905)', () => {
  it('produces kind 5905 with event payload and schedule params', () => {
    const futureTs = Math.floor(Date.now() / 1000) + 3600;
    const post = makePromoPost({
      scheduledAt: futureTs,
      useDvm: true,
      dvmRelays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
    });

    const eventJson = JSON.stringify(buildEvent(post));
    const dvmEvent = buildDvmPublishRequest(post, eventJson);

    expect(dvmEvent.kind).toBe(5905);
    expect(dvmEvent.content).toBe('');

    // Input tag with event JSON
    const iTag = dvmEvent.tags.find(t => t[0] === 'i');
    expect(iTag).toBeDefined();
    expect(iTag![1]).toBe(eventJson);
    expect(iTag![2]).toBe('text');

    // Publish_at param
    const publishAt = dvmEvent.tags.find(t => t[0] === 'param' && t[1] === 'publish_at');
    expect(publishAt).toEqual(['param', 'publish_at', String(futureTs)]);

    // Relay hints
    const relays = dvmEvent.tags.find(t => t[0] === 'relays');
    expect(relays).toEqual(['relays', 'wss://relay.damus.io', 'wss://relay.primal.net']);

    // NIP-31 alt tag
    const alt = dvmEvent.tags.find(t => t[0] === 'alt');
    expect(alt).toBeDefined();
    expect(alt![1]).toContain('DVM job request');

    // Output format
    const output = dvmEvent.tags.find(t => t[0] === 'output');
    expect(output).toEqual(['output', 'text/plain']);
  });

  it('omits publish_at param when not scheduled', () => {
    const post = makePromoPost({ scheduledAt: null, useDvm: true, dvmRelays: [] });
    const dvmEvent = buildDvmPublishRequest(post, '{}');

    const publishAt = dvmEvent.tags.find(t => t[0] === 'param' && t[1] === 'publish_at');
    expect(publishAt).toBeUndefined();
  });
});
