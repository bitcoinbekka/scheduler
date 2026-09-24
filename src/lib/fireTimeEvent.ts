/**
 * Unsigned note templates for fire-time NIP-46 signing.
 * created_at is stamped by the server at publish, not at schedule.
 */

export interface UnsignedNoteTemplate {
  kind: number;
  content: string;
  tags: string[][];
  pubkey: string;
}

export interface BuiltEventFields {
  kind: number;
  content: string;
  tags: string[][];
}

export function templateFromBuild(built: BuiltEventFields, pubkey: string): UnsignedNoteTemplate {
  if (!pubkey || !/^[0-9a-f]{64}$/i.test(pubkey)) {
    throw new Error('unsigned template requires a hex pubkey');
  }
  return {
    kind: built.kind,
    content: built.content,
    tags: built.tags,
    pubkey: pubkey.toLowerCase(),
  };
}

/** Stamp created_at at fire time. Relays reject future timestamps. */
export function stampCreatedAt(
  template: UnsignedNoteTemplate,
  now: number,
): UnsignedNoteTemplate & { created_at: number } {
  if (!Number.isFinite(now) || now <= 0) {
    throw new Error('fire-time created_at must be a unix seconds timestamp');
  }
  return {
    kind: template.kind,
    content: template.content,
    tags: template.tags,
    pubkey: template.pubkey,
    created_at: Math.floor(now),
  };
}
