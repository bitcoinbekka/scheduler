# Plebeian Scheduler — Developer Handover

**Last updated:** 2026-08-12
**Audience:** Plebeian dev team taking over / integrating the scheduler.
**Companion docs:** `docs/adr/0001-self-hostable-scheduler-backend.md`,
`server/README.md`, `README.md`, `NIP.md`.

---

## 1. TL;DR

Plebeian Scheduler is a client-side React app (MKStack template) that schedules
**pre-signed** Nostr events and publishes them at a set time via a small
backend. Recent work made the backend **self-hostable** and the backend URL
**configurable**, and added a **health indicator** in the UI.

There is now a live, owner-operated self-hosted backend at
**`https://scheduler.plebeian.build`**, and the app is pointed at it.

The strategic goal is to fold this into **Plebeian Market**, which is migrating
to the **Applesauce** Nostr library. The scheduler currently uses **Nostrify**
(not NDK). The frontend library migration is **not yet done** and is the main
piece of work handed to the dev team.

---

## 2. Architecture at a glance

```
Browser (React SPA)
  1. User composes a post
  2. Browser signs the Nostr event (NIP-07/NIP-46) — keys never leave client
  3. POST signed event + publishAt to the backend
        │
        ▼
Backend (choose ONE via Settings → Scheduler Backend URL)
  • Default: Netlify Function  (netlify/functions/scheduler.mjs, Netlify Blobs)
  • Self-hosted: server/       (Node 22 + SQLite, internal publish timer)
        │  when publishAt <= now
        ▼
Nostr relays  (opens WebSocket, sends ["EVENT", signedEvent])
```

- **Keys never touch the server.** The browser signs; the backend only stores
  and forwards the already-signed event.
- **Local fallback:** if the backend is unreachable at schedule time, the post
  is stored locally and published from the browser (`useSchedulerPublish`),
  which requires the tab to stay open.
- **Client data** (drafts, queues, templates, post metadata) lives in
  `localStorage`. Only the pre-signed event blob goes server-side.

---

## 3. Tech stack

- React 19, TypeScript, Vite
- TailwindCSS 3, shadcn/ui (Radix)
- **Nostrify** (`@nostrify/nostrify`, `@nostrify/react`) + `nostr-tools`
- TanStack Query, React Router v6, React Hook Form + Zod, date-fns
- Backends: Netlify Functions **or** the self-host Node service in `server/`

---

## 4. What changed most recently (commit `a3f2b56`)

> ⚠️ **Not yet on GitHub.** See §8 — GitHub push credentials were expired at the
> time of writing, so this commit lives locally / in the Shakespeare workspace
> and was deployed to the VPS by manually copying files. **Push it to GitHub as
> priority #1** so `git clone` reflects reality.

**New files**
- `server/scheduler-server.mjs` — self-host backend (zero deps).
- `server/Dockerfile`, `server/docker-compose.yml`, `server/.dockerignore`,
  `server/.env.example`, `server/package.json`, `server/README.md`.
- `src/components/SchedulerBackendSettings.tsx` — Settings UI (set/test/reset URL).
- `src/components/SchedulerBackendSync.tsx` — syncs AppConfig → API client.
- `src/components/SchedulerStatusIndicator.tsx` — sidebar status pill.
- `src/hooks/useSchedulerHealth.ts` — polls backend health.

**Modified files**
- `src/contexts/AppContext.ts` — added `schedulerBackendUrl` to `AppConfig`.
- `src/App.tsx` — default `schedulerBackendUrl: ""`; mounts `SchedulerBackendSync`.
- `src/components/AppProvider.tsx` — Zod schema includes `schedulerBackendUrl`.
- `src/lib/schedulerApi.ts` — runtime base-URL override + `checkSchedulerHealth`.
- `src/components/AppLayout.tsx` — renders the status indicator.
- `README.md` — self-hosting section.

---

## 5. Backend API contract (source of truth)

Both backends implement this identical HTTP API. Treat it as the integration
contract if you write a new backend or embed it in Plebeian.

| Method   | Path                              | Purpose                     |
|----------|-----------------------------------|-----------------------------|
| `GET`    | `/`                               | Health check                |
| `POST`   | `/`                               | Schedule a pre-signed event |
| `GET`    | `/?id=<eventId>`                  | Status of a scheduled event |
| `DELETE` | `/?id=<eventId>`                  | Cancel a pending event      |
| `GET`    | `/?action=cron&key=<CRON_SECRET>` | Manual publish trigger (opt)|

**Health response**
```json
{ "ok": true, "service": "...", "storage": "connected", "method": "ready" }
```
The UI treats `storage === "connected"` or `method === "ready"` as
"storage ready".

**POST body**
```json
{
  "signedEvent": { "id": "...", "pubkey": "...", "sig": "...", "kind": 1,
                   "content": "...", "tags": [], "created_at": 1712345678 },
  "publishAt": 1712345678,
  "relays": ["wss://relay.damus.io"]
}
```

**Status values:** `pending` | `published` | `failed`.

---

## 6. Self-hosted backend (`server/`)

- **Runtime:** Node 22.5+ (uses built-in `node:sqlite` + native `WebSocket`).
- **Storage:** single SQLite file at `$DATA_DIR/scheduler.db`.
- **Publishing:** internal `setInterval` every `CHECK_MS` (default 60s). No
  external cron needed.
- **Env vars:** `PORT` (8080), `DATA_DIR` (`./data`), `CRON_SECRET` (optional),
  `CHECK_MS` (60000). See `server/.env.example`.

**Run (Docker):**
```bash
cd server
docker compose up -d --build
```
Full instructions, reverse-proxy configs, and API reference: `server/README.md`.

---

## 7. Current production/self-host deployment

| Item              | Value                                                    |
|-------------------|----------------------------------------------------------|
| VPS provider      | Sovereign Hybrid Compute                                 |
| OS                | Ubuntu 24.04 LTS                                         |
| Server IP         | `23.182.128.82`                                          |
| SSH user          | `ubuntu` (SSH key auth; **no root password login**)      |
| Domain / registrar| `plebeian.build` @ Njalla                                |
| Backend URL       | `https://scheduler.plebeian.build`                       |
| DNS               | `A  scheduler → 23.182.128.82` (TTL 60)                  |
| Container path    | `~/plebeian-scheduler/server`                            |
| Reverse proxy/TLS | Caddy → `127.0.0.1:8080` (auto Let's Encrypt)            |
| Firewall          | Inbound TCP **22, 80, 443** = Accept (provider firewall) |
| App wiring        | Settings → Scheduler Backend = the URL above; status 🟢  |

**Important operational notes**
- The VPS was provisioned by **manually copying** the `server/` files (GitHub
  push creds were expired). Once pushed, prefer `git clone` + `git pull` there.
- The old Netlify deployment (`plebeian-scheduler.netlify.app`) was **failing**
  (function timed out — likely missing Blobs creds and/or lapsed cron). Decide
  whether to fix, repurpose, or retire it.
- Provider firewall defaulted rules to `Drop`; **80/443/22 must be `Accept`** or
  Caddy cannot obtain a certificate and you can lock out SSH.

**Common server commands** (run in `~/plebeian-scheduler/server`):
```bash
sudo docker compose ps            # is it running?
sudo docker compose logs -f       # follow logs
sudo docker compose restart       # restart
sudo docker compose up -d --build # rebuild after code changes
```
The container uses `restart: unless-stopped`, so it survives reboots.

---

## 8. Immediate to-dos for the dev team

Priority order:

1. **Push commit `a3f2b56` to GitHub.** GitHub creds were expired; the latest
   code (including all of `server/`) is **not on `origin/main`** yet. Until this
   is done, cloning the repo gives stale code without the self-host backend.
2. **Decide the Netlify site's fate** (fix creds/cron, or retire in favor of the
   VPS). Update DNS/links accordingly.
3. **Verify end-to-end publish** on the self-hosted backend (schedule a post a
   few minutes out, close the tab, confirm it publishes). This was set up but
   not yet confirmed end-to-end by the owner at handover time.
4. **Add backend auth** before any public/multi-user exposure (NIP-98 or a
   shared secret on `POST /`).

---

## 9. Larger roadmap / known limitations

- **Nostrify → Applesauce migration (owner-requested, deferred to devs).** Align
  the frontend Nostr library with Plebeian Market so the scheduler can plug in
  as an optional merchant feature. Touchpoints:
  - `src/components/NostrProvider.tsx` (NPool/NRelay1, relay routing, NIP-42 AUTH)
  - `src/App.tsx` (`NostrLoginProvider` from `@nostrify/react/login`)
  - Login/signing: `NUser` + `useCurrentUser`, `useLoginActions`,
    `useLoggedInAccounts`
  - Every `useNostr()` consumer (queries/publishing), e.g. `useAuthor`,
    `useNostrPublish`, `useMyListings`, `usePostEngagement`, DMs, comments, zaps
  - Encryption: `signer.nip44` in the DM code
  - The scheduler backend, configurable URL, and health indicator sit **above**
    the Nostr library and are unaffected by this migration.
- **`created_at` drift** — signed at schedule time, not publish time (inherent
  to pre-signing; signature covers `created_at`).
- **Anonymous relay publishing** — the backend does not perform NIP-42 AUTH;
  AUTH-required relays may reject scheduled events.
- **Single-user / localStorage** — no cross-device sync of drafts/queues.
- **DVM publishing (NIP-90 kind 5905)** — scaffolding exists
  (`buildDvmPublishRequest`) for a future trustless publishing path.
- **NIP-46 fire-time signing** — Slice 1. Self-hosted backend can store an
  unsigned template and ask Amber at publish time. See `docs/NIP46-FIRE-TIME.md`.
  Pre-signed path is unchanged. Plebeian Signer remains NIP-07 only.

---

## 10. Key files reference

| File | Purpose |
|------|---------|
| `server/scheduler-server.mjs` | Self-host backend (SQLite + timer + relay publish) |
| `netlify/functions/scheduler.mjs` | Netlify backend (Netlify Blobs + cron) |
| `src/lib/schedulerApi.ts` | Frontend API client; runtime base-URL override |
| `src/components/SchedulerBackendSync.tsx` | Pushes AppConfig URL into the API client |
| `src/components/SchedulerBackendSettings.tsx` | Settings UI: set/test/reset backend URL |
| `src/hooks/useSchedulerHealth.ts` | Health polling + status derivation |
| `src/components/SchedulerStatusIndicator.tsx` | Sidebar status pill |
| `src/contexts/SchedulerContext.tsx` | Central post/queue state (localStorage) |
| `src/hooks/useSchedulerPublish.ts` | Auto-publish engine (server check + local fallback) |
| `src/lib/eventBuilder.ts` | Builds unsigned events (kind 1 / 30023) from a SchedulerPost |
| `src/pages/Compose.tsx` | Editor, listing import, AI generation, scheduling UI |
| `NIP.md` | Custom protocol / NIP usage documentation |
| `docs/adr/0001-self-hostable-scheduler-backend.md` | The decision record for this work |
