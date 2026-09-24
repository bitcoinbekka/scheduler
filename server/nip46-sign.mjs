/**
 * Fire-time NIP-46 sign via an Amber / nsec.app bunker:// URI.
 * Keys never live here. The bunker signs. We only publish.
 */
import { generateSecretKey } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';

export function redactBunkerUri(uri) {
  try {
    const asUrl = new URL(String(uri).replace(/^bunker:\/\//i, 'http://'));
    if (asUrl.searchParams.has('secret')) asUrl.searchParams.set('secret', 'redacted');
    return `bunker://${asUrl.hostname}${asUrl.search}`;
  } catch {
    return 'bunker://[redacted]';
  }
}

/**
 * @param {string} bunkerUri
 * @param {{ kind: number, content: string, tags: string[][], pubkey: string, created_at: number }} unsigned
 * @param {number} [timeoutMs]
 */
export async function signEventWithBunker(bunkerUri, unsigned, timeoutMs = 90_000) {
  const pointer = await parseBunkerInput(bunkerUri);
  if (!pointer || !pointer.pubkey) {
    throw new Error('Could not parse bunker:// URI');
  }
  if (unsigned.pubkey && pointer.pubkey !== unsigned.pubkey) {
    throw new Error('Bunker pubkey does not match the scheduled author');
  }

  const pool = new SimplePool();
  const localSecret = generateSecretKey();
  const signer = BunkerSigner.fromBunker(localSecret, pointer, { pool });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Amber/bunker did not answer in time. Unlock the phone and auto-approve sign_event.')), timeoutMs);
  });

  try {
    await Promise.race([signer.connect(), timeout]);
    const signed = await Promise.race([
      signer.signEvent({
        kind: unsigned.kind,
        content: unsigned.content,
        tags: unsigned.tags,
        created_at: unsigned.created_at,
        pubkey: unsigned.pubkey,
      }),
      timeout,
    ]);
    if (!signed?.id || !signed?.sig) {
      throw new Error('Bunker returned an unsigned event');
    }
    if (signed.created_at !== unsigned.created_at) {
      throw new Error('Bunker changed created_at; refusing to publish');
    }
    if (signed.pubkey !== unsigned.pubkey) {
      throw new Error('Bunker signed as a different pubkey');
    }
    return signed;
  } finally {
    try { await signer.close(); } catch { /* ignore */ }
    try {
      const relays = pointer.relays || [];
      if (relays.length) pool.close(relays);
    } catch { /* ignore */ }
  }
}
