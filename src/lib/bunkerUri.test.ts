import { describe, it, expect } from 'vitest';
import { parseBunkerUri, redactBunkerUri } from './bunkerUri';

const PUB = 'a'.repeat(64);
const URI = `bunker://${PUB}?relay=wss://relay.damus.io&secret=super-secret-token`;

describe('parseBunkerUri', () => {
  it('parses pubkey, relays, and secret flag', () => {
    const parsed = parseBunkerUri(URI);
    expect(parsed.pubkey).toBe(PUB);
    expect(parsed.relays).toEqual(['wss://relay.damus.io']);
    expect(parsed.hasSecret).toBe(true);
  });

  it('rejects missing bunker scheme', () => {
    expect(() => parseBunkerUri(`nostrconnect://${PUB}`)).toThrow(/bunker:\/\//);
  });

  it('rejects missing relay', () => {
    expect(() => parseBunkerUri(`bunker://${PUB}?secret=x`)).toThrow(/relay/);
  });
});

describe('redactBunkerUri', () => {
  it('strips the secret query value', () => {
    const redacted = redactBunkerUri(URI);
    expect(redacted).toContain('secret=redacted');
    expect(redacted).not.toContain('super-secret-token');
    expect(redacted).toContain(PUB);
  });
});
