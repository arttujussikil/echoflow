# EchoFlow – Project Overview

## What It Does

EchoFlow is one search box for news and social media. You type a topic (or several, separated by commas), and it searches Reddit, Hacker News, Bluesky, Lemmy, Google News, Finnish newspapers and a set of free news APIs in parallel. An AI then labels the mood of every post (positive, neutral or negative), writes a summary and gives its own opinion. Everything is shown on a single page.

On top of the mood labels it offers:

- **Ask the results**: a question answered only from the posts found, with links to the posts used (retrieval-augmented generation).
- **Stories**: posts about the same event, in any language, grouped by a local embedding model.
- **Mood toward…**: the mood toward a named person, company or place, not just the overall tone.
- **Mood by source and over time**: the same topic compared across sources, and how its mood changes day by day (analyses are saved in PostgreSQL).
- **Model comparison**: NVIDIA and Gemini run on the same posts, side by side.

It is a school project for an AI course and only uses free sources and free AI tiers. How the AI part was designed and measured is in [ai-design.md](./ai-design.md).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 (optional, via Docker) |
| Sources | Reddit, Hacker News, Bluesky, Lemmy, Google News, 8 keyed news APIs, Finnish papers, any RSS/Atom feed |
| AI (cloud) | NVIDIA NIM (Nemotron), Google Gemini, or any OpenAI-compatible API you configure |
| AI (local) | Ollama (llama3.2), Hugging Face ONNX models for offline mood labels and embeddings |
| UI | Vanilla HTML / CSS / JS, no build step |
| Deployment | Docker Compose |

---

## Architecture

```
public/
  index.html            → The single page (search, Top 10, AI panel, results, settings drawer)
  app.js                → All UI logic (search, AI panel, charts, export/import)
  styles.css
  sentiment-keywords.js → Keyword mood fallback in the browser, also the non-AI baseline in the benchmark

src/
  index.ts              → Entry point: loads .env, sets up routes, warms up local models
  api/
    server.ts           → Middleware, routes, /api/platforms, serves the page
    routes/
      discover.ts       → POST /api/discover: the main search, all sources in parallel
      analytics.ts      → /api/analytics: analyze, ask, stories, target, status
      history.ts        → /api/history: mood over time
      recs.ts           → POST /api/recs: recommendation extraction
      search.ts         → POST /api/search: older per-platform API (CSV/HTML export, persistence)
      reddit.ts         → POST /api/reddit/comments
  collectors/
    base-collector.ts       → Abstract base class, categories, API-key handling
    collector-registry.ts   → Singleton registry (register once, use everywhere)
    index.ts                → Registers every source
    reddit / hackernews / bluesky / lemmy / gnews / rss collectors
    news-api-collector.ts   → Table-driven free news APIs from public-apis
    finnish-news-collector.ts → Finnish newspapers via Google News Finland, RSS fallback
  services/
    ai-service.ts       → All LLM work: mood labels, summary, ask, target; provider chain
    local-sentiment.ts  → Offline Hugging Face mood classifier
    embeddings.ts       → Local embedding model (stories, ask, target)
    tracker.ts          → Optional background analysis of TRACK_TOPICS
  db/
    pool.ts             → PostgreSQL connection pool
    repositories.ts     → createSearch, upsertPost, upsertComment, …
    history.ts          → mood_history table (created on first use)
    init/01_schema.sql  → Runs on a fresh DB volume
  exporters/            → CSV and HTML output for /api/search
  models/post.ts        → Post + Comment interfaces
  utils/                → logger, error handling, env helpers

eval/                   → Sentiment benchmark, datasets, human-label tool, saved results
docs/                   → This file, ai-design.md, database.md, reddit_guide.md
```

---

## Key Flows

### 1. Search (what the UI uses)
```
Browser → POST /api/discover { query, sources, timeRange, … }
  → query split on commas (max 5 keywords)
  → every enabled source runs in parallel, each with a 20 s timeout
  → keywords run one after another inside a source (avoids rate limits)
  → a failing source is reported in sources[id].error and never fails the request
  → results de-duplicated by URL and filtered by time range again
```

### 2. AI analysis
```
Browser → POST /api/analytics/analyze { posts, keyword, language }
  → two requests in parallel:
      a) summary, opinion and themes from the first 25 posts
      b) a mood label per post (up to 200, in batches of 40, numbered keys)
  → provider chain: NVIDIA NIM → Gemini → your own model → Ollama
  → if the cloud providers fail, labels come from the offline Hugging Face classifier
  → mood percentages are counted from the labels, not asked from the model
  → with a topic, the result is saved to mood_history (fire and forget, skipped if PostgreSQL is down)
```

### 3. Ask the results, Stories, Mood toward…
```
Browser → POST /api/analytics/ask | stories | target
  → posts are embedded locally (multilingual-e5-small)
  → ask:     the 15 most similar posts go to the LLM, citations map back to post indexes
  → stories: posts with cosine similarity ≥ 0.88 are clustered
  → target:  posts naming the target, plus similar ones, are labelled toward that target
```

### 4. Older search + save flow
```
Browser → POST /api/search { platforms, mode, keyword, channels, persist: true }
  → collectors run, results saved with createSearch / upsertPost / linkPostToSearch
  → JSON, CSV (?format=csv) or HTML (?format=html) response
```
The UI does not use this endpoint, but it still works.

---

## Collector Registry Pattern

Every source extends `BaseCollector` and is registered once at startup:

```ts
// src/collectors/index.ts
registry.register(new RedditCollector({ maxResults: 100 }));
registry.register(new HackerNewsCollector({ maxResults: 100 }));
```

Routes never import a specific collector. They loop over `registry.getAll()`, so a new source appears in `/api/platforms`, the UI filters and every search automatically.

Each collector declares a `category` (`social`, `news`, `finnish`, `feed`), whether it is `defaultEnabled`, and, if it needs a key, an `apiKeyInfo`. A key pasted in Settings (stored only in the user's browser) wins over the server's `.env` value.

---

## Supported Sources

| Source | Category | Key needed |
|---|---|---|
| Reddit | social | Optional (OAuth when `REDDIT_CLIENT_ID`/`SECRET` are set, otherwise RSS search without scores) |
| Hacker News | social | No |
| Bluesky | social | No |
| Lemmy | social | No |
| Google News | news | No |
| Spaceflight News | news | No |
| Guardian, NYT, GNews, NewsData, Currents, TheNewsAPI, NewsAPI, Mediastack | news | Yes, free tier |
| Finnish papers (Yle, Helsingin Sanomat, Ilta-Sanomat, …) | finnish | No |
| Any RSS / Atom feed | feed | No |

The README has the exact, current list and the environment variables.

---

## Docker Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| web | (built from repo) | 3000 | Express API + static UI |
| db | postgres:16-alpine | 5432 | PostgreSQL |
| ollama | ollama/ollama:latest | 11434 | Local LLM fallback |
| adminer | adminer:4 | 8888 | DB admin UI |

---

## Quick Start

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env: set DB_PASSWORD, and optionally NVIDIA_API_KEY / GEMINI_API_KEY

# Start everything
docker compose up -d --build

# Watch logs
docker compose logs -f web

# Access
http://localhost:3000           # The app (single page)
http://localhost:8888           # Adminer (DB admin)
```

Without any AI key the app still works: mood labels come from the offline Hugging Face model (about 280 MB, downloaded once on first start), and the summary comes from Ollama (about 2 GB, pulled on first use).

**Hard-refresh the browser** (Ctrl+Shift+R) after a rebuild to avoid serving cached JS/HTML.

---

## Database

PostgreSQL is optional: if it is unreachable, the app logs the error and keeps working, only without saved history.

| Table | Purpose |
|---|---|
| `posts` | Posts from all platforms with engagement metrics |
| `comments` | Comments linked to posts |
| `subreddits` | Unique channel names (originally Reddit, now multi-platform) |
| `searches` | One row per saved search |
| `search_posts` | Many-to-many: searches ↔ posts |
| `trends` | Trending words per saved search (`trend_posts` is in the schema but not used yet) |
| `mood_history` | One row per analysis, for mood over time (created on first use) |

See [database.md](./database.md) for the schema and query examples.

---

## Adding a New Platform

1. Create `src/collectors/my-platform-collector.ts` extending `BaseCollector`
2. Implement `platformId`, `displayName`, `capabilities`, `search()`
3. Register in `src/collectors/index.ts`:
   ```ts
   import { MyPlatformCollector } from './my-platform-collector';
   registry.register(new MyPlatformCollector());
   ```
4. Rebuild Docker: `docker compose up --build`

For a free news API, add an entry to `NEWS_APIS` in `news-api-collector.ts` instead of writing a class. The `/api/platforms` endpoint and the UI chips update automatically.

---

## Useful Commands

```bash
# Force full rebuild after code changes
docker compose up --build

# Reset DB (drops all data, re-runs 01_schema.sql)
docker compose down -v && docker compose up -d --build

# Check which Ollama models are downloaded
curl http://localhost:11434/api/tags

# Check AI service status
curl http://localhost:3000/api/analytics/status

# Run the sentiment benchmark (uses the API keys in .env)
npm run eval
```
