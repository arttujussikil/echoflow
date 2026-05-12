# EchoFlow

> Collect posts from Reddit, Hacker News, and any RSS/Atom feed — analyze sentiment, themes, and trends with AI — zero cloud cost.

EchoFlow aggregates content from multiple platforms, runs AI-powered analysis via NVIDIA NIM (free cloud) or local Ollama, and surfaces insights through a REST API and three web UIs. Everything runs in Docker — one command and you're up.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start — Docker](#quick-start--docker)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Supported Platforms](#supported-platforms)
- [News Feed UI](#news-feed-ui)
- [API Reference](#api-reference)
- [Adding a New Platform](#adding-a-new-platform)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Authors](#authors)
- [License](#license)

---

## Features

- **Multi-platform collection** — Reddit, Hacker News, and any RSS/Atom feed out of the box; add new platforms in one file
- **Curated News Feed** — one-click news from 40+ pre-configured feeds across US, Tech, Gaming, Esports, and Finnish media
- **Free AI, two tiers** — set `NVIDIA_API_KEY` for high-accuracy cloud inference via [NVIDIA NIM](https://build.nvidia.com) (free endpoint); falls back to local Ollama automatically when no key is set
- **Clickable sentiment filtering** — after AI analysis, click Positive / Neutral / Negative bars to filter posts by sentiment
- **Flexible search modes** — keyword search, latest posts, or top posts per time range
- **Comment fetching** — pull top/best/new comments for each post in the same request
- **Multiple export formats** — JSON, CSV, or HTML table from any search endpoint
- **Persistent storage** — PostgreSQL backend; searches, posts, and comments can be optionally saved
- **Pluggable collector registry** — adding a new platform is one file + one `register()` call, no route changes
- **Adminer** — visual database browser included in the Docker stack

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           EchoFlow                              │
│                                                                 │
│  ┌──────────┐   ┌───────────────────────────────────────────┐  │
│  │  Web UI  │   │           REST API (Express)              │  │
│  │  /ui/*   │   │  /api/search  /api/platforms  /api/...    │  │
│  └──────────┘   └──────────────────┬──────────────────────── ┘ │
│                                    │                            │
│                  ┌─────────────────▼──────────────────────┐    │
│                  │           CollectorRegistry             │    │
│                  │   register()   get()   getAll()         │    │
│                  └──┬──────────────┬───────────────────┬───┘   │
│                     │              │                   │        │
│         ┌───────────▼──┐  ┌────────▼───────┐  ┌───────▼────┐  │
│         │   Reddit     │  │  HackerNews    │  │  RSS/Atom  │  │
│         │ .json API    │  │ Algolia API    │  │  any feed  │  │
│         └──────────────┘  └────────────────┘  └────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  AI Provider (priority order)                            │  │
│  │  1. NVIDIA NIM — mistralai/mistral-nemotron (free cloud) │  │
│  │  2. Ollama     — llama3.2:3b (local Docker fallback)     │  │
│  │  POST /api/analytics/analyze → sentiment, themes,        │  │
│  │  mood, summary, insights — always free                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL 16                                           │  │
│  │  searches · posts · comments · search_posts              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key design decisions

| Decision | Reason |
|---|---|
| Collector registry pattern | Adding a platform is one file + one `register()` call, no route changes |
| `channels` abstraction | Subreddits, HN tags, feed URLs — one field each collector maps to its own concept |
| RSS/Atom collector | Any site with a feed is instantly supported — no custom collector needed |
| NVIDIA NIM primary + Ollama fallback | Free cloud model for accuracy; local fallback works offline with zero setup |
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

**2. (Optional) Add a free NVIDIA API key for better AI accuracy**

Get a free key at [build.nvidia.com](https://build.nvidia.com) → any model → "Get API Key". Add it to `.env`:

```
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxx
```

Without a key, EchoFlow uses local Ollama automatically (downloads ~2 GB model on first use).

**3. Start all services**

```bash
docker compose up --build
```

Four containers start:

| Container | Purpose | URL |
|---|---|---|
| `echoflow-web` | Node.js API + web UI | `http://localhost:3000` |
| `echoflow-db` | PostgreSQL 16 | `localhost:5432` |
| `echoflow-ollama` | Local LLM fallback (Ollama) | `localhost:11434` |
| `echoflow-adminer` | Visual database browser | `http://localhost:8888` |

The database schema is applied automatically from `src/db/init/01_schema.sql`.

**4. Open the UI**

```
http://localhost:3000               → redirects to search page
http://localhost:3000/ui/           → landing page
http://localhost:3000/ui/news       → curated news feed (40+ pre-configured RSS feeds)
http://localhost:3000/ui/reddit     → universal search (all platforms)
http://localhost:3000/ui/analytics.html → analytics dashboard
```

**5. Hard-refresh after any rebuild**

After `docker compose up --build`, press **Ctrl+Shift+R** in the browser to bypass cached JS.

**6. Verify**

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
| `NVIDIA_API_KEY` | — | Free NVIDIA NIM API key — get one at [build.nvidia.com](https://build.nvidia.com). When set, used as **primary** AI provider. |
| `NVIDIA_MODEL` | `mistralai/mistral-nemotron` | NVIDIA NIM model ID |
| `OLLAMA_HOST` | `http://ollama:11434` | Ollama service URL (local fallback) |
| `OLLAMA_MODEL` | `llama3.2:3b` | Local Ollama model (used when no NVIDIA key) |

**AI provider priority:** NVIDIA NIM → Ollama. If NVIDIA fails or no key is set, Ollama is used automatically. Both are free.

**Recommended NVIDIA NIM models** (free tier, set via `NVIDIA_MODEL`):

| Model | Notes |
|---|---|
| `mistralai/mistral-nemotron` | **Default** — fast, excellent instruction following, reliable JSON output |
| `mistralai/mistral-large-3-675b-instruct-2512` | Highest quality, slower |
| `meta/llama-4-maverick-17b-128e-instruct` | Multilingual MoE, 20M downloads |

**Ollama fallback models** (local, no internet needed, set via `OLLAMA_MODEL`):

| Model | Size | Notes |
|---|---|---|
| `llama3.2:3b` | ~2 GB | **Default** — good structured output |
| `llama3.2:1b` | ~600 MB | Lighter but unreliable for analysis |
| `llama3.1:8b` | ~4.7 GB | Best local quality, needs more RAM |

---

## Supported Platforms

### Reddit

Uses Reddit's public JSON API — no authentication required.

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

Uses the [Algolia HN Search API](https://hn.algolia.com/api) — free, no key required.

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

**Working feed examples:**

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
> **Cloudflare-protected sites** (e.g. HLTV forum threads) — Cloudflare managed-challenge blocks all automated HTTP. Use the HLTV news RSS feed (`/rss/news`) for HLTV content instead.

---

## News Feed UI

Available at `/ui/news` — a curated news page with 40+ pre-configured RSS feeds. No configuration needed: pick a category, select feeds, click **Load News**.

| Category | Included feeds |
|---|---|
| 🇺🇸 US News | AP News, NPR, Reuters, CNN, NYT, Washington Post, HuffPost, Politico, CNBC, Yahoo News |
| 💻 Tech | Hacker News, Ars Technica, The Verge, TechCrunch, Wired, MIT Tech Review, Engadget, Gizmodo, VentureBeat, TNW, CNET, Slashdot |
| 🎮 Gaming | IGN, Gamespot, Polygon, Kotaku, Eurogamer, Rock Paper Shotgun, PC Gamer, PlayStation Blog, Xbox Wire, Nintendo Life, GamesRadar |
| 🏆 Esports | HLTV (CS news), Dot Esports, TheGamer, Esports Insider, Dexerto, ONE Esports |
| 🇫🇮 Finland | Yle Uutiset, Yle News (EN), Helsingin Sanomat, Ilta-Sanomat, Iltalehti, MTV Uutiset, Kauppalehti, Taloussanomat, Aamulehti, Turun Sanomat |

After loading, click **✦ Analyze with AI** for sentiment analysis. Click any sentiment bar (Positive / Neutral / Negative) to filter the article list to only those tagged with that sentiment.

---

## API Reference

All endpoints under `http://localhost:3000/api`.

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

If some platforms fail, their errors appear in `platformErrors` and results from working platforms are still returned.

**Response formats:** append `?format=csv` or `?format=html` for alternative outputs.

---

### GET /api/platforms

Returns all registered collectors and their capabilities.

```json
{
  "platforms": [
    { "id": "reddit",     "displayName": "Reddit",           "capabilities": { "search": true, "latest": true, "top": true, "comments": true,  "requiresAuth": false } },
    { "id": "hackernews", "displayName": "Hacker News",      "capabilities": { "search": true, "latest": true, "top": true, "comments": true,  "requiresAuth": false } },
    { "id": "rss",        "displayName": "RSS / Atom Feeds", "capabilities": { "search": true, "latest": true, "top": true, "comments": false, "requiresAuth": false } }
  ]
}
```

---

### POST /api/analytics/analyze

Runs AI analysis on a set of posts. Uses NVIDIA NIM if `NVIDIA_API_KEY` is set, otherwise Ollama.

```jsonc
// Request
{ "posts": [...], "keyword": "Counter-Strike" }

// Response
{
  "sentiment":  { "positive": 55, "neutral": 30, "negative": 15 },
  "themes":     ["team performance", "tournament format", "player transfers"],
  "summary":    "Community discussion focuses on recent tournament results...",
  "mood":       "excited",
  "insights":   ["Team roster changes are the dominant topic.", "Sentiment spikes around major announcements."],
  "postCount":  25,
  "provider":   "nvidia:mistralai/mistral-nemotron",
  "analyzedAt": "2026-05-12T10:00:00.000Z"
}
```

Returns 503 if Ollama is not yet ready (first pull can take a few minutes).

---

### GET /api/analytics/status

```json
{
  "available":   true,
  "model":       "llama3.2:3b",
  "nvidiaModel": "mistralai/mistral-nemotron",
  "host":        "http://ollama:11434",
  "nvidia":      true
}
```

---

### POST /api/reddit/comments

Fetch comments for a specific Reddit post.

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
      id:         String(a.id),
      platform:   'devto' as any,
      title:      a.title,
      content:    a.description ?? a.title,
      author:     a.user?.username ?? 'unknown',
      url:        a.url,
      createdAt:  new Date(a.published_at),
      engagement: { likes: a.positive_reactions_count ?? 0, comments: a.comments_count ?? 0, shares: 0, score: a.positive_reactions_count ?? 0 },
      metadata:   { tags: a.tag_list },
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

**Step 3 — Add the platform type (optional)**

```typescript
// src/models/post.ts
platform: 'reddit' | 'hackernews' | 'rss' | 'devto';
```

Done. The platform chip appears in the UI automatically on next rebuild — no frontend changes needed.

```bash
docker compose up --build
```

---

## Project Structure

```
echoflow/
├── src/
│   ├── index.ts                       # Entry point
│   ├── api/
│   │   ├── server.ts                  # Middleware, routes, /api/platforms, root redirect
│   │   └── routes/
│   │       ├── search.ts              # POST /api/search — registry fan-out
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
│   │   └── ai-service.ts              # AI integration — NVIDIA NIM (primary) + Ollama (fallback)
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
│   ├── index.html                     # Landing page (clickable feature cards)
│   ├── news.html                      # Curated news feed (40+ RSS feeds, 5 categories)
│   ├── reddit.html                    # Universal search UI (all platforms + AI)
│   ├── analytics.html                 # Analytics dashboard + sentiment filtering
│   ├── news.js                        # News feed JS (feed picker, AI analysis, sentiment filter)
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

The Docker image is stale. Run `docker compose up --build`, then hard-refresh with Ctrl+Shift+R.

**"Route not found" at `http://localhost:3000`**

The root URL redirects to `/ui/reddit`. If you see this error, run `docker compose up --build`.

**RSS feed returns 0 results**

- Verify the URL is a valid RSS/Atom feed (open it in a browser — it should show XML)
- Reddit RSS (`*.rss`) returns 403 server-side — use the Reddit collector instead
- Sites behind Cloudflare block automated requests — check if the site has a separate news RSS URL

**AI analysis shows only neutral / all posts classified neutral**

- Without an `NVIDIA_API_KEY`, Ollama is used. The `llama3.2:1b` model is too small — set `OLLAMA_MODEL=llama3.2:3b` in `.env` and rebuild
- For best results, add a free `NVIDIA_API_KEY` — the cloud model handles structured output much more reliably

**Ollama returns 503**

Ollama is still starting or pulling the model (~2 GB on first run). Check progress: `docker logs echoflow-ollama -f`

**NVIDIA NIM returns an error**

- Verify the key is correct in `.env` (no extra spaces)
- Some models may be geo-restricted — try `mistralai/mistral-nemotron` (default) or `mistralai/mistral-large-3-675b-instruct-2512`
- EchoFlow automatically falls back to Ollama if NVIDIA fails

**Database connection error on startup**

The web container may start before Postgres finishes initialising. Run `docker compose restart web`.

**Reddit rate limit (429 in logs)**

Reddit allows ~60 requests/minute unauthenticated. EchoFlow backs off automatically. Reduce `limit` or disable comment fetching to lower request volume.

---

## Authors

- **Niko Kulkula**
- **Arttu-Jussi Kilponen**

---

## License

MIT License — see [LICENSE](LICENSE) for details.

**TypeScript errors after pulling new changes**

```bash
npm install && npm run build
```
