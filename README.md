# EchoFlow

> AI-powered sentiment and trend analysis engine that aggregates posts from multiple platforms and surfaces insights via a local LLM — zero cloud cost.

EchoFlow collects posts and comments from social platforms and RSS/Atom feeds, runs AI-powered sentiment analysis and trend extraction using a local Ollama model, and exposes the results through a REST API and a built-in web UI. Everything runs in Docker — one command and you're up.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start — Docker](#quick-start--docker)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Supported Platforms](#supported-platforms)
- [API Reference](#api-reference)
- [Adding a New Platform](#adding-a-new-platform)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Multi-platform collection** — Reddit, Hacker News, and any RSS/Atom feed out of the box
- **RSS/Atom feed support** — paste any feed URL to collect from blogs, news sites, YouTube channels, Mastodon, esports sites, and hundreds more
- **Free local AI** — sentiment analysis, themes, mood, and insights powered by Ollama (runs inside Docker, no API key or cost)
- **Pluggable collector registry** — adding a new platform is one file + one `register()` call, no route changes
- **Flexible search modes** — keyword search, latest posts, or top posts per time range
- **Comment fetching** — pull top/best/new comments for each post in the same request
- **Multiple export formats** — JSON, CSV, or HTML table from any search endpoint
- **Persistent storage** — PostgreSQL backend; searches, posts, and comments can be optionally saved
- **Three web UIs** — curated news feed, universal search, and full analytics dashboard at `/ui/`
- **Curated News Feed** — one-click news from 40+ pre-configured feeds across US, Tech, Gaming, Esports, and Finnish media — no setup needed
- **Adminer** — visual database browser included in the Docker stack

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                          EchoFlow                              │
│                                                                │
│  ┌──────────┐   ┌──────────────────────────────────────────┐  │
│  │  Web UI  │   │           REST API (Express)             │  │
│  │  /ui/*   │   │  /api/search  /api/platforms  /api/...   │  │
│  └──────────┘   └───────────────────┬──────────────────────┘  │
│                                     │                          │
│                   ┌─────────────────▼─────────────────────┐   │
│                   │          CollectorRegistry             │   │
│                   │   register()   get()   getAll()        │   │
│                   └───┬──────────────┬────────────────┬───┘   │
│                       │              │                │        │
│           ┌───────────▼──┐  ┌────────▼───────┐  ┌────▼────┐  │
│           │   Reddit     │  │  HackerNews    │  │   RSS   │  │
│           │ .json API    │  │ Algolia API    │  │  Atom   │  │
│           └──────────────┘  └────────────────┘  └─────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Ollama (local LLM — llama3.2:3b by default)             │ │
│  │  POST /api/analytics/analyze → sentiment, themes,        │ │
│  │  mood, summary, insights — runs in Docker, zero cost     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL 16                                           │ │
│  │  searches · posts · comments · search_posts              │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Key design decisions

| Decision | Reason |
|---|---|
| Collector registry pattern | Adding a platform is one file + one `register()` call, no route changes |
| `channels` abstraction | Subreddits, HN tags, feed URLs — one field each collector maps to its own concept |
| RSS/Atom collector | Any site with a feed is instantly supported — no custom collector needed |
| Local Ollama for AI | Zero API cost, runs in Docker, no data leaves your machine |
| Opt-in persistence (`persist: true`) | Exploratory searches stay fast; you only hit the DB when you want to |

---

## Prerequisites

**Docker path (recommended):**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 4.x or later

**Local path:**
- Node.js 20+, npm 9+, PostgreSQL 16

---

## Quick Start — Docker

**1. Clone and configure**

```bash
git clone <your-repo-url> echoflow
cd echoflow
cp .env.example .env
```

Open `.env` and set a `DB_PASSWORD`. Everything else works as-is for local use.

**2. Start all services**

```bash
docker compose up --build
```

Four containers start:

| Container | Purpose | URL |
|---|---|---|
| `echoflow-web` | Node.js API + web UI | `http://localhost:3000` |
| `echoflow-db` | PostgreSQL 16 | `localhost:5432` |
| `echoflow-ollama` | Local LLM (Ollama) | `localhost:11434` |
| `echoflow-adminer` | Visual database browser | `http://localhost:8888` |

The database schema is applied automatically from `src/db/init/01_schema.sql`.

> **First run:** Ollama downloads the AI model (~2 GB) when you first click "Analyze with AI". Watch progress: `docker logs echoflow-ollama -f`

**3. Open the UI**

```
http://localhost:3000          → redirects to search page
http://localhost:3000/ui/      → landing page
http://localhost:3000/ui/news     → curated news feed (40+ pre-configured RSS feeds)
http://localhost:3000/ui/reddit   → universal search (all platforms)
http://localhost:3000/ui/analytics.html → analytics dashboard
```

**4. Hard-refresh after any rebuild**

After `docker compose up --build`, always press **Ctrl+Shift+R** in the browser to bypass cached JS.

**5. Verify**

```bash
curl http://localhost:3000/health
# → {"status":"ok","service":"echoflow","timestamp":"..."}

curl http://localhost:3000/api/platforms
# → {"platforms":[{"id":"reddit",...},{"id":"hackernews",...},{"id":"rss",...}]}
```

---

## Local Development

```bash
npm install
cp .env.example .env
# set DB_HOST=localhost in .env

npm run dev    # ts-node, no build step needed
npm run build  # compile TypeScript → dist/
npm start      # run compiled output
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Set to `production` in compiled builds |
| `DB_HOST` | `db` | Postgres host (`db` in Docker, `localhost` locally) |
| `DB_PORT` | `5432` | Postgres port |
| `DB_USER` | `echoflow` | Postgres user |
| `DB_PASSWORD` | — | **Required** — set before first run |
| `DB_NAME` | `echoflow` | Postgres database name |
| `OLLAMA_HOST` | `http://ollama:11434` | Ollama service URL (`ollama` = Docker service name) |
| `OLLAMA_MODEL` | `llama3.2:3b` | Model to use for AI analysis |

**Model options** (set `OLLAMA_MODEL` in `.env`):

| Model | Size | Quality |
|---|---|---|
| `llama3.2:3b` | ~2 GB | Recommended — good structured output |
| `llama3.2:1b` | ~600 MB | Lighter but unreliable for analysis |
| `llama3.1:8b` | ~4.7 GB | Best quality, needs more RAM |

---

## Supported Platforms

### Reddit
Uses Reddit's public JSON API — no auth required.

`channels` = subreddit names (without `r/`).

```json
{
  "platforms": ["reddit"],
  "mode": "top",
  "channels": ["GlobalOffensive", "csgo"],
  "timeRange": "week",
  "limit": 25
}
```

### Hacker News
Uses the [Algolia HN Search API](https://hn.algolia.com/api) — free, no key.

`channels` = Algolia tag filters: `story`, `ask_hn`, `show_hn`, `job`.

```json
{
  "platforms": ["hackernews"],
  "mode": "search",
  "keyword": "Counter-Strike",
  "channels": ["story"],
  "timeRange": "month"
}
```

### RSS / Atom Feeds
Any standard RSS 2.0 or Atom feed. Paste one or more feed URLs into the **Feed URLs** field.

`channels` = list of feed URLs.

```json
{
  "platforms": ["rss"],
  "mode": "latest",
  "channels": [
    "https://www.hltv.org/rss/news",
    "https://hnrss.org/frontpage"
  ],
  "limit": 30
}
```

**Feeds that work well:**

| Source | Feed URL |
|---|---|
| HLTV news | `https://www.hltv.org/rss/news` |
| HN frontpage | `https://hnrss.org/frontpage` |
| HN Best | `https://hnrss.org/best` |
| TechCrunch | `https://techcrunch.com/feed/` |
| BBC News | `https://feeds.bbci.co.uk/news/rss.xml` |
| Ars Technica | `https://feeds.arstechnica.com/arstechnica/index` |
| YouTube channel | `https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID` |
| Mastodon user | `https://mastodon.social/@username.rss` |

> **Reddit RSS is blocked** — Reddit returns 403 for server-side RSS requests. Use the Reddit collector instead.
>
> **Cloudflare-protected forums** (e.g. HLTV forum threads) — scraping forum pages requires a real browser due to Cloudflare managed-challenge protection. Use the HLTV news RSS feed for HLTV content, and the Reddit collector for CS:GO forum-style discussion.

---

### News Feed UI (`/ui/news`)

A curated news page with 40+ pre-configured RSS feeds across five categories. No configuration needed — pick a category, select feeds, and click **Load News**.

| Category | Feeds included |
|---|---|
| 🇺🇸 US News | AP News, NPR, Reuters, CNN, NYT, Washington Post, HuffPost, Politico, CNBC, Yahoo News |
| 💻 Tech | Hacker News, Ars Technica, The Verge, TechCrunch, Wired, MIT Tech Review, Engadget, Gizmodo, VentureBeat, TNW, CNET, Slashdot |
| 🎮 Gaming | IGN, Gamespot, Polygon, Kotaku, Eurogamer, Rock Paper Shotgun, PC Gamer, PlayStation Blog, Xbox Wire, Nintendo Life, GamesRadar |
| 🏆 Esports | HLTV (CS news), Dot Esports, TheGamer, Esports Insider, Dexerto, ONE Esports |
| 🇫🇮 Finland | Yle Uutiset, Yle News (EN), Helsingin Sanomat, Ilta-Sanomat, Iltalehti, MTV Uutiset, Kauppalehti, Taloussanomat, Aamulehti, Turun Sanomat |

After loading, click **✦ Analyze with AI** for sentiment analysis. Once the analysis runs, click any sentiment bar (Positive / Neutral / Negative) to filter the article list to only articles tagged with that sentiment.

---

## API Reference

All endpoints under `http://localhost:3000/api`. Add `?pretty=1` for indented JSON.

---

### POST /api/search

```jsonc
{
  "platforms": ["reddit", "hackernews", "rss"],
  "mode": "top",            // "search" | "latest" | "top"
  "keyword": "TypeScript",  // required for mode=search
  "channels": ["programming", "https://hnrss.org/frontpage"],
  "timeRange": "week",      // "hour"|"day"|"week"|"month"|"year"|"all"
  "limit": 25,
  "fetchComments": true,
  "commentLimit": 5,
  "commentSort": "top",     // "top"|"best"|"new"
  "persist": false,
  "filters": {
    "minEngagement": 10,
    "sortBy": "recent"      // "recent"|"likes"|"comments"
  }
}
```

If some platforms fail, their errors are in `platformErrors` and working-platform results are still returned.

**Response formats:** `?format=json` (default), `?format=csv`, `?format=html`

---

### GET /api/platforms

Returns all registered collectors and their capabilities.

```json
{
  "platforms": [
    { "id": "reddit",      "displayName": "Reddit",             "capabilities": { "search": true, "latest": true, "top": true, "comments": true, "requiresAuth": false } },
    { "id": "hackernews",  "displayName": "Hacker News",        "capabilities": { "search": true, "latest": true, "top": true, "comments": true, "requiresAuth": false } },
    { "id": "rss",         "displayName": "RSS / Atom Feeds",   "capabilities": { "search": true, "latest": true, "top": true, "comments": false, "requiresAuth": false } }
  ]
}
```

---

### POST /api/analytics/analyze

Runs local AI analysis (Ollama) on a set of posts. Called automatically by the analytics dashboard after data collection.

```jsonc
// Request
{ "posts": [...], "keyword": "Counter-Strike" }

// Response
{
  "sentiment": { "positive": 55, "neutral": 30, "negative": 15 },
  "themes": ["team performance", "tournament format", "player transfers"],
  "summary": "Community discussion focuses on recent tournament results...",
  "mood": "excited",
  "insights": [
    "Team roster changes are the dominant topic.",
    "Sentiment spikes around major tournament announcements."
  ],
  "postCount": 25,
  "analyzedAt": "2026-05-12T10:00:00.000Z"
}
```

On first call, Ollama pulls the configured model (~2 GB). Returns 503 if Ollama is not yet ready.

---

### GET /api/analytics/status

```json
{ "available": true, "model": "llama3.2:3b", "host": "http://ollama:11434" }
```

---

### POST /api/reddit/comments

Fetch comments for a specific Reddit post by ID or URL.

```jsonc
{
  "subreddit": "GlobalOffensive",
  "id": "abc123",
  "limit": 10,
  "sort": "top"
}
```

---

### POST /api/analytics/export

Export analytics data as a file download.

```jsonc
{ "data": { /* analytics object */ }, "format": "csv" }
```

---

### GET /api/search/rate-limits

Returns current rate limit state for collectors that track it.

```json
{ "reddit": { "remaining": 58, "resetAt": "2026-05-12T10:01:00.000Z", "resetIn": 47000 } }
```

---

### GET /health

```json
{ "status": "ok", "service": "echoflow", "timestamp": "2026-05-12T10:00:00.000Z" }
```

---

## Adding a New Platform

The registry pattern makes this three steps with no changes to existing routes.

**Step 1 — Create the collector**

```typescript
// src/collectors/devto-collector.ts
import axios from 'axios';
import { BaseCollector, CollectorCapabilities, SearchOptions } from './base-collector';
import { Post } from '../models/post';

export class DevToCollector extends BaseCollector {
  readonly platformId = 'devto';
  readonly displayName = 'DEV.to';
  readonly capabilities: CollectorCapabilities = {
    search: true, latest: true, top: false, comments: false, requiresAuth: false,
  };

  async search(keyword: string | null, options: SearchOptions = {}): Promise<Post[]> {
    const { mode = 'search', limit } = options;
    const params: Record<string, any> = { per_page: Math.min(limit ?? 30, 30) };
    if (mode === 'search' && keyword) params.tag = keyword;

    const { data } = await axios.get('https://dev.to/api/articles', {
      params, timeout: this.config.timeout,
    });

    return this.validatePosts(data.map((a: any) => ({
      id: String(a.id),
      platform: 'devto' as any,
      title: a.title,
      content: a.description ?? a.title,
      author: a.user?.username ?? 'unknown',
      url: a.url,
      createdAt: new Date(a.published_at),
      engagement: { likes: a.positive_reactions_count ?? 0, comments: a.comments_count ?? 0, shares: 0, score: a.positive_reactions_count ?? 0 },
      metadata: { tags: a.tag_list },
    })));
  }
}
```

**Step 2 — Register it**

```typescript
// src/collectors/index.ts
import { DevToCollector } from './devto-collector';
registry.register(new DevToCollector());
```

**Step 3 — Add the platform type**

```typescript
// src/models/post.ts
platform: 'reddit' | 'hackernews' | 'rss' | 'devto' | 'twitter' | 'forum';
```

Done. The chip appears in the UI automatically — no frontend changes needed. Rebuild with `docker compose up --build`.

> **Cloudflare-protected sites:** Sites like HLTV forums use Cloudflare managed-challenge, which blocks all automated HTTP requests regardless of headers. Scraping these requires a real browser (Puppeteer/Playwright) and is still unreliable. Check if the site offers an RSS feed instead — many do.

---

## Project Structure

```
echoflow/
├── src/
│   ├── index.ts                       # Entry point
│   ├── api/
│   │   ├── server.ts                  # Middleware, routes, /api/platforms, root redirect
│   │   └── routes/
│   │       ├── search.ts              # POST /api/search — registry dispatch
│   │       ├── analytics.ts           # /api/analytics/* — AI analysis + export
│   │       ├── export.ts              # /api/export/*
│   │       └── reddit.ts              # POST /api/reddit/comments
│   ├── collectors/
│   │   ├── base-collector.ts          # Abstract base + SearchOptions, CollectorCapabilities
│   │   ├── collector-registry.ts      # CollectorRegistry class + singleton
│   │   ├── index.ts                   # Bootstrap: register all collectors here
│   │   ├── reddit-collector.ts        # Reddit public JSON API (no auth)
│   │   ├── hackernews-collector.ts    # HN via Algolia API (free, no auth)
│   │   ├── rss-collector.ts           # Generic RSS 2.0 / Atom feed collector
│   │   └── forum-collector.ts         # Abstract template for custom forum collectors
│   ├── services/
│   │   └── ai-service.ts              # Ollama integration — analyzeWithAI, checkOllamaStatus
│   ├── db/
│   │   ├── pool.ts                    # pg connection pool
│   │   ├── repositories.ts            # upsertPost, upsertComment, createSearch, …
│   │   └── init/01_schema.sql         # Auto-runs on first boot
│   ├── models/
│   │   ├── post.ts                    # Post + Comment interfaces
│   │   ├── search-query.ts            # SearchRequest / SearchResponse types
│   │   └── summary.ts                 # AnalyticsSummary type
│   ├── exporters/
│   │   ├── csv-formatter.ts
│   │   ├── html-formatter.ts
│   │   └── analytics-exporter.ts
│   └── utils/
│       ├── logger.ts                  # Winston
│       ├── errors.ts                  # APIError, RateLimitError, NetworkError
│       └── validators.ts
├── public/
│   ├── index.html                     # Landing page
│   ├── news.html                      # Curated news feed (40+ RSS feeds, 5 categories)
│   ├── reddit.html                    # Universal search UI (all platforms + AI)
│   ├── analytics.html                 # Analytics dashboard (auto AI analysis)
│   ├── news.js                        # News feed JS (feed picker, sentiment filter)
│   ├── app.js                         # Search page JS
│   ├── analytics.js                   # Analytics dashboard JS
│   └── styles.css
├── docs/
│   ├── overview.md                    # Architecture + quick reference
│   ├── reddit_guide.md                # Multi-platform search guide + RSS examples
│   └── database.md                    # Schema + query examples
├── .env.example
├── docker-compose.yml                 # web + db + ollama + adminer
├── Dockerfile                         # Multi-stage: TS build → production image
├── package.json
└── tsconfig.json
```

---

## Troubleshooting

**Only Reddit shows in the platform picker**

The Docker image is stale. Run `docker compose up --build`, then hard-refresh the browser with Ctrl+Shift+R.

**"Route not found" at `http://localhost:3000`**

The root URL redirects to `/ui/reddit`. If you see this error the server hasn't rebuilt yet — run `docker compose up --build`.

**RSS feed returns 0 results**

- Check the URL is a valid RSS/Atom feed (open it in a browser — it should show XML)
- **Reddit RSS is blocked** — Reddit returns 403 for server-side requests; use the Reddit collector
- Sites behind Cloudflare will also block the request; check if they have a separate RSS URL (many do)
- See the [working feed examples](#rss--atom-feeds) in the Supported Platforms section

**AI analysis shows only neutral / AI Insights is empty**

- The `llama3.2:1b` model is too small for structured output — set `OLLAMA_MODEL=llama3.2:3b` in `.env` and rebuild
- On first run, Ollama may still be downloading the model — wait a minute and try again: `docker logs echoflow-ollama -f`

**Ollama returns 503**

Ollama is still starting or pulling the model. Check: `docker logs echoflow-ollama -f`. The first pull is ~2 GB and can take several minutes.

**Database connection error on startup**

The web container may start before Postgres finishes. Run `docker compose restart web`.

**Reddit rate limit (429 in logs)**

Reddit allows ~60 requests/minute unauthenticated. EchoFlow logs the warning and backs off automatically. Reduce `limit` or disable comment fetching to lower request volume.

**TypeScript errors after pulling new changes**

```bash
npm install
npm run build
```
