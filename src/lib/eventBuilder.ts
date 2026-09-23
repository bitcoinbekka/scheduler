import { nip19 } from 'nostr-tools';
import type { SchedulerPost, UploadedImage } from './types';

interface UnsignedEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

/**
 * Extract pubkeys from nostr: URI mentions in content (NIP-27).
 * Supports nostr:npub1..., nostr:nprofile1..., nostr:note1..., nostr:nevent1...
 * Returns an array of unique hex pubkeys found.
 */
function extractMentionedPubkeys(content: string): string[] {
  const pubkeys = new Set<string>();
  const regex = /nostr:(npub1[a-z0-9]+|nprofile1[a-z0-9]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    try {
      const decoded = nip19.decode(match[1]);
      if (decoded.type === 'npub') {
        pubkeys.add(decoded.data);
      } else if (decoded.type === 'nprofile') {
        pubkeys.add(decoded.data.pubkey);
      }
    } catch {
      // Invalid bech32, skip
    }
  }

  return Array.from(pubkeys);
}

/** Build an imeta tag from an UploadedImage (NIP-92) */
function buildImetaTag(img: UploadedImage): string[] {
  const parts: string[] = ['imeta', `url ${img.url}`];
  if (img.mimeType) parts.push(`m ${img.mimeType}`);
  if (img.dimensions) parts.push(`dim ${img.dimensions}`);
  if (img.sha256) parts.push(`x ${img.sha256}`);
  if (img.blurhash) parts.push(`blurhash ${img.blurhash}`);
  if (img.alt) parts.push(`alt ${img.alt}`);
  return parts;
}

/** Generate a URL-friendly slug from a title */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Build an unsigned event from a SchedulerPost.
 *
 * - postType 'short' or 'promo' → kind 1 (short text note)
 * - postType 'long' → kind 30023 (long-form article / NIP-23)
 */
export function buildEvent(post: SchedulerPost): UnsignedEvent {
  const now = Math.floor(Date.now() / 1000);

  if (post.postType === 'long') {
    return buildLongFormEvent(post, now);
  }

  return buildShortNoteEvent(post, now);
}

/** Build a kind 1 short text note (for both 'short' and 'promo' post types) */
function buildShortNoteEvent(post: SchedulerPost, now: number): UnsignedEvent {
  const tags: string[][] = [];

  // Append media URLs to content
  let content = post.content;
  for (const img of post.media) {
    if (!content.includes(img.url)) {
      content += `\n${img.url}`;
    }
    tags.push(buildImetaTag(img));
  }

  // Extract nostr: mentions from content and add p tags (NIP-27)
  const mentionedPubkeys = extractMentionedPubkeys(content);
  for (const pubkey of mentionedPubkeys) {
    tags.push(['p', pubkey]);
  }

  // NIP-40 expiration
  if (post.expiresAt) {
    tags.push(['expiration', String(post.expiresAt)]);
  }

  // NIP-99 listing reference (promo notes)
  if (post.importedListing?.naddr) {
    try {
      const decoded = nip19.decode(post.importedListing.naddr);
      if (decoded.type === 'naddr') {
        const { kind, pubkey, identifier } = decoded.data;
        tags.push(['a', `${kind}:${pubkey}:${identifier}`]);
      }
    } catch {
      // Invalid naddr, skip
    }
    if (post.importedListing.authorPubkey) {
      tags.push(['p', post.importedListing.authorPubkey]);
    }
  }

  return {
    kind: 1,
    content,
    tags,
    // Always use current time — relays reject future created_at.
    // For server-scheduled posts, this means created_at reflects when the event
    // was signed, not when it was published. This is intentional: the signature
    // covers created_at and cannot be changed after signing.
    created_at: now,
  };
}

/** Build a kind 30023 long-form article event (NIP-23) */
function buildLongFormEvent(post: SchedulerPost, now: number): UnsignedEvent {
  const tags: string[][] = [];

  // d-tag (identifier / slug) — required for addressable events
  const dTag = post.slug || slugify(post.title) || post.id;
  tags.push(['d', dTag]);

  // Title — recommended
  if (post.title) {
    tags.push(['title', post.title]);
  }

  // Summary — recommended
  if (post.summary) {
    tags.push(['summary', post.summary]);
  }

  // Header image
  if (post.headerImage) {
    tags.push(['image', post.headerImage]);
  }

  // Published_at — original publication timestamp
  tags.push(['published_at', String(now)]);

  // Hashtags as t tags
  for (const tag of post.hashtags) {
    if (tag.trim()) {
      tags.push(['t', tag.trim().toLowerCase()]);
    }
  }

  // Media attachments as imeta tags
  for (const img of post.media) {
    tags.push(buildImetaTag(img));
  }

  // Extract nostr: mentions from content and add p tags (NIP-27)
  const mentionedPubkeys = extractMentionedPubkeys(post.content);
  for (const pubkey of mentionedPubkeys) {
    tags.push(['p', pubkey]);
  }

  // NIP-40 expiration
  if (post.expiresAt) {
    tags.push(['expiration', String(post.expiresAt)]);
  }

  // NIP-99 listing reference (promo notes)
  if (post.importedListing?.naddr) {
    try {
      const decoded = nip19.decode(post.importedListing.naddr);
      if (decoded.type === 'naddr') {
        const { kind, pubkey, identifier } = decoded.data;
        tags.push(['a', `${kind}:${pubkey}:${identifier}`]);
      }
    } catch {
      // Invalid naddr, skip
    }
    if (post.importedListing.authorPubkey) {
      tags.push(['p', post.importedListing.authorPubkey]);
    }
  }

  return {
    kind: 30023,
    content: post.content, // Markdown content
    tags,
    created_at: now,
  };
}

/** Build a NIP-90 DVM job request for delegated publishing */
export function buildDvmPublishRequest(post: SchedulerPost, eventJson: string): UnsignedEvent {
  const tags: string[][] = [
    ['i', eventJson, 'text'],
    ['output', 'text/plain'],
    ['param', 'action', 'publish'],
  ];

  if (post.scheduledAt) {
    tags.push(['param', 'publish_at', String(post.scheduledAt)]);
  }

  if (post.dvmRelays.length > 0) {
    tags.push(['relays', ...post.dvmRelays]);
  }

  // NIP-31 alt tag for human-readable description
  tags.push(['alt', `DVM job request: publish scheduled Nostr event at ${post.scheduledAt ? new Date(post.scheduledAt * 1000).toISOString() : 'now'}`]);

  return {
    kind: 5905,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };
}
