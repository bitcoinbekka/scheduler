/**
 * NIP-46 remote-signer request handlers. No network.
 * userSecretKey is Uint8Array. Never log it.
 */
import { finalizeEvent, getPublicKey, verifyEvent } from 'nostr-tools/pure';

const AUTO_KINDS_DEFAULT = new Set([1, 30023]);

export function parseAutoKinds(raw) {
  if (!raw || !String(raw).trim()) return new Set(AUTO_KINDS_DEFAULT);
  return new Set(
    String(raw)
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n)),
  );
}

/**
 * @param {object} req  { id, method, params }
 * @param {object} ctx
 * @param {Uint8Array} ctx.userSecretKey
 * @param {string} ctx.signerPubkey  hex of the bunker (remote-signer) key
 * @param {string} ctx.secret        bunker:// secret
 * @param {Set<string>} ctx.clients  connected client pubkeys
 * @param {Set<number>} ctx.autoKinds
 * @param {string[]} ctx.relays
 * @param {string} clientPubkey
 */
export function handleRpc(req, ctx, clientPubkey) {
  const id = req?.id || '';
  const method = req?.method;
  const params = Array.isArray(req?.params) ? req.params : [];
  const userPubkey = getPublicKey(ctx.userSecretKey);

  try {
    if (method === 'connect') {
      const wantPubkey = (params[0] || '').toLowerCase();
      const offeredSecret = params[1] || '';
      if (wantPubkey && wantPubkey !== ctx.signerPubkey) {
        return { id, error: 'remote-signer pubkey mismatch' };
      }
      if (offeredSecret !== ctx.secret) {
        return { id, error: 'bad secret' };
      }
      ctx.clients.add(clientPubkey);
      return { id, result: 'ack' };
    }

    if (method === 'ping') {
      return { id, result: 'pong' };
    }

    if (method === 'get_public_key') {
      if (!ctx.clients.has(clientPubkey)) {
        return { id, error: 'not connected' };
      }
      return { id, result: userPubkey };
    }

    if (method === 'switch_relays') {
      return { id, result: JSON.stringify(ctx.relays) };
    }

    if (method === 'logout') {
      ctx.clients.delete(clientPubkey);
      return { id, result: 'ack' };
    }

    if (method === 'sign_event') {
      if (!ctx.clients.has(clientPubkey)) {
        return { id, error: 'not connected' };
      }
      let tmpl;
      try {
        tmpl = typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0];
      } catch {
        return { id, error: 'sign_event param is not JSON' };
      }
      if (!tmpl || typeof tmpl.kind !== 'number') {
        return { id, error: 'invalid event template' };
      }
      if (!ctx.autoKinds.has(tmpl.kind)) {
        return { id, error: `kind ${tmpl.kind} is not auto-approved` };
      }
      const signed = finalizeEvent(
        {
          kind: tmpl.kind,
          content: tmpl.content || '',
          tags: tmpl.tags || [],
          created_at: tmpl.created_at,
        },
        ctx.userSecretKey,
      );
      if (!verifyEvent(signed)) {
        return { id, error: 'signed event failed verify' };
      }
      return { id, result: JSON.stringify(signed) };
    }

    return { id, error: `unsupported method: ${method}` };
  } catch (err) {
    return { id, error: String(err?.message || err) };
  }
}

export function toBunkerUri(pubkey, relays, secret) {
  const q = relays.map((r) => `relay=${encodeURIComponent(r)}`).join('&');
  return `bunker://${pubkey}?${q}&secret=${encodeURIComponent(secret)}`;
}

export function redactBunkerUri(uri) {
  try {
    const asUrl = new URL(String(uri).replace(/^bunker:\/\//i, 'http://'));
    if (asUrl.searchParams.has('secret')) asUrl.searchParams.set('secret', 'redacted');
    return `bunker://${asUrl.hostname}${asUrl.search}`;
  } catch {
    return 'bunker://[redacted]';
  }
}
