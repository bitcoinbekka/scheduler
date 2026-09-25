# Sign at fire time (NIP-46 / Amber)

Slice 1: scheduled notes can be **unsigned until publish**. At fire time the
self-hosted backend asks **Amber** (or nsec.app) to sign, with `created_at`
set to now. Relays then see a fresh note instead of a dump from last Wednesday.

Plebeian Signer stays **NIP-07** for this website. It is not a bunker.

## What you need

1. Self-hosted scheduler (`server/`) with `BUNKER_STORE_KEY` set.
2. A bunker that stays awake:
   - **Plebeian Bunker** in `bunker/` (recommended). Docker on your VPS.
   - or Amber / nsec.app if they actually answer.
3. For Plebeian Bunker, the phone does not need to be on.

## Setup

On the server:

```bash
cd server
cp .env.example .env
# set BUNKER_STORE_KEY to a long random passphrase
npm install
node scheduler-server.mjs
```

Health JSON includes `"nip46": true` when the store key is present.

In the app: **Settings → Scheduler Backend** (your HTTPS origin) then
**Sign at fire time**. Paste `bunker://…`. Save. Toggle on.

Schedule as usual. The server stores an encrypted bunker box, not an `nsec`.
The URI is also kept in this browser only (`plebeian-scheduler:bunker`).
It is never published to Nostr.

## Fallback

Leave the toggle off to keep pre-signed publish (current behaviour).
Netlify’s built-in function still only accepts pre-signed events.

## Amber

If Amber is locked or offline, the job fails and the UI shows failed.
Unlock, keep auto-approve, try a note 2 minutes out first.
