# ADR 0008: Bunker Architecture and Key Custody for Scheduled Signing

**Status:** Proposed
**Date:** 2026-09-25
**Context:** NIP-46 signing, self-hosted bunker, merchant-facing product
**Supersedes:** Extends ADR 0007 (scheduled publishing and created_at)

---

## Problem

ADR 0007 established that scheduled posts need to be signed at
*publish time*, not at *schedule time*, so that `created_at` reflects
the actual moment of publication. The recommended fix was NIP-46
remote signing: the backend requests a signature from the user's
signer when the post is due.

This ADR documents what we learned while implementing that
recommendation in production, and how the signer architecture
affects the product.

## What We Tried

### Amber (phone-based NIP-46 signer)

Amber is a popular Android signer that implements NIP-46 over
Nostr relays. The flow:

1. User generates a `bunker://` URI from Amber
2. Scheduler backend stores the URI (encrypted at rest)
3. At publish time, backend sends a `sign_event` request to the
   relay listed in the URI
4. Amber receives the request, shows a notification, user taps
   approve, signature returns

**Result: failed in production.**

- Amber's relay list was entirely unreachable from the test device
- Even after manually adding `wss://relay.damus.io`, relays showed
  as "Unavailable" in Amber's UI
- NIP-46 requires *both* the scheduler and the signer to be
  connected to the *same* relay simultaneously. If either side
  can't reach it, the request is silently dropped.
- Mobile network conditions (carrier WebSocket filtering, DNS
  issues) made this unreliable in practice

This is not an Amber bug per se. It's a fundamental fragility of
relay-mediated signing when the signer is on a mobile device.

### Self-hosted bunker (Plebeian Bunker)

To work around Amber's relay unreliability, a self-hosted NIP-46
signer was built into the scheduler backend. The flow:

1. User provides their nsec to the bunker (via config or UI)
2. Bunker stores the nsec encrypted at rest with a passphrase
3. At publish time, the backend requests a signature locally
   (no relay hop required)
4. Bunker decrypts the nsec, signs, returns the signature

**Result: works, but changes the trust model.**

The bunker is "always-on" because it runs on the same server as
the scheduler. No phone, no relay, no notification, no approval
step. The trade-off is that the nsec now lives on the VPS.

## The Three Key-Custody Models

| Model | Where the key lives | Who can sign silently | Reliability |
|---|---|---|---|
| **NIP-07 (browser)** | Browser extension | Only while user is present | N/A for scheduling |
| **NIP-46 (phone signer)** | Phone secure storage | Only after user approval | Low (relay-dependent) |
| **Self-hosted bunker** | Server (encrypted at rest) | Yes, automatically | High |

None of these is obviously correct for a merchant-facing product.

## Impact on the Product

### For merchants

A merchant who wants to schedule a post at 8 AM faces:

- **NIP-07:** impossible, requires browser open
- **NIP-46 / Amber:** unreliable, requires phone online and relays reachable
- **Self-hosted bunker:** requires giving the server the nsec

None of these is acceptable for a non-technical user who just
wants to promote their stall.

### For the platform

If Plebeian hosts a bunker for merchants, Plebeian becomes a
custodian of merchant keys. That contradicts the "your keys"
principle and creates a security liability. If Plebeian requires
merchants to self-host, the product is out of reach for anyone
without a VPS.

## Options Considered

### Option A: NIP-46 with Amber (phone signer)

- **Pros:** Key stays on user's phone. No custodial risk.
- **Cons:** Requires phone online at publish time. Relay-dependent.
  Failed in production testing.
- **Verdict:** Not viable as the only path.

### Option B: Self-hosted bunker on the user's own VPS

- **Pros:** Reliable. No third party. No relay dependency.
- **Cons:** Requires a VPS. Key lives on the server, encrypted
  with a passphrase. The passphrase must be available at startup
  for auto-signing, which usually means storing it in a config
  file next to the encrypted key. On a compromised server, both
  are accessible.
- **Verdict:** Viable for technically capable users. Not for
  average merchants.

### Option C: Home-hosted bunker + VPN to the VPS

- **Pros:** Key stays on hardware the user physically controls.
  No cloud key custody. Always-on if the home machine is always-on.
- **Cons:** Requires a home machine, VPN setup, and port routing.
  Too complex for non-technical users.
- **Verdict:** The "best of both worlds" for power users. Not a
  product.

### Option D: Delegated signing key (NIP-26)

- **Pros:** Backend signs with a scoped sub-key. No nsec on server.
- **Cons:** NIP-26 is not widely supported by clients. Adds a
  delegation tag. Poor ecosystem adoption.
- **Verdict:** Not recommended. Listed for completeness.

### Option E: Pre-signed events (status quo)

- **Pros:** Zero key exposure. Works today.
- **Cons:** `created_at` is fixed at schedule time. Posts get
  buried in feeds, rejected by relays, and don't trigger
  notifications. This is the problem ADR 0007 was written to solve.
- **Verdict:** Acceptable as a fallback. Not a fix.

### Option F: Don't support scheduling (ship "post now" only)

- **Pros:** No key custody problem. No signer required.
- **Cons:** Loses the core feature merchants asked for.
- **Verdict:** Honest fallback if nothing else works.

## Recommendation

**For the scheduler as a standalone tool:**

Support **three modes**, user-selected:

1. **Presigned (default, safest):** No key exposure. Warning
   shown: "Scheduled posts may have reduced reach."
2. **NIP-46 (advanced):** For users who already run Amber,
   nsec.app, or a bunker. Requires working relays.
3. **Self-hosted bunker (power users):** Documented clearly
   as "you are the custodian." Requires a passphrase-protected
   nsec, with the passphrase NOT stored in the same directory.

**For Plebeian Market integration:**

Do not make scheduling depend on key custody. Either:

- Build a **first-party signer** that works reliably for
  merchants (hosted, but with clear disclosure and scoped
  signing permissions), OR
- Ship scheduling as a **"post now" reminder** — the merchant
  gets a notification and publishes from their own client when
  they're ready.

The second option is unsexy but honest. It sidesteps the entire
custody problem by not pretending the platform can sign on the
merchant's behalf without trust.

## Security Requirements for Any Bunker Implementation

If a self-hosted bunker is used, it MUST:

1. Encrypt the nsec at rest with a strong passphrase (Argon2 or
   scrypt, not plain AES).
2. Require the passphrase to be provided at startup — either
   interactively or via an environment variable stored OUTSIDE
   the directory containing the encrypted key.
3. Scope signing permissions: the bunker should only sign the
   event kinds the scheduler actually needs (e.g., kind 1 and
   kind 30023). It should refuse to sign kind 0 (profile) or
   kind 3 (follows) or any event that could be used for
   impersonation.
4. Log every signature request with timestamp, kind, and
   content hash — so the user can audit what was signed on
   their behalf.
5. Support key rotation: the user can revoke the bunker's
   access without losing their npub.

## Migration Path

1. Keep presigned as the default. Ship the warning message.
2. Add NIP-46 as an opt-in mode. Document the relay requirement.
3. Add self-hosted bunker as an advanced mode. Document the
   custody trade-off prominently.
4. Do not default to any key-custody model. The user chooses.
5. Feed this ADR into the Plebeian Market integration discussion
   so the platform-level decision is made deliberately, not by
   accident.

## References

- ADR 0007: Scheduled publishing and the `created_at` constraint
- NIP-07: Browser extension signing
- NIP-26: Delegated event signing (not recommended)
- NIP-46: Nostr remote signing (bunker)
- nsecbunkerd: https://github.com/kind-0/nsecbunkerd
- Amber: https://github.com/greenart7c3/Amber
- Plebeian Signer: https://github.com/PlebeianApp/plebeian-signer
- Current implementation:
  - `server/scheduler-server.mjs` — backend, publish timer, bunker
  - `server/nip46-sign.mjs` — NIP-46 request handling
  - `server/secret-box.mjs` — encryption at rest
  - `src/components/SchedulerBunkerSettings.tsx` — UI

---

*This ADR was written after real-world testing revealed that
phone-based NIP-46 signing (Amber) is unreliable for scheduled
publishing, and that self-hosted bunkers solve reliability but
introduce key custody. Neither is a complete answer for
non-technical merchants. The recommendation is to support multiple
modes and let the Plebeian Market integration decision be made
deliberately.*
