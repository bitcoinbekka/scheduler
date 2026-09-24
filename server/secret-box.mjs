/**
 * AES-256-GCM box for bunker URIs at rest.
 * Key: BUNKER_STORE_KEY env (any passphrase; hashed to 32 bytes).
 */
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export function hasBunkerStoreKey() {
  return Boolean((process.env.BUNKER_STORE_KEY || '').trim());
}

function keyBytes() {
  const raw = (process.env.BUNKER_STORE_KEY || '').trim();
  if (!raw) {
    throw new Error('BUNKER_STORE_KEY is not set; refusing to store a bunker URI');
  }
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plaintext) {
  const key = keyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(blob) {
  const key = keyBytes();
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
