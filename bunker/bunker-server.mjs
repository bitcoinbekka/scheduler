#!/usr/bin/env node
/**
 * Plebeian Bunker — NIP-46 remote signer (always on).
 *
 * Holds the merchant nsec. Scheduler asks it to sign at fire time.
 * Never logs nsec or the bunker secret. Status HTTP does not expose them.
 *
 * Env: see .env.example
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { decode as nip19decode } from 'nostr-tools/nip19';
import { getConversationKey, encrypt as nip44encrypt, decrypt as nip44decrypt } from 'nostr-tools/nip44';
import { handleRpc, parseAutoKinds, toBunkerUri, redactBunkerUri } from './protocol.mjs';

const DATA_DIR = process.env.DATA_DIR || './data';
const HTTP_PORT = parseInt(process.env.PORT || '1879', 10);
const RELAYS = (process.env.RELAYS || 'wss://relay.primal.net,wss://nos.lol,wss://relay.nostr.net,wss://relay.plebeian.market')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const AUTO_KINDS = parseAutoKinds(process.env.AUTO_APPROVE_KINDS || '1,30023');

mkdirSync(DATA_DIR, { recursive: true });

function loadOrCreateSecretKey() {
  const fromEnv = (process.env.BUNKER_NSEC || '').trim();
  if (fromEnv) {
    if (fromEnv.startsWith('nsec1')) {
      const d = nip19decode(fromEnv);
      if (d.type !== 'nsec') throw new Error('BUNKER_NSEC is not an nsec');
      return d.data;
    }
    if (/^[0-9a-f]{64}$/i.test(fromEnv)) {
      return Uint8Array.from(Buffer.from(fromEnv, 'hex'));
    }
    throw new Error('BUNKER_NSEC must be nsec1… or 64-char hex');
  }
  const keyPath = join(DATA_DIR, 'nsec');
  if (existsSync(keyPath)) {
    const raw = readFileSync(keyPath, 'utf8').trim();
    if (raw.startsWith('nsec1')) return nip19decode(raw).data;
    return Uint8Array.from(Buffer.from(raw, 'hex'));
  }
  const sk = generateSecretKey();
  writeFileSync(keyPath, Buffer.from(sk).toString('hex') + '\n', { mode: 0o600 });
  chmodSync(keyPath, 0o600);
  console.log('[Bunker] generated a new key into DATA_DIR/nsec (mode 0600). Back it up. Do not commit it.');
  return sk;
}

function loadOrCreateBunkerSecret() {
  const fromEnv = (process.env.BUNKER_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  const p = join(DATA_DIR, 'connect-secret');
  if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  const secret = randomBytes(16).toString('hex');
  writeFileSync(p, secret + '\n', { mode: 0o600 });
  chmodSync(p, 0o600);
  return secret;
}

function loadClients() {
  const p = join(DATA_DIR, 'clients.json');
  if (!existsSync(p)) return new Set();
  try {
    const arr = JSON.parse(readFileSync(p, 'utf8'));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveClients(set) {
  const p = join(DATA_DIR, 'clients.json');
  writeFileSync(p, JSON.stringify([...set], null, 2) + '\n', { mode: 0o600 });
}

const userSecretKey = loadOrCreateSecretKey();
const signerPubkey = getPublicKey(userSecretKey);
const bunkerSecret = loadOrCreateBunkerSecret();
const clients = loadClients();
const ctx = {
  userSecretKey,
  signerPubkey,
  secret: bunkerSecret,
  clients,
  autoKinds: AUTO_KINDS,
  relays: RELAYS,
};

const bunkerUri = toBunkerUri(signerPubkey, RELAYS, bunkerSecret);
writeFileSync(join(DATA_DIR, 'bunker.url'), bunkerUri + '\n', { mode: 0o600 });
chmodSync(join(DATA_DIR, 'bunker.url'), 0o600);

console.log(`[Bunker] pubkey ${signerPubkey}`);
console.log(`[Bunker] relays ${RELAYS.join(', ')}`);
console.log(`[Bunker] auto-approve kinds ${[...AUTO_KINDS].join(',')}`);
console.log(`[Bunker] URI (also DATA_DIR/bunker.url, mode 0600):`);
console.log(bunkerUri);
console.log(`[Bunker] redacted: ${redactBunkerUri(bunkerUri)}`);

const pool = new SimplePool();

async function reply(clientPubkey, payload) {
  const conv = getConversationKey(userSecretKey, clientPubkey);
  const content = nip44encrypt(JSON.stringify(payload), conv);
  const event = finalizeEvent(
    {
      kind: 24133,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', clientPubkey]],
      content,
    },
    userSecretKey,
  );
  await Promise.allSettled(pool.publish(RELAYS, event));
}

function decryptRequest(ev) {
  const conv = getConversationKey(userSecretKey, ev.pubkey);
  const plain = nip44decrypt(ev.content, conv);
  return JSON.parse(plain);
}

pool.subscribeMany(
  RELAYS,
  { kinds: [24133], '#p': [signerPubkey] },
  {
    onevent: async (ev) => {
      if (ev.pubkey === signerPubkey) return;
      let req;
      try {
        req = decryptRequest(ev);
      } catch {
        console.log('[Bunker] ignored undecryptable event from', ev.pubkey.slice(0, 8));
        return;
      }
      const method = req?.method || '?';
      const before = clients.size;
      const payload = handleRpc(req, ctx, ev.pubkey);
      if (clients.size !== before) saveClients(clients);
      const ok = !payload.error;
      console.log(`[Bunker] ${method} from ${ev.pubkey.slice(0, 8)}… ${ok ? 'ok' : payload.error}`);
      try {
        await reply(ev.pubkey, payload);
      } catch (err) {
        console.error('[Bunker] reply failed:', err?.message || err);
      }
    },
    oneose: () => {
      console.log('[Bunker] listening on relays');
    },
  },
);

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      service: 'plebeian-bunker',
      pubkey: signerPubkey,
      relays: RELAYS,
      autoKinds: [...AUTO_KINDS],
      clients: clients.size,
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[Bunker] status http://127.0.0.1:${HTTP_PORT}/`);
});
