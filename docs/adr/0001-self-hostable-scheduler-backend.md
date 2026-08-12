# ADR 0001: Self-Hostable Scheduler Backend & Configurable Backend URL

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** Project owner (bitcoinbekka) + Shakespeare AI
- **Technical Story:** Scheduled publishing stopped working on the Netlify
  deployment; owner wants to run the scheduler on their own server and prepare
  it to be "pluggable" into the Plebeian Market codebase.

---

## Context

Plebeian Scheduler stores **pre-signed** Nostr events and publishes them to
relays at a scheduled time. The browser signs each event (keys never leave the
client) and hands the signed event to a backend, which persists it and later
sends it to relays.

The original backend was a **Netlify Function** (`netlify/functions/scheduler.mjs`)
that:

1. Stored pre-signed events in **Netlify Blobs** (via the raw HTTP API).
2. Relied on an **external cron service** (cron-job.org) hitting
   `?action=cron&key=CRON_SECRET` every minute to publish due events, plus a
   native Netlify scheduled function.
3. Was reached by the frontend at a **hard-coded path**:
   `/.netlify/functions/scheduler` (`src/lib/schedulerApi.ts`).

### Problems with the original design

- **Fragile operationally.** Publishing silently breaks if the external cron
  lapses, or if `NETLIFY_API_TOKEN` / `SITE_ID` are missing/expired. Observed in
  production: the function endpoint timed out (HTTP 522 through a proxy) while
  the static site kept working.
- **No visibility.** There was no UI signal that the backend was down, so
  failures were silent.
- **Vendor lock-in.** Netlify Blobs + hard-coded function path made it
  impossible to run the scheduler anywhere else without code changes.
- **Integration goal.** Plebeian Market is migrating to the **Applesauce**
  Nostr library, and the owner wants the scheduler to eventually plug into the
  Plebeian codebase as an optional merchant feature. A portable backend with a
  clean, stable API is a prerequisite for that.

---

## Decision

We made three coordinated changes.

### 1. Make the scheduler backend URL configurable

- Added `schedulerBackendUrl: string` to `AppConfig`
  (`src/contexts/AppContext.ts`, default `""` in `src/App.tsx`).
- `src/lib/schedulerApi.ts` now resolves every request against a runtime base
  URL. Empty string falls back to the built-in default path
  (`/.netlify/functions/scheduler`), preserving existing behavior.
- `SchedulerBackendSync` (`src/components/SchedulerBackendSync.tsx`) bridges the
  reactive `AppConfig` value into the module-level base URL used by the plain
  API functions.
- A Settings UI (`src/components/SchedulerBackendSettings.tsx`) lets users set,
  test, and reset the backend URL.

### 2. Add a scheduler health/status indicator

- `useSchedulerHealth` (`src/hooks/useSchedulerHealth.ts`) polls the backend
  health endpoint and derives a status:
  - `online` — reachable **and** storage connected (posts will publish).
  - `degraded` — reachable but storage not configured (won't publish).
  - `offline` — unreachable (falls back to local, tab-open publishing).
- `SchedulerStatusIndicator` (`src/components/SchedulerStatusIndicator.tsx`)
  shows this in the sidebar; the Settings card shows a detailed version.

### 3. Provide a portable, self-hostable backend

- Added `server/` — a standalone Node service that is a **drop-in replacement**
  for the Netlify function, exposing the **same HTTP API**:
  - `GET /` health check
  - `POST /` schedule a pre-signed event
  - `GET /?id=<id>` status
  - `DELETE /?id=<id>` cancel
  - `GET /?action=cron&key=<CRON_SECRET>` optional manual trigger
- Implementation choices:
  - **Zero npm dependencies.** Uses Node 22's built-in `node:sqlite` for
    storage and native `WebSocket` for relay publishing.
  - **Built-in publish timer** (`setInterval`, default 60s) — no external cron
    required (the cron endpoint is retained for compatibility).
  - **SQLite file** at `$DATA_DIR/scheduler.db` (a single, easily backed-up file).
  - Ships with `Dockerfile`, `docker-compose.yml`, `.env.example`, and a README.

---

## Consequences

### Positive

- **Portable / no lock-in.** The app can point at any backend implementing the
  API. Self-hosting is a config change, not a code change.
- **Operationally simpler when self-hosted.** Self-contained storage + internal
  timer removes the two most common failure modes (external cron, Blobs creds).
- **Observable.** The health indicator makes outages visible instead of silent.
- **Backward compatible.** Empty `schedulerBackendUrl` keeps the existing
  Netlify behavior, so nothing breaks for the current deployment.
- **Integration-ready.** The stable API is the real "pluggable" surface for
  Plebeian Market, independent of the frontend Nostr library.

### Negative / Trade-offs

- **Two backends to maintain** (Netlify function + `server/`). They implement
  the same contract but are separate codebases and can drift. _Mitigation:_
  treat the HTTP contract as the source of truth; keep both in sync or retire
  the Netlify function once self-hosting is standard.
- **Node 22.5+ required** for `node:sqlite` (still marked experimental in some
  Node versions). The Docker image pins `node:22-alpine` to control this.
- **Backend publishes to relays anonymously** (no NIP-42 AUTH). Relays that
  require AUTH for writes may reject scheduled events. _Mitigation:_ prefer
  relays that accept unauthenticated writes; consider adding AUTH later.
- **No auth on `POST /`.** Anyone who can reach the endpoint can enqueue a
  (pre-signed, so not impersonatable) event and consume storage. _Mitigation:_
  add NIP-98 or a shared secret before exposing a public instance long-term.
- **`created_at` drift.** Events are signed at schedule time, so `created_at`
  reflects signing time, not publish time (the signature covers `created_at`).
  This is inherent to the pre-signed approach.

---

## Alternatives Considered

1. **Patch the Netlify function** (re-add creds, fix cron). _Rejected as the
   primary path:_ throwaway work that doesn't address lock-in or the Plebeian
   integration goal. Still viable as a short-term hotfix.
2. **DVM-based scheduled publishing (NIP-90 kind 5905).** Trustless and
   relay-native, but depends on DVM availability/adoption and is more complex.
   Noted as future work (`buildDvmPublishRequest` scaffolding already exists).
3. **Heavier backend stack (Express + Postgres/Redis).** Rejected for now —
   overkill for a single-merchant scheduler; SQLite + zero deps is far simpler
   to self-host on a small VPS.

---

## Deployment Reference (first self-host, 2026-08-12)

- **VPS:** Sovereign Hybrid Compute, Ubuntu 24.04 LTS, IP `23.182.128.82`.
- **Domain:** `plebeian.build` (Njalla); subdomain `scheduler.plebeian.build`
  → A record → VPS IP.
- **Runtime:** Docker + `docker compose` running the `server/` image.
- **TLS / reverse proxy:** Caddy (automatic Let's Encrypt) proxying
  `scheduler.plebeian.build` → `127.0.0.1:8080`.
- **Gotcha encountered:** provider firewall rules defaulted to `Drop`; inbound
  TCP **80/443** (and **22** for SSH) had to be set to `Accept` before Caddy
  could obtain a certificate.
- **App wiring:** Settings → Scheduler Backend → `https://scheduler.plebeian.build`.

---

## Related

- Frontend library migration **Nostrify → Applesauce** is intentionally **out of
  scope** for this ADR and deferred to the Plebeian dev team. Note: the project
  uses **Nostrify**, not NDK (a common misconception). See the Handover doc.
- See `server/README.md` for full self-hosting instructions and the API spec.
- See `HANDOVER.md` for operational state and next steps.
