# Plebeian Scheduler

A Nostr scheduler for [Plebeian Market](https://plebeian.market) merchants. Compose short notes, long-form articles, and product promos. Schedule them to publish to relays.

**Live app:** [https://plebeian.zip](https://plebeian.zip)  
**Live API:** [https://scheduler.plebeian.zip](https://scheduler.plebeian.zip)  
**Repo:** [github.com/bitcoinbekka/scheduler](https://github.com/bitcoinbekka/scheduler)

**License:** GPL-3.0

---

## What it does

1. Import **NIP-99 listings** from your stall as source material.
2. Compose kind **1** notes, kind **30023** articles, or listing promos.
3. Schedule for later, or publish now.
4. Optional **Amber / NIP-46**: sign at fire time so `created_at` is publish time, not click time.
5. Track reactions and zaps on published notes.
6. Run multi-listing campaigns.

Drafts and queues live in the browser (`localStorage`). The publish job lives on your own server (SQLite in Docker). Keys never sit on the server as `nsec`. Either the browser pre-signs, or Amber signs at fire time.

---

## How production is actually run

| Piece | Where |
|---|---|
| UI | nginx serves the Vite `dist/` at **https://plebeian.zip** |
| API | Docker container `plebeian-scheduler` on `127.0.0.1:8080` |
| Proxy | nginx **https://scheduler.plebeian.zip** → that container |
| Data | Docker volume `scheduler-data` (`/data/scheduler.db`) |
| Timer | Built into `scheduler-server.mjs` (no cron-job.org) |

Do **not** `docker compose down -v` in `server/`. That deletes scheduled jobs.

In the app: **Settings → Scheduler Backend** → `https://scheduler.plebeian.zip`.

---

## Two publish modes

**Pre-sign (default).** Browser signs with NIP-07 (Plebeian Signer, nos2x, Alby) when you click Schedule. Server stores the signed event and publishes later. `created_at` is sign time.

**Sign at fire time (optional).** Settings → paste a `bunker://` URI → turn the switch on. Server stores an unsigned template and an encrypted bunker box. At the due time it sets `created_at` to now, asks the bunker to sign, then publishes.

Use **Plebeian Bunker** (`bunker/` in this repo) on your VPS, or Amber / nsec.app. The Chrome Signer stays NIP-07. It is not a bunker. See [bunker/README.md](./bunker/README.md) and [docs/NIP46-FIRE-TIME.md](./docs/NIP46-FIRE-TIME.md).

Set `BUNKER_STORE_KEY` on the scheduler server so it can store the URI encrypted.

---

## Local development

```bash
git clone https://github.com/bitcoinbekka/scheduler.git
cd scheduler
npm install
npm run dev
```

App: `http://localhost:5173`. Login needs a NIP-07 extension (or a bunker in Settings). Scheduling without a backend uses the browser fallback (tab must stay open).

To hit a real backend locally, run `server/` and set **Settings → Scheduler Backend** to that URL.

---

## Self-host the backend

Needs Node 22.5+ or Docker.

```bash
git clone https://github.com/bitcoinbekka/scheduler.git
cd scheduler/server
cp .env.example .env
# set CRON_SECRET if you use the cron HTTP endpoint
# set BUNKER_STORE_KEY if you want Amber fire-time signing
docker compose up -d --build
# or: npm install && node scheduler-server.mjs
```

Put HTTPS in front with **nginx** (this project’s production path). Details, API, and env vars: [server/README.md](./server/README.md).

Health check (GET, not HEAD):

```bash
curl -s https://scheduler.plebeian.zip/
```

Expect `"method":"ready"`. Fire-time signing is on when the JSON includes `"nip46": true`.

After pulling new server files:

```bash
cd server
docker compose up -d --build
```

Do not start a second `node scheduler-server.mjs` on port 8080 if Docker already owns it.

---

## Deploy the UI

Build:

```bash
npm run build
```

Publish the `dist/` folder to the nginx root for **plebeian.zip**. Rebuild the static files whenever Settings or Compose change. Rebuilding Docker does not update the UI.

---

## Architecture

```
  Browser  https://plebeian.zip
     │  compose / schedule
     │  NIP-07  or  unsigned + bunker://
     ▼
  nginx  https://scheduler.plebeian.zip
     ▼
  Docker  scheduler-server.mjs :8080
     │  SQLite volume
     │  internal timer
     ▼
  Nostr relays
```

Netlify Functions + Blobs + cron-job.org still exist in `netlify/` as a leftover path. Production does **not** use them.

---

## Project structure

```
scheduler/
├── bunker/                      # Always-on NIP-46 signer (Docker). DIY or later Pro.
├── server/                      # Self-hosted backend (Docker / Node)
│   ├── scheduler-server.mjs
│   ├── nip46-sign.mjs           # Amber fire-time signing
│   ├── secret-box.mjs           # Encrypts bunker URIs at rest
│   └── docker-compose.yml
├── netlify/functions/           # Optional leftover serverless backend
├── src/
│   ├── pages/                   # Dashboard, Compose, Drafts, Queue, Calendar, Feed, Settings
│   ├── components/              # Including SchedulerBackendSettings, SchedulerBunkerSettings
│   ├── contexts/
│   ├── hooks/
│   └── lib/
├── docs/                        # ADRs + NIP46-FIRE-TIME.md
├── NIP.md
└── HANDOVER.md
```

---

## Nostr

| Kind | Role |
|------|------|
| 1 | Short notes and listing promos |
| 30023 | Long-form (NIP-23) |
| 6 | Repost from the dashboard |
| 30402 | NIP-99 listings (imported, not written here) |
| 7 / 9735 | Reactions and zaps (read for stats) |

NIPs in play: 01, 07, 19, 23, 31, 40, 46 (optional fire-time), 65, 90 (optional AI generate), 92, 99.

---

## Settings

- Relays (NIP-65)
- Theme and profile
- **Scheduler Backend** URL (production: `https://scheduler.plebeian.zip`)
- **Sign at fire time** (Amber `bunker://`)

Bunker URI is stored on the device (`plebeian-scheduler:bunker`) and encrypted on the server. It is not published to Nostr.

---

## Data

**Browser:** `plebeian-scheduler:posts`, `:queues`, `:templates`, plus login/config keys.

**Server:** SQLite in the `scheduler-data` volume. Pre-signed jobs store the signed event. Fire-time jobs store an unsigned template and an encrypted bunker box.

---

## Optional: Netlify

If you are not using the Docker API, the old Netlify function can still run from `netlify/functions/scheduler.mjs` with Blobs and an external cron. That is not how [plebeian.zip](https://plebeian.zip) is hosted. Do not follow Netlify/cron-job.org as the production guide.

---

## Known limits

- Pre-sign mode still stamps `created_at` at Schedule click. Use Amber fire-time if that matters.
- Fire-time needs Amber (or another bunker) reachable at publish.
- Client fallback still needs an open tab if the API is down.
- Drafts do not sync across browsers.
- POST to the backend is not NIP-98 gated yet.

---

## Related

- [server/README.md](./server/README.md) — backend ops
- [docs/NIP46-FIRE-TIME.md](./docs/NIP46-FIRE-TIME.md) — Amber setup
- [docs/adr/](./docs/adr/) — design records
- [HANDOVER.md](./HANDOVER.md) — for other agents
