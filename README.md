# Plebeian Scheduler

A Nostr-based social media scheduler for [Plebeian Market](https://plebeian.market) merchants. Compose short notes, long-form articles, and product promotions, then schedule them to publish automatically to Nostr relays.

[![Edit with Shakespeare](https://shakespeare.diy/badge.svg)](https://shakespeare.diy/clone?url=https%3A%2F%2Fgithub.com%2Fbitcoinbekka%2Fplebeian-scheduler-v2.git)

**License:** GPL-3.0 (same as Plebeian Market)

---

## Table of Contents

- [What It Does](#what-it-does)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [How Scheduling Works](#how-scheduling-works)
- [Nostr Protocol Usage](#nostr-protocol-usage)
- [Pages & Features](#pages--features)
- [Getting Started (Local Dev)](#getting-started-local-dev)
- [Deployment (Netlify)](#deployment-netlify)
- [Environment Variables](#environment-variables)
- [Cron Setup (cron-job.org)](#cron-setup-cron-joborg)
- [Data Storage](#data-storage)
- [Key Files Reference](#key-files-reference)
- [Known Limitations & Future Work](#known-limitations--future-work)

---

## What It Does

Plebeian Scheduler lets merchants:

1. **Import NIP-99 listings** from their Plebeian Market stalls as source material
2. **Compose promotional notes** (kind 1), long-form articles (kind 30023), or short updates
3. **Use AI** (Shakespeare AI / NIP-90 DVM) to generate or improve post content
4. **Schedule posts** for future publishing with a calendar & time picker
5. **Run multi-listing campaigns** — select several products and auto-schedule a series of promo notes
6. **Track engagement** — see reactions and zaps on published posts, with best-time-to-post insights
7. **Repost, save as template, or promote again** directly from the dashboard

Posts are **signed in the browser** (private keys never leave the client) and stored on a Netlify serverless backend. An external cron service triggers the backend every minute to publish any posts that are due.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite |
| **UI** | TailwindCSS 3, shadcn/ui (Radix primitives), Lucide icons |
| **Nostr** | Nostrify (`@nostrify/nostrify`, `@nostrify/react`), nostr-tools |
| **State** | TanStack Query (server state), React Context (local state), localStorage |
| **Routing** | React Router v6 |
| **Forms** | React Hook Form + Zod validation |
| **Dates** | date-fns |
| **Backend** | Netlify Functions (serverless, single `.mjs` file) |
| **Storage** | Netlify Blobs (key-value store for scheduled events) |
| **Cron** | cron-job.org (external HTTP trigger) |
| **Fonts** | IBM Plex Mono (@fontsource) |
| **Payments** | Nostr Wallet Connect (NWC), WebLN |

---

## Architecture Overview

```
                         ┌─────────────────────────────┐
                         │        Browser Client        │
                         │    (React SPA on Netlify)    │
                         │                              │
                         │  1. User composes a post     │
                         │  2. Signs event with NIP-07  │
                         │  3. POST to backend API      │
                         └────────────┬────────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────────┐
                         │  Netlify Serverless Function │
                         │  /.netlify/functions/        │
                         │         scheduler            │
                         │                              │
                         │  - Stores signed events in   │
                         │    Netlify Blobs             │
                         │  - Publishes to relays when  │
                         │    triggered by cron         │
                         └────────────┬────────────────┘
                                      │
                              ┌───────┴───────┐
                              ▼               ▼
                     ┌──────────────┐  ┌──────────────┐
                     │ Netlify Blobs│  │ Nostr Relays │
                     │ (key-value)  │  │              │
                     │              │  │ wss://relay.  │
                     │ Stores pre-  │  │ damus.io     │
                     │ signed events│  │ primal.net   │
                     │ until due    │  │ ditto.pub    │
                     └──────────────┘  └──────────────┘
                              ▲
                              │  every 60s
                     ┌────────┴────────┐
                     │  cron-job.org   │
                     │  GET ?action=   │
                     │  cron&key=xxx   │
                     └─────────────────┘
```

### Key Design Decisions

- **Pre-signed events**: The browser signs the Nostr event at schedule time. The server never sees the user's private key — it only stores and forwards the already-signed event.
- **Client-side fallback**: If the server is unreachable when scheduling, the post is saved locally and the browser polls to publish it (tab must stay open).
- **Local-first data**: Drafts, queues, and post metadata live in `localStorage`. Only the pre-signed event blob is stored server-side.

---

## Project Structure

```
plebeian-scheduler/
├── netlify/
│   └── functions/
│       └── scheduler.mjs        # Serverless function (scheduling + cron + CRUD)
├── public/                      # Static assets
├── src/
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components (48+ components)
│   │   ├── auth/                # Login components (LoginArea, LoginDialog)
│   │   ├── AppLayout.tsx        # Main layout with sidebar navigation
│   │   ├── ListingBrowser.tsx   # NIP-99 listing importer + campaign builder
│   │   ├── AiGenerateDialog.tsx # AI content generation modal
│   │   ├── MarkdownEditor.tsx   # Rich editor with formatting toolbar
│   │   ├── ImageUploader.tsx    # Blossom file upload with NIP-92 tags
│   │   ├── TimePicker.tsx       # Time picker component
│   │   ├── ImportListingDialog.tsx
│   │   ├── NoteContent.tsx      # Renders Nostr note content (URLs, mentions)
│   │   ├── ZapButton.tsx        # Lightning zap UI
│   │   ├── ZapDialog.tsx
│   │   ├── WalletModal.tsx
│   │   ├── RelayListManager.tsx # NIP-65 relay management
│   │   └── ...
│   ├── contexts/
│   │   ├── SchedulerContext.tsx  # Central state: posts, queues, CRUD operations
│   │   ├── NWCContext.tsx        # Nostr Wallet Connect provider
│   │   └── AppContext.tsx        # App config (theme, relays)
│   ├── hooks/
│   │   ├── useSchedulerPublish.ts  # Auto-publish engine (server + local fallback)
│   │   ├── usePostEngagement.ts    # Fetch reactions + zaps for published posts
│   │   ├── useMyListings.ts        # Query user's NIP-99 listings
│   │   ├── useDvmGenerate.ts       # NIP-90 DVM text generation
│   │   ├── useShakespeare.ts       # Shakespeare AI integration
│   │   ├── useCurrentUser.ts       # Logged-in user
│   │   ├── useNostrPublish.ts      # Publish events to relays
│   │   ├── useUploadFile.ts        # Blossom file uploads
│   │   └── ...
│   ├── lib/
│   │   ├── types.ts             # Core types: SchedulerPost, Queue, PostTemplate, etc.
│   │   ├── eventBuilder.ts      # Builds unsigned Nostr events from SchedulerPost
│   │   ├── schedulerApi.ts      # Client for the Netlify backend API
│   │   ├── schedulerStore.ts    # localStorage persistence layer
│   │   └── utils.ts
│   ├── pages/
│   │   ├── Index.tsx            # Redirects to Dashboard
│   │   ├── Dashboard.tsx        # Stats, upcoming posts, published posts + engagement
│   │   ├── Compose.tsx          # Full post editor (3 post types, scheduling, campaigns)
│   │   ├── Drafts.tsx           # Draft management
│   │   ├── QueuePage.tsx        # Queue management
│   │   ├── CalendarView.tsx     # Calendar view of scheduled posts
│   │   ├── Feed.tsx             # Live Nostr feed
│   │   ├── SettingsPage.tsx     # App settings
│   │   └── NotFound.tsx
│   ├── App.tsx                  # Provider tree (QueryClient, Nostr, NWC, Scheduler, etc.)
│   ├── AppRouter.tsx            # React Router configuration
│   └── main.tsx                 # Entry point
├── NIP.md                       # Custom Nostr protocol documentation
├── AGENTS.md                    # AI assistant system prompt
├── package.json
├── tailwind.config.ts
├── vite.config.ts
└── tsconfig.json
```

---

## How Scheduling Works

### The Happy Path (Server-Side)

1. User composes a post in `/compose`
2. User picks a date & time and clicks "Schedule"
3. The browser **signs the Nostr event immediately** using NIP-07 (browser extension) or NIP-46 (bunker)
4. The signed event + publish timestamp are `POST`ed to `/.netlify/functions/scheduler`
5. The backend stores it in Netlify Blobs with status `"pending"`
6. Every 60 seconds, **cron-job.org** hits `/.netlify/functions/scheduler?action=cron&key=CRON_SECRET`
7. The cron handler checks all pending events — if `publishAt <= now`, it opens WebSocket connections to the configured relays and sends the signed event
8. Status is updated to `"published"` or `"failed"`
9. The browser periodically checks the server for status updates and shows a toast notification

### The Fallback (Client-Side)

If the Netlify backend is unreachable at step 4:
- The post is saved locally with `serverEventId: null`
- The `useSchedulerPublish` hook polls every 10 seconds
- When the scheduled time arrives, it signs and publishes directly from the browser
- **The browser tab must remain open** for this to work

### Recurring Posts

Posts can be set to auto-reschedule after publishing (daily, every 3 days, or weekly). After a successful publish, a new copy is created with the next scheduled time.

---

## Nostr Protocol Usage

### Events Published

| Kind | Type | Description |
|------|------|-------------|
| **1** | Short Text Note | Standard Nostr post — used for short notes and promo notes |
| **30023** | Long-form Article (NIP-23) | Markdown articles with title, summary, header image, hashtags |
| **6** | Repost | Boosting a published note from the dashboard |

### Events Read

| Kind | Type | Description |
|------|------|-------------|
| **30402** | Classified Listing (NIP-99) | Imported as source material for promo notes |
| **7** | Reaction | Tracked for engagement metrics |
| **9735** | Zap Receipt | Tracked for zap/sats metrics |

### NIPs Used

- **NIP-01**: Basic event structure
- **NIP-07**: Browser extension signing (nos2x, Alby, etc.)
- **NIP-19**: Bech32 encoding (npub, naddr, note, nevent)
- **NIP-23**: Long-form content (kind 30023)
- **NIP-31**: Alt tag on custom events
- **NIP-40**: Event expiration
- **NIP-46**: Remote signing (bunker://)
- **NIP-65**: Relay list metadata (sync on login)
- **NIP-90**: Data Vending Machine (AI text generation via kind 5050)
- **NIP-92**: Media attachments (imeta tags)
- **NIP-99**: Classified listings (read-only, for import)

See `NIP.md` for the full custom protocol documentation.

---

## Pages & Features

### Dashboard (`/`)
- Stats overview: scheduled, published, reactions, zaps
- Upcoming scheduled posts with server/local indicators
- Published posts with live engagement metrics (reactions + zaps)
- Post type performance comparison (which format gets more engagement)
- Best time to post analysis
- Quick actions: repost, save as template, promote again, view on njump

### Compose (`/compose`)
- **3 post types**: Short Note (kind 1), Long-form Article (kind 30023), Promo Note (kind 1 + listing)
- NIP-99 listing browser with single import or multi-listing campaign mode
- AI content generation (Shakespeare AI + NIP-90 DVM)
- Rich Markdown editor with formatting toolbar (for articles)
- Image uploads via Blossom servers
- Quick hashtag suggestions
- Note preview toggle
- Schedule dialog with quick options (5 min, 1 hour, 24 hours, 1 week) or custom date/time
- Recurring post settings (daily, every 3 days, weekly)
- Publish now option

### Drafts (`/drafts`)
- View and manage saved draft posts

### Queue (`/queue`)
- View scheduled, queued, and failed posts
- Retry failed posts

### Calendar (`/calendar`)
- Calendar visualization of scheduled posts

### Feed (`/feed`)
- Live Nostr feed

### Settings (`/settings`)
- Relay management (NIP-65)
- Theme toggle
- Profile editing

---

## Getting Started (Local Dev)

### Prerequisites

- Node.js 18+
- A Nostr browser extension (nos2x, Alby, etc.) for signing
- (Optional) Netlify CLI for testing the serverless function locally

### Install & Run

```bash
git clone https://github.com/bitcoinbekka/plebeian-scheduler-v2.git
cd plebeian-scheduler-v2
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Notes for Local Development

- **Scheduling works locally** via the client-side fallback (browser must stay open)
- **The Netlify function** won't be available locally unless you use `netlify dev`
- **Login** requires a NIP-07 browser extension or NIP-46 bunker connection

---

## Deployment (Netlify)

The app is currently deployed on Netlify at: `https://plebeian-scheduler.netlify.app`

### Deploy Steps

1. Connect the GitHub repo to Netlify (or deploy via Netlify CLI)
2. **Build command**: `npm run build`
3. **Publish directory**: `dist`
4. **Functions directory**: `netlify/functions` (auto-detected)
5. Set the required environment variables (see below)

---

## Self-Hosting the Backend (Own Server)

You are **not** locked into Netlify. The scheduling backend is fully portable.
A standalone, drop-in replacement lives in [`server/`](./server) — a tiny Node
service with **zero npm dependencies** (Node 22 built-in SQLite + WebSocket) and
a built-in publish timer (no external cron required).

### 1. Run the backend on your VPS

```bash
git clone https://github.com/bitcoinbekka/plebeian-scheduler.git
cd plebeian-scheduler/server
docker compose up -d --build      # or: node scheduler-server.mjs
```

Put it behind HTTPS with Caddy/Nginx (see [`server/README.md`](./server/README.md)
for full instructions, reverse-proxy configs, and the API reference).

### 2. Point the app at it

In the app, open **Settings → Scheduler Backend**, enter your server's URL
(e.g. `https://scheduler.your-domain.com`), and click **Test connection**.
That's it — scheduled posts now flow through your own server instead of Netlify.

The frontend reads the backend URL from `AppConfig.schedulerBackendUrl`. Leaving
it blank falls back to the built-in same-origin Netlify function, so the default
behavior is unchanged. A live **status indicator** in the sidebar and Settings
shows whether the backend is `online`, `degraded`, or `offline` at a glance.

---

## Environment Variables

Set these in Netlify > Site configuration > Environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `NETLIFY_API_TOKEN` | Yes | Netlify personal access token (for Blobs API access) |
| `SITE_ID` | Auto | Usually auto-set by Netlify; needed for Blobs API |
| `CRON_SECRET` | Yes | Shared secret for authenticating cron requests |

### How to Get Each

- **`NETLIFY_API_TOKEN`**: Netlify dashboard > User settings > Applications > Personal access tokens > New access token
- **`SITE_ID`**: Usually auto-injected. If not, find it in Netlify > Site configuration > General > Site ID
- **`CRON_SECRET`**: Any random string you choose (e.g. `plebeian-cron-8xK4mN7qR2wF9j`). Must match the `key` parameter in the cron URL.

---

## Cron Setup (cron-job.org)

The scheduled post system needs an external service to trigger the publish check every minute.

### Setup

1. Create a free account at [cron-job.org](https://cron-job.org)
2. Create a new cron job:
   - **URL**: `https://plebeian-scheduler.netlify.app/.netlify/functions/scheduler?action=cron&key=YOUR_CRON_SECRET`
   - **Schedule**: Every 1 minute (`* * * * *`)
   - **Method**: GET
3. The `key` parameter must match the `CRON_SECRET` environment variable in Netlify

### Health Check

Test the function is working:

```bash
# Health check (no auth needed)
curl https://plebeian-scheduler.netlify.app/.netlify/functions/scheduler

# Cron trigger (auth required)
curl "https://plebeian-scheduler.netlify.app/.netlify/functions/scheduler?action=cron&key=YOUR_SECRET"
```

Expected cron response:
```json
{"ok": true, "checked": 6, "published": 0, "timestamp": "2026-04-01T13:41:04.787Z"}
```

---

## Data Storage

### Client-Side (localStorage)

| Key | Content |
|-----|---------|
| `plebeian-scheduler:posts` | Array of `SchedulerPost` objects (drafts, scheduled, published, failed) |
| `plebeian-scheduler:queues` | Array of `Queue` objects |
| `plebeian-scheduler:templates` | Array of `PostTemplate` objects (reusable content templates) |
| `nostr:app-config` | App config (theme, relay list) |
| `nostr:login` | Login state (pubkey, signer type) |

### Server-Side (Netlify Blobs)

- **Store name**: `scheduled-events`
- **Key**: The signed event's ID (hex string)
- **Value**: JSON object with `signedEvent`, `publishAt`, `relays`, `status`, `results`, etc.

---

## Key Files Reference

| File | What It Does |
|------|-------------|
| `netlify/functions/scheduler.mjs` | The entire backend — handles POST (schedule), GET (status check), DELETE (cancel), and cron trigger |
| `src/contexts/SchedulerContext.tsx` | Central state management — all CRUD operations for posts and queues |
| `src/hooks/useSchedulerPublish.ts` | Auto-publish engine — polls for due posts (server-side check + local fallback) |
| `src/lib/eventBuilder.ts` | Builds unsigned Nostr events from SchedulerPost data (kind 1 + kind 30023) |
| `src/lib/schedulerApi.ts` | HTTP client for the Netlify backend |
| `src/lib/types.ts` | Core TypeScript types (SchedulerPost, Queue, ImportedListing, etc.) |
| `src/pages/Compose.tsx` | The main editor — post types, listing import, AI generation, scheduling UI |
| `src/pages/Dashboard.tsx` | Stats, upcoming posts, published posts with engagement |
| `src/components/ListingBrowser.tsx` | NIP-99 listing importer + multi-listing campaign builder |

---

## Known Limitations & Future Work

### Current Limitations

1. **`created_at` mismatch**: Events are signed at schedule time, so `created_at` reflects when the event was signed, not when it was published. This is because `created_at` is covered by the signature and cannot be changed. Some relay feeds may show the post at the wrong position.

2. **Client-side fallback requires open tab**: If the server is unreachable, the browser must stay open for local scheduling to work.

3. **No authentication on POST endpoint**: Currently anyone can POST a schedule request to the backend. The event is pre-signed so they can't publish as someone else, but they could fill up Blob storage. Consider adding auth.

4. **Single-user design**: The localStorage approach means data doesn't sync across devices/browsers.

5. **No WebSocket on serverless**: The Netlify function uses `new WebSocket()` which works in Netlify's Node.js 18+ runtime but may need a polyfill in other environments.

### Future Integration Ideas

- **Integrate with Plebeian Market backend** as a built-in feature for merchants
- **Multi-user support** with Nostr-based auth (NIP-98)
- **Analytics dashboard** with more detailed engagement tracking over time
- **A/B testing** — schedule multiple variations of a promo and compare performance
- **DVM-based publishing** (NIP-90 kind 5905) for trustless scheduled publishing
- **E2E tests** with Playwright or Cypress
- **Push notifications** when scheduled posts are published or engagement spikes

---

## Built With

Vibed with [Shakespeare](https://shakespeare.diy)
