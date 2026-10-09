# EchoFlow

> One search box for news and social media. Type a topic, see the most-talked-about posts, and let the AI sum up the mood and give its own take. Zero cloud cost.

EchoFlow searches Reddit, Hacker News, Bluesky, Lemmy, Google News and free news APIs from [public-apis](https://github.com/public-apis/public-apis#news) in parallel. It analyses the results with NVIDIA NIM (free cloud) or local Ollama and shows everything on a single page, colour-coded by mood. Everything runs in Docker: one command and you're up.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start — Docker](#quick-start--docker)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Supported Sources](#supported-sources)
- [The UI](#the-ui)
- [API Reference](#api-reference)
- [Adding a New Platform](#adding-a-new-platform)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Authors](#authors)
- [License](#license)

---

## Features

- **One page, one search box** — type `News, Finland` and every comma-separated topic is searched across all enabled sources at once
- **Top 10 + AI side by side** — most popular / latest posts on the left; AI summary, the AI's own opinion, themes and a colour-coded mood bar on the right
- **Colour-coded results** — every post is marked green (positive), grey (neutral) or red (negative); click a mood to filter
- **Quick-search buttons** — News, Finland, Football, Tech… Add your own, and optionally attach a curated RSS feed bundle (World, Finland, Tech, Gaming, Esports)
- **Free sources only** — 6 sources work with no key at all; 8 more news APIs from public-apis switch on with a free key (on the server via `.env`, or per browser in Settings)
- **Free AI, two tiers** — set `NVIDIA_API_KEY` for high-accuracy cloud inference via [NVIDIA NIM](https://build.nvidia.com) (free endpoint); falls back to local Ollama automatically
- **Export & import** — download results with mood labels and AI analysis as CSV or JSON from Settings, and open them again later
- **Pluggable sources** — a new news API is one entry in `news-api-collector.ts`; a new platform is one collector class + one `register()` call
- **Persistent storage (optional)** — PostgreSQL backend for `POST /api/search` with `persist: true`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           EchoFlow                              │
│                                                                 │
│  ┌──────────┐   ┌───────────────────────────────────────────┐  │
│  │  Web UI  │   │           REST API (Express)              │  │
│  │  / (one  │   │  /api/discover  /api/platforms  /api/...  │  │
│  │   page)  │   │                                           │  │
│  └──────────┘   └──────────────────┬──────────────────────── ┘ │
│                                    │                            │
│                  ┌─────────────────▼──────────────────────┐    │
│                  │           CollectorRegistry             │    │
│                  │   register()   get()   getAll()         │    │
│                  └──┬──────────────┬───────────────────┬───┘   │
│                     │              │                   │        │
│         ┌───────────▼──┐  ┌────────▼───────┐  ┌───────▼────┐  │
│         │ Social       │  │ News APIs      │  │  RSS/Atom  │  │
│         │ Reddit · HN  │  │ Google News    │  │  any feed  │  │
│         │ Bluesky ·    │  │ Spaceflight +  │  │            │  │
│         │ Lemmy        │  │ 8 free-key APIs│  │            │  │
│         └──────────────┘  └────────────────┘  └────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  AI Provider (priority order)                            │  │
│  │  1. NVIDIA NIM — nemotron-3 ultra → super (free cloud)   │  │
│  │  2. Ollama     — llama3.2:3b (local Docker fallback)     │  │
│  │  POST /api/analytics/analyze → sentiment, summary,       │  │
│  │  opinion, themes, insights, per-post labels — free       │  │
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
| One `/api/discover` call per search | All sources run in parallel; one failing source never fails the search, it is just reported |
| Table-driven news APIs | Each public-apis news API is a ~15-line definition, not a new class |
| User keys stay in the browser | Settings stores keys in localStorage and sends them only with the user's own search requests |
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
http://localhost:3000
```

Everything is on that one page. The ⚙ **Settings** button (top right) holds sources and API keys, quick-search buttons, time range, export/import and AI info.

**5. Hard-refresh after any rebuild**

After `docker compose up --build`, press **Ctrl+Shift+R** in the browser to bypass cached JS.

**6. Verify**

```bash
curl http://localhost:3000/health
# → {"status":"ok","service":"echoflow","timestamp":"..."}

curl http://localhost:3000/api/platforms
# → {"platforms":[{"id":"reddit",...},{"id":"hackernews",...},{"id":"guardian",...,"apiKey":{...}}, ...]}
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
| `NVIDIA_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b,nvidia/nemotron-3-super-120b-a12b` | NVIDIA NIM model IDs, comma-separated, tried in order |
| `OLLAMA_HOST` | `http://ollama:11434` | Ollama service URL (local fallback) |
| `OLLAMA_MODEL` | `llama3.2:3b` | Local Ollama model (used when no NVIDIA key) |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | — | Optional Reddit OAuth app. Without it, Reddit search falls back to RSS (no scores) |
| `GUARDIAN_API_KEY`, `NYT_API_KEY`, `GNEWS_API_KEY`, `NEWSDATA_API_KEY`, `CURRENTS_API_KEY`, `THENEWSAPI_KEY`, `NEWSAPI_KEY`, `MEDIASTACK_API_KEY` | — | Optional free news API keys, see [Supported Sources](#supported-sources). Each source turns on when its key is set |

**AI provider priority:** NVIDIA NIM → Ollama. If NVIDIA fails or no key is set, Ollama is used automatically. Both are free.

**Recommended NVIDIA NIM models** (free tier, set via `NVIDIA_MODEL`):

| Model | Notes |
|---|---|
| `nvidia/nemotron-3-ultra-550b-a55b` | **Default, first choice** — ~94% correct on our hand-labelled headline benchmark, ~7 s; free endpoint is sometimes busy |
| `nvidia/nemotron-3-super-120b-a12b` | **Default backup** — ~86%, ~3 s |
| `nvidia/nemotron-3.5-lightning-30b-a3b` | ~81%; mislabels obvious bad news as positive — not recommended |

NVIDIA retires models from time to time (e.g. `mistralai/mistral-nemotron` now returns HTTP 410). If analysis falls back to Ollama, check the server log and pick a current model from `https://integrate.api.nvidia.com/v1/models`.

**Ollama fallback models** (local, no internet needed, set via `OLLAMA_MODEL`):

| Model | Size | Notes |
|---|---|---|
| `llama3.2:3b` | ~2 GB | **Default** — good structured output |
| `llama3.2:1b` | ~600 MB | Lighter but unreliable for analysis |
| `llama3.1:8b` | ~4.7 GB | Best local quality, needs more RAM |

---

## Supported Sources

Shown in **Settings → Sources**, where each one can be switched off.

### No key needed

| Source | How | Notes |
|---|---|---|
| Reddit | JSON API, or RSS search when JSON is blocked (403) | Scores and comment counts only with `REDDIT_CLIENT_ID`/`SECRET` |
| Hacker News | [Algolia HN API](https://hn.algolia.com/api) | Scores + comments |
| Bluesky | `api.bsky.app` public search | Likes, reposts, replies |
| Lemmy | lemmy.world → lemmy.ml → beehaw.org | Scores + comments |
| Google News | Google News RSS search | Headlines from thousands of outlets |
| Spaceflight News | [spaceflightnewsapi.net](https://spaceflightnewsapi.net) | From public-apis; space & science |

### Free key (from [public-apis → News](https://github.com/public-apis/public-apis#news))

| Source | Free tier | Get a key | Env var |
|---|---|---|---|
| The Guardian | 500 requests/day | [open-platform.theguardian.com](https://open-platform.theguardian.com/access/) | `GUARDIAN_API_KEY` |
| New York Times | 500 requests/day | [developer.nytimes.com](https://developer.nytimes.com/get-started) | `NYT_API_KEY` |
| GNews.io | 100 requests/day | [gnews.io](https://gnews.io/register) | `GNEWS_API_KEY` |
| NewsData.io | 200 requests/day | [newsdata.io](https://newsdata.io/register) | `NEWSDATA_API_KEY` |
| Currents | free tier (see site) | [currentsapi.services](https://currentsapi.services/en/register) | `CURRENTS_API_KEY` |
| TheNewsAPI | 100 requests/day, 3 articles each | [thenewsapi.com](https://www.thenewsapi.com/register) | `THENEWSAPI_KEY` |
| NewsAPI.org | 100 requests/day, articles ≤ 1 month old | [newsapi.org](https://newsapi.org/register) | `NEWSAPI_KEY` |
| Mediastack | 100 requests/month (HTTP only) | [mediastack.com](https://mediastack.com/signup/free) | `MEDIASTACK_API_KEY` |

Free-tier limits are the providers' own figures and change from time to time. Every keyword in a search costs one request per source.

### RSS / Atom feeds

Quick-search buttons can attach a curated feed bundle (World, Finland, Tech, Gaming, Esports; see `FEED_BUNDLES` in `public/app.js`). Through the API, any feed works: `POST /api/discover` with `feeds: [...]`, or `POST /api/search` with `platforms: ["rss"]` and feed URLs in `channels`.

> **Cloudflare-protected sites** (e.g. HLTV forum threads) block automated HTTP. Use the site's news RSS feed instead.

---

## The UI

A single page at `http://localhost:3000`:

1. **Search bar.** Comma-separated topics (`News, Finland`) are each searched across every enabled source.
2. **Quick-search buttons** under it. Click one to search; **+ Save search** turns the current search into a button. Manage the buttons in Settings.
3. **Top 10** (left): most popular by engagement, or latest.
4. **AI analysis** (right): mood bar (green / grey / red), summary, the AI's own opinion, themes and insights. Click a mood to filter the list below.
5. **All results**, colour-coded by mood and filterable by mood and source. The AI labels every result (up to 200) and the mood bar is counted from those labels; a `*` after the mood means the AI couldn't label that post and it was estimated from keywords.

**Settings (⚙, top right):** export/import CSV & JSON, time range, results per source, quick-search buttons, sources + API keys, AI provider info.

Old URLs (`/ui/news`, `/ui/reddit`, `/ui/analytics.html`, …) redirect to the main page. `/?q=News,Finland` opens a search directly.

---

## API Reference

All endpoints under `http://localhost:3000/api`.

---

### POST /api/discover

The single search behind the main page. All sources run in parallel; failures are reported per source instead of failing the request.

```jsonc
// Request
{
  "query": "News, Finland",          // comma-separated, up to 5 keywords
  "sources": ["reddit", "guardian"], // optional; default = every source that is ready
  "timeRange": "week",               // "hour"|"day"|"week"|"month"|"year"|"all"
  "limit": 15,                       // per source, per keyword (max 50)
  "feeds": ["https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_NEWS"], // optional RSS, included unfiltered
  "apiKeys": { "guardian": "..." }   // optional per-request keys (override env)
}

// Response
{
  "query": "News, Finland",
  "keywords": ["News", "Finland"],
  "sources": {
    "reddit":   { "name": "Reddit", "count": 30 },
    "guardian": { "name": "The Guardian", "count": 0, "skipped": true, "error": "No API key — add one in Settings" }
  },
  "results": [ /* Post objects, de-duplicated; metadata.keyword says which keyword matched */ ],
  "totalResults": 30,
  "timestamp": "..."
}
```

---

### POST /api/search

Lower-level, per-platform search with modes, channels, comments and optional persistence.

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

Returns every registered source, its category (`social` / `news` / `feed`) and whether it needs a key.

```jsonc
{
  "platforms": [
    { "id": "reddit", "displayName": "Reddit", "category": "social", "description": "...",
      "capabilities": { "search": true, "latest": true, "top": true, "comments": true, "requiresAuth": false } },
    { "id": "guardian", "displayName": "The Guardian", "category": "news", "description": "...",
      "capabilities": { "search": true, "latest": false, "top": false, "comments": false, "requiresAuth": true },
      "apiKey": { "envVar": "GUARDIAN_API_KEY", "signupUrl": "https://open-platform.theguardian.com/access/", "configured": false } }
  ]
}
```

---

### POST /api/analytics/analyze

Runs AI analysis on up to 200 posts. Two requests run in parallel: a summary/opinion of the first 25 posts, and a sentiment label for **every** post (batches of 40, each post a numbered key so the model can't drift). The sentiment percentages are computed from those labels. Uses the NVIDIA models in `NVIDIA_MODEL` in order, then Ollama.

```jsonc
// Request
{ "posts": [...], "keyword": "Counter-Strike" }

// Response
{
  "sentiment":  { "positive": 55, "neutral": 30, "negative": 15 },
  "themes":     ["team performance", "tournament format", "player transfers"],
  "summary":    "Community discussion focuses on recent tournament results...",
  "opinion":    "The hype looks justified: results back it up, but the roster worries are real.",
  "articleLabels": ["pos", "neu", "neg", null, "..."], // one per post sent, in order (null = not labelled)
  "labelledCount": 87,
  "mood":       "excited",
  "insights":   ["Team roster changes are the dominant topic.", "Sentiment spikes around major announcements."],
  "postCount":  25,
  "provider":   "nvidia:nvidia/nemotron-3-ultra-550b-a55b",
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
  "nvidiaModel": "nvidia/nemotron-3-ultra-550b-a55b",
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

### GET /health

```json
{ "status": "ok", "service": "echoflow", "timestamp": "2026-05-12T10:00:00.000Z" }
```

---

## Adding a New Platform

The registry pattern makes this two steps with no changes to existing routes.

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
      platform:   'devto',
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

Done. The source appears in **Settings → Sources** and is used by every search, with no frontend changes needed. Set `category = 'news' as const` for news sources, and `apiKeyInfo` if it needs a key.

**Adding a news API is even shorter:** append a definition to `NEWS_APIS` in `src/collectors/news-api-collector.ts` (request builder + response mapper). Key handling, errors and the Settings UI come for free.

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
│   │   ├── server.ts                  # Middleware, routes, /api/platforms, serves the single page
│   │   └── routes/
│   │       ├── discover.ts            # POST /api/discover — the main multi-source search
│   │       ├── search.ts              # POST /api/search — per-platform search, comments, persistence
│   │       ├── analytics.ts           # /api/analytics/analyze + /status — AI analysis
│   │       ├── recs.ts                # POST /api/recs — AI recommendation extraction
│   │       └── reddit.ts              # POST /api/reddit/comments
│   ├── collectors/
│   │   ├── base-collector.ts          # Abstract base, SearchOptions, categories, API-key handling
│   │   ├── collector-registry.ts      # CollectorRegistry class + singleton
│   │   ├── index.ts                   # Bootstrap: register all collectors here
│   │   ├── reddit-collector.ts        # Reddit JSON API (+ RSS search fallback)
│   │   ├── hackernews-collector.ts    # HN via Algolia API
│   │   ├── bluesky-collector.ts       # Bluesky public search
│   │   ├── lemmy-collector.ts         # Lemmy (several instances)
│   │   ├── gnews-collector.ts         # Google News RSS search
│   │   ├── news-api-collector.ts      # public-apis news APIs (Spaceflight, Guardian, NYT, GNews, …)
│   │   └── rss-collector.ts           # Generic RSS 2.0 / Atom feed collector
│   ├── services/
│   │   └── ai-service.ts              # AI integration — NVIDIA NIM (primary) + Ollama (fallback)
│   ├── db/
│   │   ├── pool.ts                    # pg connection pool
│   │   ├── repositories.ts            # upsertPost, upsertComment, createSearch, …
│   │   └── init/01_schema.sql         # Auto-runs on first boot
│   ├── models/
│   │   └── post.ts                    # Post + Comment interfaces
│   ├── exporters/
│   │   ├── csv-formatter.ts           # ?format=csv for /api/search
│   │   └── html-formatter.ts          # ?format=html for /api/search
│   └── utils/
│       ├── logger.ts                  # Winston
│       └── errors.ts                  # APIError, RateLimitError, NetworkError
├── public/
│   ├── index.html                     # The single page
│   ├── app.js                         # Search, Top 10, AI panel, results, settings, export/import
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

**A source shows ⚠ next to its name after a search**

Hover over it to see the error. Typical causes: an invalid or rate-limited API key (free tiers have daily limits), or the provider being down. The other sources still return results.

**A news API says "needs free key"**

Paste a key in Settings → Sources, or set its env var (see [Supported Sources](#supported-sources)) and restart the server.

**Old pages or "Route not found" at `http://localhost:3000`**

The Docker image is stale. Run `docker compose up --build`, then hard-refresh with Ctrl+Shift+R.

**RSS feed returns 0 results**

- Verify the URL is a valid RSS/Atom feed (open it in a browser — it should show XML)
- Sites behind Cloudflare block automated requests — check if the site has a separate news RSS URL

**AI analysis shows only neutral / all posts classified neutral**

- Without an `NVIDIA_API_KEY`, Ollama is used. The `llama3.2:1b` model is too small — set `OLLAMA_MODEL=llama3.2:3b` in `.env` and rebuild
- For best results, add a free `NVIDIA_API_KEY` — the cloud model handles structured output much more reliably

**Ollama returns 503**

Ollama is still starting or pulling the model (~2 GB on first run). Check progress: `docker logs echoflow-ollama -f`

**NVIDIA NIM returns an error**

- Verify the key is correct in `.env` (no extra spaces)
- HTTP 404/410 means the model was retired or isn't available to your account — pick another from `https://integrate.api.nvidia.com/v1/models`
- EchoFlow automatically falls back to Ollama if NVIDIA fails

**Database connection error on startup**

The web container may start before Postgres finishes initialising. Run `docker compose restart web`.

**Reddit rate limit (429 in logs)**

Reddit allows ~60 requests/minute unauthenticated. EchoFlow backs off automatically. Reduce `limit` or disable comment fetching to lower request volume.

**TypeScript errors after pulling new changes**

```bash
npm install && npm run build
```

---

## Authors

- **Niko Kulkula**
- **Arttu-Jussi Kilponen**

---

## License

MIT License — see [LICENSE](LICENSE) for details.
