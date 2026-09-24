# Plebeian Scheduler — Self-Hosted Backend

A tiny, portable backend that stores your **pre-signed** Nostr events and
publishes them to relays at the scheduled time. It is a **drop-in replacement**
for the built-in Netlify function — it exposes the exact same HTTP API, so the
Plebeian Scheduler frontend can talk to it without any code changes.

Point the app at it by opening **Settings → Scheduler Backend** and entering
this server's public URL (e.g. `https://scheduler.your-domain.com`).

- **SQLite + WebSocket** via Node 22. NIP-46 fire-time signing adds `nostr-tools`.
- **No external cron needed** — an internal timer publishes due events every
  minute (the `?action=cron` endpoint is still available for manual triggering).
- **Your nsec never touches the server** — either the browser pre-signs, or
  Amber signs at fire time over NIP-46. See `docs/NIP46-FIRE-TIME.md`.

---

## Requirements

- **Node.js 22.5+** (for the stable `node:sqlite` module), **or**
- **Docker** (recommended for a VPS).

---

## Quick start (Docker — recommended)

On your VPS:

```bash
git clone https://github.com/bitcoinbekka/plebeian-scheduler.git
cd plebeian-scheduler/server

# (optional) set a secret for the manual cron endpoint
export CRON_SECRET="$(openssl rand -hex 16)"

docker compose up -d --build
```

The server is now listening on port `8080` and storing data in a Docker volume
(`scheduler-data`). Check it:

```bash
curl http://localhost:8080/
# {"ok":true,"service":"plebeian-scheduler-selfhosted","storage":"connected","method":"ready"}
```

## Quick start (plain Node)

```bash
cd plebeian-scheduler/server
node scheduler-server.mjs
```

Configure with environment variables (see `.env.example`):

| Variable      | Default   | Description                                        |
|---------------|-----------|----------------------------------------------------|
| `PORT`        | `8080`    | Port to listen on                                  |
| `DATA_DIR`    | `./data`  | Where the SQLite database file is stored           |
| `CRON_SECRET` | *(empty)* | Secret for the optional `?action=cron` endpoint    |
| `CHECK_MS`          | `60000`   | How often (ms) to check for and publish due events |
| `BUNKER_STORE_KEY`  | *(empty)* | Required for NIP-46 jobs. Encrypts bunker URIs at rest |

---

## Putting it behind HTTPS

Browsers will refuse to call an insecure (`http://`) backend from an
`https://` site (mixed content). Put the server behind a reverse proxy with TLS.

### Caddy (easiest — automatic HTTPS)

`/etc/caddy/Caddyfile`:

```
scheduler.your-domain.com {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo caddy reload
```

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name scheduler.your-domain.com;

    # ssl_certificate ... (use certbot)

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

Then, in the app's **Settings → Scheduler Backend**, set the Backend URL to:

```
https://scheduler.your-domain.com
```

Click **Test connection** — you should see "Backend reachable / storage connected".

---

## HTTP API

| Method   | Path                              | Purpose                        |
|----------|-----------------------------------|--------------------------------|
| `GET`    | `/`                               | Health check                   |
| `POST`   | `/`                               | Schedule a pre-signed event    |
| `GET`    | `/?id=<eventId>`                  | Check a scheduled event status |
| `DELETE` | `/?id=<eventId>`                  | Cancel a pending event         |
| `GET`    | `/?action=cron&key=<CRON_SECRET>` | Manually trigger a publish run |

### `POST /` body

```json
{
  "signedEvent": { "id": "...", "pubkey": "...", "sig": "...", "kind": 1, "content": "...", "tags": [], "created_at": 1234567890 },
  "publishAt": 1712345678,
  "relays": ["wss://relay.damus.io"]
}
```

---

## Data & backups

All state lives in a single SQLite file at `$DATA_DIR/scheduler.db`
(the `scheduler-data` Docker volume by default). Back it up by copying that file.

---

## Notes & limitations

- The server publishes to relays **anonymously** (it just relays your signed
  event). Relays that require NIP-42 AUTH for writes may reject it — prefer
  relays that accept unauthenticated writes for scheduled posts.
- `created_at` reflects when the event was **signed**, not when it was
  published (the signature covers `created_at` and can't be changed later).
- Consider adding authentication (e.g. NIP-98) in front of `POST /` if your
  server is public, to prevent strangers from filling your database.

---

## License

GPL-3.0 — same as Plebeian Market.
