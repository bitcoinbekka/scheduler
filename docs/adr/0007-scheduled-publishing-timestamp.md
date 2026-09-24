[PASTE THE ENTIRE ADR CONTENT HERE]
# ADR 0007: Scheduled Publishing and the created_at Constraint

**Status:** Proposed
**Date:** 2026-09-24
**Context:** Self-hosted scheduler backend, NIP-46/NIP-07 signing

---

## Problem

The scheduler allows users to compose posts and schedule them for future
publishing. When a post is published hours or days after it was composed,
the resulting Nostr event carries a `created_at` timestamp from the moment
it was **signed**, not the moment it was **published**.

This is a cryptographic constraint, not a bug in the implementation:

- `created_at` is part of the signed event payload
- The signature covers `created_at` (NIP-01)
- The backend cannot modify `created_at` after signing without invalidating
  the signature
- The backend does not have the user's private key, and should not

Current flow:

1. User composes a post at 9:00 AM and schedules it for 6:00 PM
2. Browser signs the event with `created_at: 9:00 AM`
3. Backend stores the signed event in SQLite
4. At 6:00 PM, backend forwards the signed event to relays **unchanged**
5. Relays receive an event with `created_at: 9:00 AM`

## Impact

This breaks the expected semantics of scheduled publishing in four ways:

### 1. Relay rejection

Many public relays enforce a maximum age for incoming events (typically
several hours). Events older than the threshold are silently dropped.
A post scheduled 12 hours ahead may publish successfully to some relays
and fail silently on others.

### 2. Feed ordering

Clients sort notes by `created_at` (descending). A post published at 6:00 PM
with a `created_at` of 9:00 AM appears below every note published between
those times. The post never surfaces at the top of followers' feeds.

### 3. Notification suppression

Followers are notified when they encounter a *new* event with a *fresh*
`created_at`. A stale timestamp does not trigger notifications in most
clients, so followers never learn the post exists.

### 4. Outbox model routing

Clients using Nostr's outbox model (NIP-65) fetch events based on freshness
and author relay lists. Stale `created_at` values can cause the event to be
treated as already-seen or excluded from feed queries.

## Observed Consequences

In practice, scheduled posts receive substantially less engagement than
posts published immediately. The content itself may be identical; the
difference is that scheduled posts are not reaching feeds, notifications,
or relay indexes in the same way.

This issue affects **all** users of the scheduler, not a subset.

## Options Considered

### Option A: NIP-46 Remote Signing at Publish Time

The backend wakes at publish time and requests a fresh signature from the
user's NIP-46 signer (bunker) over the network. The signer constructs and
signs a new event with `created_at = now`, and the backend publishes it.

- **Pros:** Correct semantics. Private key never leaves the signer.
  Fully Nostr-native.
- **Cons:** Requires the user's signer to be online and reachable at
  publish time. If the signer is offline, the post cannot be published.
- **Best for:** Users who already run a NIP-46 signer and want strict
  key custody.

### Option B: Delegated Signing Key

A scoped sub-key is derived (or issued) at schedule time and held by the
backend. The key is authorized to sign only certain event kinds, or only
for a specific app context. The backend signs the event at publish time
with `created_at = now`.

- **Pros:** Simple, reliable, no dependency on the signer being online.
- **Cons:** Introduces a trust relationship — the backend holds a key
  that can sign as the user. Requires careful scoping and clear disclosure.
- **Best for:** Users who prioritize reliability and are comfortable with
  a delegated signing model.

### Option C: NIP-90 DVM Publishing

The frontend publishes a NIP-90 job request (kind 5905) describing the
event to be published and the desired publish time. A DVM running on the
user's own server (or a trusted one) picks up the job, signs the event at
the right moment, and publishes it.

- **Pros:** Fully decentralized. Uses NIP-90, which is already implemented
  in `eventBuilder.ts`. The user can run the DVM on their own infrastructure.
- **Cons:** Requires a DVM to be online and funded. Adds another moving
  part to the publishing pipeline.
- **Best for:** Users who want maximum sovereignty and are willing to
  operate a DVM.

### Option D: Status Quo (Document the Limitation)

Keep the current architecture and document the constraint prominently.

- **Pros:** Zero code change.
- **Cons:** Scheduled posts continue to underperform. The feature is
  effectively "publish later, but with reduced reach."
- **Best for:** Nothing. This is a non-solution, listed for completeness.

## Recommendation

The choice depends on the target user:

- **For Plebeian Market merchants:** Option B (delegated key) or Option A
  (NIP-46), depending on the merchant's technical comfort and whether they
  already run a signer.
- **For users running their own infrastructure:** Option C (DVM) is the
  most sovereign path and matches the "self-hostable" ethos of this project.

A hybrid approach is also viable: default to Option A when a NIP-46 signer
is connected, fall back to Option B for users who opt in, and expose Option C
as an advanced configuration.

## Migration Path

1. Add a `signing_mode` field to the scheduled event record
   (`nip46` | `delegated` | `dvm` | `legacy`)
2. For new posts, capture the mode at schedule time
3. For existing posts, treat them as `legacy` and publish as-is
4. Implement the chosen mode(s) in the backend publisher
5. Document the trade-offs in the user-facing settings

## References

- NIP-01: Basic protocol flow (event structure, `created_at` is signed)
- NIP-46: Nostr remote signing (bunker)
- NIP-65: Relay list metadata (outbox model)
- NIP-90: Data Vending Machines
- Current implementation:
  - `src/lib/eventBuilder.ts` — event construction and signing
  - `src/hooks/useSchedulerPublish.ts` — client-side signing and publishing
  - `server/scheduler-server.mjs` — backend storage and publishing timer
- `README.md` — "Known Limitations" section documents the current behavior

---

*This ADR was written in response to observed low engagement on scheduled
posts. The root cause is that `created_at` is fixed at signing time, and
relays, feeds, and notification systems all rely on `created_at` freshness.*
