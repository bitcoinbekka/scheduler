# Plebeian Bunker

Always-on **NIP-46** remote signer for the Plebeian stack.

The Chrome **Signer** stays NIP-07 (browser). The **Scheduler** stores unsigned notes. This process holds the `nsec` and signs at fire time so posts show up at 08:00, not at Sunday-click time.

Same image for DIY (your VPS) and later Pro (Plebeian hosts it). Scheduler never stores the key.

## Run (Docker)

```bash
cd bunker
cp .env.example .env
# optional: set BUNKER_NSEC=nsec1…  (or let it generate one)
docker compose up -d --build
docker compose logs -f
curl -s http://127.0.0.1:1879/
```

Logs print a `bunker://` URI once. It is also in the volume as `/data/bunker.url` (mode 0600). Paste that URI into **https://plebeian.zip → Settings → Sign at fire time**.

Relays here should be ones that actually work (Primal, nos.lol, nostr.net, relay.plebeian.market). Do not depend on Amber’s list.

Keep the container running. Auto-approves kinds **1** and **30023** after a successful `connect` with the secret.

Do not `docker compose down -v` unless you intend to destroy the key volume.

## DIY vs Pro

| | DIY | Pro (later) |
|---|---|---|
| Who runs it | Merchant VPS / Start9 | Plebeian server |
| Who holds the nsec | Merchant | Merchant opted in. That is custody. Say so. |
| Pay | Your VPS bill | Zap / monthly for uptime |
| Scheduler | Same. Paste `bunker://` | Same |

Marketplace listing stays ungated.

## Status

`GET http://127.0.0.1:1879/` returns pubkey and relay list. It never returns nsec or the connect secret.

## Local without Docker

Node 22.5+:

```bash
cd bunker
npm install
cp .env.example .env
node bunker-server.mjs
npm test
```

## Security

- Never commit `.env` or `data/nsec`
- Never paste `bunker://` or nsec into chat
- This container can sign as you. Treat the host like a hot wallet
- Scheduler `BUNKER_STORE_KEY` encrypts the URI it stores. Different secret from `BUNKER_NSEC`
