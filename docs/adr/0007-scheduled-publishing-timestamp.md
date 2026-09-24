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

### Option A: NIP-46 Remote Signing at Publish Time (Recommended)

The backend stores the *unsigned* event data (content, tags, intended
publish time). At publish time, it sends a `sign_event` request over
Nostr to the user's NIP-46 signer (bunker). The signer constructs and
signs a fresh event with `created_at = now`, and the backend publishes it.

- **Pros:** Correct semantics. Private key never leaves the signer.
  Fully Nostr-native. The published event is indistinguishable from one
  signed directly by the user's client.
- **Cons:** Requires the user's signer to be online and reachable at
  publish time. If the signer is offline, the post cannot be published.
- **Best for:** Merchants who already run a NIP-46 signer (nsec.app,
  Amber, or a self-hosted bunker) and want correct timestamps without
  handing over keys.

**Deployment note:** The signer can run on the same server as the
backend (self-hosted bunker), on the user's phone (Amber), or as a
hosted service (nsec.app). The backend only needs a `bunker://` URL.
For scheduled publishing to work unattended, the signer must be
configured to auto-approve `sign_event` requests from the backend's
pubkey. This is a one-time setup step the merchant performs.

**Important distinction — NIP-46 vs NIP-07:**
The Plebeian browser extension (`PlebeianApp/plebeian-signer`) implements
NIP-07, which signs events when the user is present in the browser. It
cannot sign at 8:00 AM while the user sleeps. For scheduled publishing,
a NIP-46 bunker is required. These are complementary, not interchangeable:
NIP-07 for interactive sessions, NIP-46 for delegated/server-initiated
signing.

### Option B: Delegated Signing Key (NIP-26)

A scoped sub-key is authorized via NIP-26 to sign events on behalf of the
user's primary key. The backend holds the sub-key and signs at publish time.

- **Pros:** No dependency on the signer being online. Simple to operate.
- **Cons:** NIP-26 is not widely supported by current clients. Adds a
  delegation tag to every event. Introduces a trust relationship — the
  backend holds a key that can sign as the user. The published event's
  `pubkey` is the delegator's, but clients that don't understand NIP-26
  may display it as unverified or attribute it to the delegatee.
- **Best for:** Legacy compatibility. Not recommended for new deployments.

### Option C: NIP-90 DVM Publishing

The frontend or backend publishes a NIP-90 job request (kind 5905) with
a future publish time. A DVM picks up the job, signs at the right moment,
and publishes.

- **Pros:** Uses NIP-90, which the scheduler already partially implements
  (`buildDvmPublishRequest` in `eventBuilder.ts`). Fits the "public
  utility" framing of Nostr infrastructure.
- **Cons:** NIP-90 is currently marked **unrecommended** in the protocol
  repository, with the note: *"this got totally out of control, prefer
  use-case-specific microstandards."* The public DVM ecosystem is thin —
  a handful of implementations (e.g., Dart `nostr_scheduler_dvm`) but
  low adoption. A public DVM is a distribution channel, not a foundation.
- **Best for:** Post-launch distribution. Not a v1 requirement.

**Clarification on public vs private DVMs:** There is no "private DVM"
concept in the protocol. A DVM is simply a pubkey watching relays for
job requests. An operator can run one that only responds to their own
jobs (effectively private) or announce it publicly via NIP-89. Most
practical deployments today are effectively private — one operator,
their own jobs. The protocol-level concept is public discovery; the
practical reality is often single-tenant.

### Option D: Status Quo (Document the Limitation)

Keep the current architecture and document the constraint prominently.

- **Pros:** Zero code change.
- **Cons:** Scheduled posts continue to underperform. The feature is
  effectively "publish later, but with reduced reach."
- **Best for:** Nothing. Listed for completeness only.

## Recommendation

**Adopt Option A (NIP-46 remote signing at publish time).**

Rationale:

1. It is the only option that fully solves the `created_at` problem
   without compromising key custody or requiring protocol changes.
2. NIP-46 is a mature, actively used standard with multiple
   implementations (nsec.app, Amber, Nostrify, NDK).
3. It aligns with the project's sovereignty principle: keys stay with
   the merchant, and the server never holds a signing capability.
4. It preserves the existing architecture — the backend still stores
   scheduled jobs and runs the publish timer; only the signing step
   changes.

**Productization path (in order):**

1. **Ship the scheduler as an optional Plebeian Market tool.**
   Merchants already want "post my jam Tuesday." Host it on the
   Plebeian server. Charge zaps (or an optional monthly queue fee).
   Self-hosters point the same UI at their own URL. Same Docker image,
   two doors.
2. **Add NIP-46 signing at publish time.** Merchants connect a bunker.
   The job runner requests a signature when due, then publishes. No
   nsec on disk, ever.
3. **Only then announce a NIP-89 service for kind 5905.** The DVM is
   how the rest of Nostr discovers the service. Hosted merchants never
   need to know the word "DVM."

**Do not hold merchants' nsec.** If Plebeian can post as them without
asking, the platform has become a custodian — which contradicts the
"your keys" principle and creates a security liability.

## Migration Path

1. Add a `signing_mode` field to the scheduled event record
   (`nip46` | `legacy`)
2. For new posts, capture the mode at schedule time
3. For existing posts, treat them as `legacy` and publish as-is
4. Implement the NIP-46 request flow in the backend publisher
5. Add a "Connect Signer" step to the scheduler onboarding flow
6. Document the auto-approve configuration in the user guide

## References

- NIP-01: Basic protocol flow (event structure, `created_at` is signed)
- NIP-07: Browser extension signing (interactive sessions)
- NIP-26: Delegated event signing (not recommended)
- NIP-46: Nostr remote signing (bunker) — **the recommended path**
- NIP-65: Relay list metadata (outbox model)
- NIP-89: Recommended application handlers (DVM discovery)
- NIP-90: Data Vending Machines (currently unrecommended)
- Plebeian Signer: https://github.com/PlebeianApp/plebeian-signer (NIP-07)
- Current implementation:
  - `src/lib/eventBuilder.ts` — event construction and signing
  - `src/hooks/useSchedulerPublish.ts` — client-side signing and publishing
  - `server/scheduler-server.mjs` — backend storage and publishing timer
- `README.md` — "Known Limitations" section documents the current behavior

---

*This ADR was written in response to observed low engagement on scheduled
posts. The root cause is that `created_at` is fixed at signing time, and
relays, feeds, and notification systems all rely on `created_at` freshness.
The recommended fix (NIP-46 remote signing at publish time) preserves the
private key with the merchant while producing correctly-timestamped events.*
