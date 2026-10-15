import { nip19 } from 'nostr-tools';
import { PLEBEIAN_MARKET_URL, type ImportedListing, type UploadedImage } from '@/lib/types';
import type { ExistingListing } from '@/hooks/useMyListings';

const LISTING_RELAYS = ['wss://relay.primal.net', 'wss://relay.damus.io', 'wss://relay.ditto.pub'];

/** Build an naddr1 for a NIP-99 listing (kind 30402). */
export function buildNaddr(listing: ExistingListing): string {
  if (!listing.dTag || !listing.event.pubkey) return '';
  try {
    return nip19.naddrEncode({
      kind: 30402,
      pubkey: listing.event.pubkey,
      identifier: listing.dTag,
      relays: LISTING_RELAYS,
    });
  } catch {
    return '';
  }
}

/** Plebeian Market product page for a listing event. */
export function buildMarketplaceUrl(listing: ExistingListing): string {
  return `${PLEBEIAN_MARKET_URL}/products/${listing.event.id}`;
}

/** Draft promo note from a NIP-99 listing, including a merchant mention. */
export function buildPromoContent(listing: ExistingListing): string {
  const parts: string[] = [];

  if (listing.title) {
    parts.push(listing.title);
  }

  try {
    parts.push(`nostr:${nip19.npubEncode(listing.event.pubkey)}`);
  } catch {
    // skip a bad pubkey
  }

  if (listing.summary) {
    parts.push(listing.summary);
  } else if (listing.content) {
    const snippet = listing.content.length > 200
      ? listing.content.slice(0, 200).trim() + '...'
      : listing.content;
    parts.push(snippet);
  }

  if (listing.price) {
    const currencyLabel = listing.currency === 'SAT' ? 'sats'
      : listing.currency === 'BTC' ? 'BTC'
        : listing.currency;
    parts.push(`Price: ${listing.price} ${currencyLabel}`);
  }

  if (listing.location) {
    parts.push(`📍 ${listing.location}`);
  }

  const marketplaceUrl = buildMarketplaceUrl(listing);
  if (marketplaceUrl) {
    parts.push(`🛒 Buy here: ${marketplaceUrl}`);
  }

  return parts.join('\n\n');
}

export function listingToImported(listing: ExistingListing): {
  content: string;
  media: UploadedImage[];
  importedListing: ImportedListing;
} {
  const media: UploadedImage[] = listing.images.map(img => ({
    url: img.url,
    dimensions: img.dimensions,
  }));

  return {
    content: buildPromoContent(listing),
    media,
    importedListing: {
      naddr: buildNaddr(listing),
      marketplaceUrl: buildMarketplaceUrl(listing),
      title: listing.title,
      summary: listing.summary,
      price: listing.price,
      currency: listing.currency || 'SAT',
      location: listing.location,
      categories: listing.categories,
      images: media,
      authorPubkey: listing.event.pubkey,
    },
  };
}
