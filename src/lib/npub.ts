import { nip19 } from 'nostr-tools';

export interface ParsedPubkey {
  hex: string;
  npub: string;
}

/**
 * Accept an npub, nprofile, nostr: URI, or 64-char hex pubkey.
 * Returns null when the input cannot be decoded.
 */
export function parsePubkeyInput(input: string): ParsedPubkey | null {
  const raw = input.trim().replace(/^nostr:/, '');
  if (!raw) return null;

  if (raw.startsWith('npub1') || raw.startsWith('nprofile1')) {
    try {
      const decoded = nip19.decode(raw);
      if (decoded.type === 'npub') {
        return { hex: decoded.data, npub: nip19.npubEncode(decoded.data) };
      }
      if (decoded.type === 'nprofile') {
        return { hex: decoded.data.pubkey, npub: nip19.npubEncode(decoded.data.pubkey) };
      }
    } catch {
      return null;
    }
  }

  if (/^[0-9a-f]{64}$/i.test(raw)) {
    const hex = raw.toLowerCase();
    try {
      return { hex, npub: nip19.npubEncode(hex) };
    } catch {
      return null;
    }
  }

  return null;
}
