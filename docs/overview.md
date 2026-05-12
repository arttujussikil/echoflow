# EchoFlow – Project Overview

## What It Does

EchoFlow is an AI-powered social media aggregator. It collects posts and comments from multiple platforms, lets you filter and export them, and runs local AI analysis (sentiment, themes, insights) — all at zero cost.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 (via Docker) |
| Collectors | Reddit JSON API, HackerNews Algolia API |
| AI Analysis | Ollama (local LLM, runs in Docker) |
| UI | Vanilla HTML / CSS / JS |
| Deployment | Docker Compose |

---

## Architecture

```
public/
  index.html          → Landing page / dashboard
  reddit.html         → Universal search UI (all platforms)
  app.js              → Client logic (platform chips, AI panel, results)
  styles.css

src/
  index.ts            → Express server entry point
  api/routes/
    search.ts         → POST /api/search  (multi-platform dispatch)
    analytics.ts      → POST /api/analytics/analyze  (AI analysis)
    reddit.ts         → Legacy /api/reddit/* endpoints
    export.ts         → /api/export  (CSV / JSON)
  collectors/
    base-collector.ts     → Abstract base class + interfaces
    collector-registry.ts → Singleton registry (register once, use everywhere)
    index.ts              → Bootstrap: registers all collectors
    reddit-collector.ts   → Reddit public JSON API
    hackernews-collector.ts → HackerNews via Algolia API (free, no auth)
    forum-collector.ts    → Stub template for future platforms
  services/
    ai-service.ts     → Ollama integration (analyzeWithAI, checkOllamaStatus)
  db/
    pool.ts           → PostgreSQL connection pool
    repositories.ts   → createSearch, upsertPost, upsertComment, …
    init/
      01_schema.sql   → Auto-runs on fresh DB volume
  exporters/
    csv-formatter.ts
    html-formatter.ts
    analytics-exporter.ts
  models/
    post.ts           → Post + Comment TypeScript interfaces
  utils/
    logger.ts
    errors.ts

docs/
  overview.md         → This file
  database.md         → DB schema + usage
  reddit_guide.md     → Multi-platform search guide
```

---

## Key Flows

### 1. Search Flow (no persistence)
```
Browser → POST /api/search { platforms, mode, keyword, channels, … }
  → CollectorRegistry resolves each platform's collector
  → Each collector.search() runs in sequence
  → Partial failures are tolerated (platformErrors returned)
  → Optional comment fetching per platform
  → JSON / CSV / HTML response
```

### 2. Search + Save Flow
```
persist: true in request body
  → createSearch() → searchId
  → upsertPost() for every result
  → linkPostToSearch()
  → upsertComment() for fetched comments
  → updateSearchResultCount()
  → Response includes searchId
```

### 3. AI Analysis Flow
```
Browser → POST /api/analytics/analyze { posts, keyword }
  → ensureModel() checks Ollama is live and model is pulled
  → buildPrompt() formats up to 25 posts
  → POST /api/generate (Ollama, format: "json")
  → Normalise + validate JSON response
  → Return { sentiment, themes, summary, mood, insights }
```

---

## Collector Registry Pattern

All platform collectors extend `BaseCollector` and are registered once at startup:

```ts
// src/collectors/index.ts
registry.register(new RedditCollector({ maxResults: 100 }));
registry.register(new HackerNewsCollector({ maxResults: 100 }));
```

Adding a new platform = one file + one `registry.register()` call. The `/api/platforms` endpoint exposes the live list to the frontend automatically.

Each collector declares its capabilities:
```ts
capabilities = { search: true, latest: true, top: true, comments: true, requiresAuth: false }
```

The search route skips a platform+mode combination silently if the capability flag is false.

---

## Supported Platforms

| Platform | Modes | Comments | Auth |
|---|---|---|---|
| Reddit | search, latest, top | Yes | No |
| Hacker News | search, latest, top | Yes | No |

`channels` in the request payload maps to the platform-specific concept: subreddits for Reddit, Algolia tags for HN (`story`, `ask_hn`, `show_hn`, `job`).

---

## AI Analysis (Ollama)

Runs entirely locally in Docker — zero API cost.

| Setting | Default | Notes |
|---|---|---|
| `OLLAMA_HOST` | `http://ollama:11434` | Docker service name |
| `OLLAMA_MODEL` | `llama3.2:3b` | ~2 GB, pulled automatically on first use |

Model options (set via `.env`):
- `llama3.2:3b` — recommended, ~2 GB, good structured output
- `llama3.2:1b` — ~600 MB, lighter but unreliable for analysis
- `llama3.1:8b` — best quality, ~4.7 GB, needs more RAM

The first "Analyze with AI" click may take 1–2 minutes while the model downloads (~2 GB one-time).

---

## Docker Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| web | (built from repo) | 3000 | Express API + static UI |
| db | postgres:16-alpine | 5432 | PostgreSQL |
| ollama | ollama/ollama:latest | 11434 | Local LLM inference |
| adminer | adminer:4 | 8888 | DB admin UI |

---

## Quick Start

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env — set DB_PASSWORD at minimum

# Start everything (first run downloads ~2 GB for the AI model)
docker compose up -d --build

# Watch logs
docker compose logs -f web
docker compose logs -f ollama   # watch model download progress

# Access
http://localhost:3000/ui/       # Landing page
http://localhost:3000/ui/reddit # Universal search UI
http://localhost:8888           # Adminer (DB admin)
```

**Hard-refresh the browser** (Ctrl+Shift+R) after a rebuild to avoid serving cached JS/HTML.

---

## Database Tables

| Table | Purpose |
|---|---|
| `posts` | Posts from all platforms with engagement metrics |
| `comments` | Comments linked to posts |
| `subreddits` | Unique channel names (originally Reddit, now multi-platform) |
| `searches` | One row per search run with parameters |
| `search_posts` | Many-to-many: searches ↔ posts |

See [database.md](./database.md) for schema and query examples.

---

## Adding a New Platform

1. Create `src/collectors/my-platform-collector.ts` extending `BaseCollector`
2. Implement `platformId`, `displayName`, `capabilities`, `search()`
3. Optionally implement `fetchCommentsForPosts()`
4. Register in `src/collectors/index.ts`:
   ```ts
   import { MyPlatformCollector } from './my-platform-collector';
   registry.register(new MyPlatformCollector());
   ```
5. Rebuild Docker: `docker compose up --build`

The `/api/platforms` endpoint and UI platform chips update automatically.

---

## Useful Commands

```bash
# Force full rebuild after code changes
docker compose up --build

# Reset DB (drops all data)
docker compose down -v && docker compose up -d --build

# Check which Ollama models are downloaded
curl http://localhost:11434/api/tags

# Check AI service status
curl http://localhost:3000/api/analytics/status

# Check rate limits per platform
curl http://localhost:3000/api/search/rate-limits

# Run search via curl
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"platforms":["reddit","hackernews"],"mode":"top","channels":["programming"],"timeRange":"week","limit":10}' \
  | jq .

# Inspect DB directly
docker exec -it echoflow-db psql -U echoflow -d echoflow
```
