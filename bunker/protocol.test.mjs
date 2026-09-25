import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { handleRpc, parseAutoKinds, toBunkerUri, redactBunkerUri } from './protocol.mjs';

const sk = generateSecretKey();
const pub = getPublicKey(sk);
const client = 'ab'.repeat(32);
const secret = 'test-secret';

function ctx(extra = {}) {
  return {
    userSecretKey: sk,
    signerPubkey: pub,
    secret,
    clients: extra.clients || new Set(),
    autoKinds: parseAutoKinds('1,30023'),
    relays: ['wss://relay.primal.net'],
  };
}

test('connect rejects bad secret', () => {
  const c = ctx();
  const r = handleRpc({ id: '1', method: 'connect', params: [pub, 'nope'] }, c, client);
  assert.equal(r.error, 'bad secret');
  assert.equal(c.clients.has(client), false);
});

test('connect then sign_event kind 1', () => {
  const c = ctx();
  const ack = handleRpc({ id: '1', method: 'connect', params: [pub, secret] }, c, client);
  assert.equal(ack.result, 'ack');
  const now = Math.floor(Date.now() / 1000);
  const signed = handleRpc(
    {
      id: '2',
      method: 'sign_event',
      params: [JSON.stringify({ kind: 1, content: 'marmalade', tags: [], created_at: now })],
    },
    c,
    client,
  );
  const ev = JSON.parse(signed.result);
  assert.equal(ev.pubkey, pub);
  assert.equal(ev.created_at, now);
  assert.equal(ev.content, 'marmalade');
  assert.equal(verifyEvent(ev), true);
});

test('sign_event before connect is rejected', () => {
  const c = ctx();
  const r = handleRpc(
    { id: '1', method: 'sign_event', params: [JSON.stringify({ kind: 1, content: 'x', tags: [], created_at: 1 })] },
    c,
    client,
  );
  assert.equal(r.error, 'not connected');
});

test('kind 4 is not auto-approved', () => {
  const c = ctx();
  handleRpc({ id: '1', method: 'connect', params: [pub, secret] }, c, client);
  const r = handleRpc(
    { id: '2', method: 'sign_event', params: [JSON.stringify({ kind: 4, content: 'dm', tags: [], created_at: 1 })] },
    c,
    client,
  );
  assert.match(r.error, /not auto-approved/);
});

test('bunker uri redacts secret', () => {
  const uri = toBunkerUri(pub, ['wss://relay.primal.net'], 'super-secret');
  assert.match(uri, /^bunker:\/\//);
  assert.ok(uri.includes('super-secret'));
  const red = redactBunkerUri(uri);
  assert.ok(red.includes('secret=redacted'));
  assert.ok(!red.includes('super-secret'));
});
