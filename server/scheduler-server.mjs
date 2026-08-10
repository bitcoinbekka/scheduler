/**
 * Plebeian Scheduler — Self-Hosted Backend
 * ========================================
 *
 * A portable, drop-in replacement for the Netlify function
 * (netlify/functions/scheduler.mjs). It exposes the SAME HTTP API the
 * frontend expects, so you can point the app at this server by setting the
 * "Backend URL" in Settings to this server's origin (e.g. https://your-vps.com).
 *
 * API
 * ---
 *   GET    /                 → health check           { ok, service, storage, method }
 *   POST   /                 → schedule an event      { signedEvent, publishAt, relays? }
 *   GET    /?id=<eventId>     → check status          { id, status, publishAt, ... }
 *   DELETE /?id=<eventId>     → cancel a pending event
 *   GET    /?action=cron&key=<CRON_SECRET>  → manual publish trigger (optional)
 *
 * A built-in interval publishes due events every minute, so unlike the Netlify
 * version you do NOT need an external cron service — though the cron endpoint is
 * kept for compatibility and manual triggering.
 *
 * Storage: SQLite via Node's built-in `node:sqlite` (Node 22.5+). No external
 * npm dependencies required. The database file lives at $DATA_DIR/scheduler.db.
 *
 * Environment variables:
 *   PORT         Port to listen on          (default: 8080)
 *   DATA_DIR     Directory for the SQLite db (default: ./data)
 *   CRON_SECRET  Secret for the /?action=cron endpoint (optional but recommended)
 *   CHECK_MS     Publish-check interval in ms (default: 60000)
 *
 * Run:  node scheduler-server.mjs
 */

import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── Config ───────────────────────────────────────────────────────

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || './data';
const CRON_SECRET = process.env.CRON_SECRET || '';
const CHECK_MS = Number(process.env.CHECK_MS || 60_000);

const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
];

// ─── Storage (SQLite) ─────────────────────────────────────────────

mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'scheduler.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    signed      TEXT NOT NULL,      -- JSON of the signed Nostr event
    publish_at  INTEGER NOT NULL,   -- unix seconds
    relays      TEXT NOT NULL,      -- JSON array of relay URLs
    status      TEXT NOT NULL,      -- pending | published | failed
    created_at  INTEGER NOT NULL,
    published_at INTEGER,
    results     TEXT                -- JSON array of per-relay results
  );
  CREATE INDEX IF NOT EXISTS idx_status_time ON events (status, publish_at);
`);

const stmtInsert = db.prepare(
  `INSERT OR REPLACE INTO events
   (id, signed, publish_at, relays, status, created_at, published_at, results)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const stmtGet = db.prepare(`SELECT * FROM events WHERE id = ?`);
const stmtDelete = db.prepare(`DELETE FROM events WHERE id = ?`);
const stmtDue = db.prepare(
  `SELECT * FROM events WHERE status = 'pending' AND publish_at <= ?`
);
const stmtCount = db.prepare(`SELECT COUNT(*) AS n FROM events`);
const stmtUpdateResult = db.prepare(
  `UPDATE events SET status = ?, published_at = ?, results = ? WHERE id = ?`
);

function rowToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    signedEvent: JSON.parse(row.signed),
    publishAt: row.publish_at,
    relays: JSON.parse(row.relays),
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at ?? null,
    results: row.results ? JSON.parse(row.results) : null,
  };
}

// ─── Nostr Relay Publishing ───────────────────────────────────────

function publishToRelay(relayUrl, signedEvent, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(relayUrl);
      let settled = false;

      const done = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* ignore */ }
        resolve(result);
      };

      const timer = setTimeout(
        () => done({ relay: relayUrl, ok: false, error: 'timeout' }),
        timeoutMs
      );

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify(['EVENT', signedEvent]));
      });

      ws.addEventListener('message', (msg) => {
        try {
          const data = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
          if (data[0] === 'OK' && data[1] === signedEvent.id) {
            done({ relay: relayUrl, ok: data[2], message: data[3] || '' });
          }
        } catch { /* ignore malformed */ }
      });

      ws.addEventListener('error', (err) => {
        done({ relay: relayUrl, ok: false, error: String(err?.message || 'ws error') });
      });

      ws.addEventListener('close', () => {
        done({ relay: relayUrl, ok: false, error: 'connection closed' });
      });
    } catch (err) {
      resolve({ relay: relayUrl, ok: false, error: String(err) });
    }
  });
}

function publishToRelays(signedEvent, relayUrls) {
  return Promise.all(relayUrls.map((url) => publishToRelay(url, signedEvent)));
}

// ─── Publish loop ─────────────────────────────────────────────────

let running = false;

async function publishDue() {
  if (running) return { checked: 0, published: 0 }; // avoid overlap
  running = true;

  const now = Math.floor(Date.now() / 1000);
  let published = 0;
  let checked = 0;

  try {
    const rows = stmtDue.all(now);
    checked = rows.length;

    for (const row of rows) {
      const record = rowToRecord(row);
      console.log(`[Scheduler] Publishing ${record.id} (due ${new Date(record.publishAt * 1000).toISOString()})`);
      try {
        const results = await publishToRelays(record.signedEvent, record.relays);
        const anyOk = results.some((r) => r.ok);
        stmtUpdateResult.run(
          anyOk ? 'published' : 'failed',
          Math.floor(Date.now() / 1000),
          JSON.stringify(results),
          record.id
        );
        published++;
        console.log(`[Scheduler] ${record.id}: ${anyOk ? 'published' : 'failed'}`);
      } catch (err) {
        stmtUpdateResult.run(
          'failed',
          Math.floor(Date.now() / 1000),
          JSON.stringify([{ error: String(err?.message || err) }]),
          record.id
        );
        console.error(`[Scheduler] ${record.id} failed:`, err);
      }
    }
  } catch (err) {
    console.error('[Scheduler] publishDue error:', err);
  } finally {
    running = false;
  }

  return { checked, published };
}

// ─── HTTP helpers ─────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('payload too large')); // 1MB cap
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ─── Server ───────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const id = url.searchParams.get('id');
  const action = url.searchParams.get('action');
  const key = url.searchParams.get('key');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  try {
    // Manual cron trigger (compatibility with the Netlify version)
    if (req.method === 'GET' && action === 'cron') {
      if (!CRON_SECRET || key !== CRON_SECRET) {
        return send(res, 401, { error: 'Unauthorized' });
      }
      const { checked, published } = await publishDue();
      return send(res, 200, { ok: true, checked, published, timestamp: new Date().toISOString() });
    }

    // Health check
    if (req.method === 'GET' && !id) {
      return send(res, 200, {
        ok: true,
        service: 'plebeian-scheduler-selfhosted',
        storage: 'connected',
        method: 'ready',
      });
    }

    // Schedule a new event
    if (req.method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const { signedEvent, publishAt, relays } = body;

      if (!signedEvent || !signedEvent.id || !signedEvent.sig || !signedEvent.pubkey) {
        return send(res, 400, { error: 'Missing or invalid signedEvent' });
      }
      if (!publishAt || typeof publishAt !== 'number') {
        return send(res, 400, { error: 'Missing or invalid publishAt timestamp' });
      }

      const relayList = Array.isArray(relays) && relays.length > 0 ? relays : DEFAULT_RELAYS;

      stmtInsert.run(
        signedEvent.id,
        JSON.stringify(signedEvent),
        publishAt,
        JSON.stringify(relayList),
        'pending',
        Math.floor(Date.now() / 1000),
        null,
        null
      );

      console.log(`[Scheduler] Stored ${signedEvent.id} for ${new Date(publishAt * 1000).toISOString()}`);
      return send(res, 200, { ok: true, id: signedEvent.id, publishAt, status: 'pending' });
    }

    // Status check
    if (req.method === 'GET' && id) {
      const record = rowToRecord(stmtGet.get(id));
      if (!record) return send(res, 404, { error: 'Not found' });
      return send(res, 200, {
        id: record.id,
        status: record.status,
        publishAt: record.publishAt,
        publishedAt: record.publishedAt,
        results: record.results,
      });
    }

    // Cancel
    if (req.method === 'DELETE' && id) {
      const record = rowToRecord(stmtGet.get(id));
      if (!record) return send(res, 404, { error: 'Not found' });
      if (record.status === 'published') {
        return send(res, 409, { error: 'Already published, cannot cancel' });
      }
      stmtDelete.run(id);
      return send(res, 200, { ok: true, id, status: 'cancelled' });
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('[Scheduler] Error:', err);
    return send(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(PORT, () => {
  const { n } = stmtCount.get();
  console.log(`\n  Plebeian Scheduler (self-hosted) listening on :${PORT}`);
  console.log(`  Data dir: ${DATA_DIR}  |  Events stored: ${n}`);
  console.log(`  Publish check every ${Math.round(CHECK_MS / 1000)}s`);
  console.log(`  Cron endpoint: ${CRON_SECRET ? 'enabled' : 'disabled (set CRON_SECRET to enable)'}\n`);

  // Kick off the internal publish loop.
  publishDue();
  setInterval(publishDue, CHECK_MS);
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[Scheduler] ${sig} received, closing...`);
    server.close();
    try { db.close(); } catch { /* ignore */ }
    process.exit(0);
  });
}
