import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useAuthor } from './useAuthor';
import type { NostrEvent, NostrFilter, NostrMetadata } from '@nostrify/nostrify';

/** Parsed listing data from a NIP-99 kind 30402 event */
export interface ExistingListing {
  event: NostrEvent;
  dTag: string;
  title: string;
  summary: string;
  content: string;
  price: string;
  currency: string;
  priceFrequency: string;
  location: string;
  status: string;
  categories: string[];
  images: { url: string; dimensions?: string }[];
  publishedAt: number | null;
}

export function parseListing(event: NostrEvent): ExistingListing | null {
  const dTag = event.tags.find(([n]) => n === 'd')?.[1];
  if (!dTag) return null;

  const title = event.tags.find(([n]) => n === 'title')?.[1] ?? '';
  const summary = event.tags.find(([n]) => n === 'summary')?.[1] ?? '';
  const location = event.tags.find(([n]) => n === 'location')?.[1] ?? '';
  const status = event.tags.find(([n]) => n === 'status')?.[1] ?? 'active';
  const publishedAtStr = event.tags.find(([n]) => n === 'published_at')?.[1];
  const publishedAt = publishedAtStr ? parseInt(publishedAtStr) : null;

  // Parse price tag: ["price", "<amount>", "<currency>", "<frequency>"]
  const priceTag = event.tags.find(([n]) => n === 'price');
  const price = priceTag?.[1] ?? '';
  const currency = priceTag?.[2] ?? 'SAT';
  const priceFrequency = priceTag?.[3] ?? '';

  // Categories from t tags
  const categories = event.tags
    .filter(([n]) => n === 't')
    .map(([, v]) => v);

  // Images from image tags
  const images: { url: string; dimensions?: string }[] = event.tags
    .filter((tag) => tag[0] === 'image' && !!tag[1])
    .map(([, url, dims]) => ({ url, dimensions: dims || undefined }));

  // Also check imeta tags for images not in image tags
  const imetaUrls = new Set(images.map(i => i.url));
  for (const tag of event.tags) {
    if (tag[0] !== 'imeta') continue;
    const urlPart = tag.find(p => p.startsWith('url '));
    if (urlPart) {
      const url = urlPart.replace('url ', '');
      if (!imetaUrls.has(url)) {
        const dimPart = tag.find(p => p.startsWith('dim '));
        images.push({ url, dimensions: dimPart?.replace('dim ', '') });
        imetaUrls.add(url);
      }
    }
  }

  return {
    event,
    dTag,
    title,
    summary,
    content: event.content,
    price,
    currency,
    priceFrequency,
    location,
    status,
    categories,
    images,
    publishedAt,
  };
}

/**
 * Fetches the current user's existing NIP-99 classified listings
 * (kind 30402) from Nostr relays.
 */
export function useMyListings() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['my-listings', user?.pubkey],
    queryFn: async () => {
      if (!user) return [];

      const events = await nostr.query(
        [{
          kinds: [30402],
          authors: [user.pubkey],
          limit: 50,
        }],
        { signal: AbortSignal.timeout(8000) },
      );

      const listings: ExistingListing[] = [];
      for (const event of events) {
        const parsed = parseListing(event);
        if (parsed && parsed.status !== 'sold' && parsed.status !== 'deleted') {
          listings.push(parsed);
        }
      }

      listings.sort((a, b) => b.event.created_at - a.event.created_at);
      return listings;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Searches all NIP-99 classified listings (kind 30402) on relays,
 * optionally filtered by search term via t tags or by text search.
 */
export function useAllListings(searchTerm: string, enabled = true) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['all-listings', searchTerm],
    queryFn: async () => {
      // Build filter — if search term provided, filter by t tag at relay level
      const filters: NostrFilter[] = [];
      const trimmed = searchTerm.trim().toLowerCase();

      if (trimmed) {
        filters.push({
          kinds: [30402],
          '#t': [trimmed],
          limit: 40,
        });
        filters.push({
          kinds: [30402],
          limit: 40,
        });
      } else {
        filters.push({
          kinds: [30402],
          limit: 40,
        });
      }

      const events = await nostr.query(filters, { signal: AbortSignal.timeout(8000) });

      // Deduplicate by event id
      const seen = new Set<string>();
      const unique: NostrEvent[] = [];
      for (const e of events) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          unique.push(e);
        }
      }

      const listings: ExistingListing[] = [];
      for (const event of unique) {
        const parsed = parseListing(event);
        if (parsed && parsed.status !== 'sold' && parsed.status !== 'deleted') {
          if (trimmed) {
            const matchesTitle = parsed.title.toLowerCase().includes(trimmed);
            const matchesSummary = parsed.summary.toLowerCase().includes(trimmed);
            const matchesContent = parsed.content.toLowerCase().includes(trimmed);
            const matchesCategory = parsed.categories.some(c => c.toLowerCase().includes(trimmed));
            const matchesLocation = parsed.location.toLowerCase().includes(trimmed);
            if (matchesTitle || matchesSummary || matchesContent || matchesCategory || matchesLocation) {
              listings.push(parsed);
            }
          } else {
            listings.push(parsed);
          }
        }
      }

      listings.sort((a, b) => b.event.created_at - a.event.created_at);
      return listings;
    },
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetches the current user's existing NIP-23 articles
 * (kind 30023) from Nostr relays.
 */
export function useMyArticles() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['my-articles', user?.pubkey],
    queryFn: async () => {
      if (!user) return [];

      const events = await nostr.query([{
        kinds: [30023],
        authors: [user.pubkey],
        limit: 50,
      }]);

      return events
        .filter(e => e.tags.some(([n]) => n === 'd'))
        .sort((a, b) => b.created_at - a.created_at)
        .map(event => ({
          event,
          dTag: event.tags.find(([n]) => n === 'd')![1],
          title: event.tags.find(([n]) => n === 'title')?.[1] ?? '',
          summary: event.tags.find(([n]) => n === 'summary')?.[1] ?? '',
          image: event.tags.find(([n]) => n === 'image')?.[1] ?? '',
          content: event.content,
          categories: event.tags.filter(([n]) => n === 't').map(([, v]) => v),
        }));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

/** Small helper to get author display info for listing cards */
export function useListingAuthor(pubkey: string): { name: string; picture?: string } {
  const author = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  return {
    name: metadata?.display_name || metadata?.name || pubkey.slice(0, 12) + '...',
    picture: metadata?.picture,
  };
}
