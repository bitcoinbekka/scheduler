import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.BUNKER_STORE_KEY = 'test-key-not-for-production';
const { encryptSecret, decryptSecret, hasBunkerStoreKey } = await import('./secret-box.mjs');

test('encrypts and decrypts a bunker URI', () => {
  assert.equal(hasBunkerStoreKey(), true);
  const uri = 'bunker://' + 'ab'.repeat(32) + '?relay=wss://relay.damus.io&secret=token';
  const blob = encryptSecret(uri);
  assert.notEqual(blob, uri);
  assert.equal(decryptSecret(blob), uri);
});
