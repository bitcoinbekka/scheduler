/**
 * Parse and redact NIP-46 bunker:// URIs.
 * Never log the raw URI; use redactBunkerUri for display.
 */

export interface ParsedBunker {
  pubkey: string;
  relays: string[];
  hasSecret: boolean;
}

export function parseBunkerUri(uri: string): ParsedBunker {
  const trimmed = uri.trim();
  if (!trimmed.toLowerCase().startsWith('bunker://')) {
    throw new Error('Bunker URI must start with bunker://');
  }
  const asUrl = new URL(trimmed.replace(/^bunker:\/\//i, 'http://'));
  const pubkey = (asUrl.hostname || asUrl.pathname.replace(/^\//, '')).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(pubkey)) {
    throw new Error('Bunker URI is missing a 64-character hex pubkey');
  }
  const relays = asUrl.searchParams.getAll('relay').filter((r) => r.startsWith('wss://') || r.startsWith('ws://'));
  if (relays.length === 0) {
    throw new Error('Bunker URI must include at least one relay= parameter');
  }
  return {
    pubkey,
    relays,
    hasSecret: Boolean(asUrl.searchParams.get('secret')),
  };
}

export function redactBunkerUri(uri: string): string {
  try {
    const trimmed = uri.trim();
    const asUrl = new URL(trimmed.replace(/^bunker:\/\//i, 'http://'));
    if (asUrl.searchParams.has('secret')) {
      asUrl.searchParams.set('secret', 'redacted');
    }
    const host = asUrl.hostname || asUrl.pathname.replace(/^\//, '');
    const query = asUrl.search;
    return `bunker://${host}${query}`;
  } catch {
    return 'bunker://[unparseable]';
  }
}

const BUNKER_STORAGE_KEY = 'plebeian-scheduler:bunker';

export interface BunkerLocalSettings {
  /** Raw bunker:// URI. Device-local only. Never publish to Nostr. */
  bunkerUri: string;
  /** When true, schedule via NIP-46 fire-time signing instead of pre-sign. */
  signAtFire: boolean;
}

export function loadBunkerSettings(): BunkerLocalSettings {
  if (typeof localStorage === 'undefined') {
    return { bunkerUri: '', signAtFire: false };
  }
  try {
    const raw = localStorage.getItem(BUNKER_STORAGE_KEY);
    if (!raw) return { bunkerUri: '', signAtFire: false };
    const parsed = JSON.parse(raw) as Partial<BunkerLocalSettings>;
    return {
      bunkerUri: typeof parsed.bunkerUri === 'string' ? parsed.bunkerUri : '',
      signAtFire: parsed.signAtFire === true,
    };
  } catch {
    return { bunkerUri: '', signAtFire: false };
  }
}

export function saveBunkerSettings(settings: BunkerLocalSettings): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(BUNKER_STORAGE_KEY, JSON.stringify({
    bunkerUri: settings.bunkerUri,
    signAtFire: settings.signAtFire === true,
  }));
}

export function clearBunkerSettings(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(BUNKER_STORAGE_KEY);
}
