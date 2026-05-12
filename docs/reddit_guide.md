# EchoFlow – Multi-Platform Search Guide

This guide covers how EchoFlow collects data from each supported platform, the unified API, and how to extend it with new platforms.

---

## Supported Platforms

| Platform | API | Auth | Search | Latest | Top | Comments |
|---|---|---|---|---|---|---|
| Reddit | reddit.com JSON API | None | Yes | Yes | Yes | Yes |
| Hacker News | Algolia HN Search API | None | Yes | Yes | Yes | Yes |

All platforms are free and require no credentials.

---

## Unified Search API

**Endpoint:** `POST /api/search`

All platforms share the same request format:

```json
{
  "platforms": ["reddit", "hackernews"],
  "mode": "top",
  "channels": ["programming", "typescript"],
  "timeRange": "week",
  "limit": 25,
  "fetchComments": false,
  "commentLimit": 5,
  "commentSort": "top",
  "filters": {
    "minEngagement": 50,
    "sortBy": "comments"
  },
  "persist": false
}
```

### Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `platforms` | string[] | `["reddit"]` | Platform IDs to query |
| `mode` | `search` \| `latest` \| `top` | `search` | Collection mode |
| `keyword` | string | — | Required for `mode: search` |
| `channels` | string[] | `[]` | Subreddits (Reddit) or tags (HN) |
| `timeRange` | string | `day` | `hour`, `day`, `week`, `month`, `year`, `all` |
| `limit` | number | `50` | Results per platform |
| `fetchComments` | boolean | `false` | Fetch top comments for each post |
| `commentLimit` | number | `10` | Comments per post |
| `commentSort` | string | `top` | `top`, `best`, `new` |
| `filters.minEngagement` | number | — | Exclude posts below this score |
| `filters.sortBy` | string | — | `likes`, `comments`, `recent` |
| `persist` | boolean | `false` | Save results to the database |

### Response

```json
{
  "results": [...],
  "totalResults": 47,
  "platforms": ["reddit", "hackernews"],
  "mode": "top",
  "timeRange": "week",
  "channels": ["programming"],
  "platformErrors": {}
}
```

If one platform fails, its error is recorded in `platformErrors` and results from the working platforms are still returned.

---

## Platform Details

### Reddit

Uses Reddit's public JSON API — no API key, no OAuth.

**Rate limits:** ~60 requests/minute without auth. Comment fetching adds 1.2 s between posts.

**`channels` field:** subreddit names (without `r/`).

```json
{
  "platforms": ["reddit"],
  "mode": "top",
  "channels": ["worldnews", "technology"],
  "timeRange": "week",
  "limit": 50
}
```

**Search mode** — keyword search within subreddits:
```json
{
  "platforms": ["reddit"],
  "mode": "search",
  "keyword": "AI regulation",
  "channels": ["technology", "Futurology"],
  "timeRange": "month"
}
```

If `channels` is empty for search mode, Reddit searches all of r/all.

---

### Hacker News (via Algolia)

Uses the [HN Algolia Search API](https://hn.algolia.com/api) — free, public, no key required.

**`channels` field:** Algolia tag filters. Valid values:
- `story` (default — link and text posts)
- `ask_hn`
- `show_hn`
- `job`

```json
{
  "platforms": ["hackernews"],
  "mode": "latest",
  "channels": ["story", "ask_hn"],
  "limit": 30
}
```

**Search mode:**
```json
{
  "platforms": ["hackernews"],
  "mode": "search",
  "keyword": "TypeScript",
  "channels": ["story"],
  "timeRange": "week"
}
```

**Top mode** sorts by score within the time range:
```json
{
  "platforms": ["hackernews"],
  "mode": "top",
  "timeRange": "day",
  "limit": 25
}
```

---

## Collection Modes

### Latest
Fetches newest posts, ignoring keywords. Ignores `timeRange`.

```json
{
  "platforms": ["reddit", "hackernews"],
  "mode": "latest",
  "channels": ["programming"],
  "limit": 20
}
```

### Top
Fetches highest-scored posts within a time range.

```json
{
  "platforms": ["reddit", "hackernews"],
  "mode": "top",
  "timeRange": "week",
  "limit": 25
}
```

### Search
Keyword search. `keyword` is required.

```json
{
  "platforms": ["reddit", "hackernews"],
  "mode": "search",
  "keyword": "Rust language",
  "timeRange": "month",
  "limit": 30
}
```

---

## Comment Fetching

Enable with `fetchComments: true`. Comments are fetched after the main collection, per platform.

```json
{
  "platforms": ["reddit"],
  "mode": "top",
  "channels": ["AskReddit"],
  "limit": 10,
  "fetchComments": true,
  "commentLimit": 20,
  "commentSort": "best"
}
```

**Comment sort options:**
- `top` — highest score
- `best` — Reddit's confidence algorithm (Reddit only)
- `new` — most recent

HackerNews comment fetching calls `GET /api/v1/items/<id>` per post (adds ~500 ms per post).

---

## Filtering & Sorting

Applied after collection, across all platforms:

```json
{
  "filters": {
    "minEngagement": 100,
    "sortBy": "comments"
  }
}
```

`sortBy` values:
- `likes` — highest score first
- `comments` — most comments first
- `recent` — newest first

---

## Export Formats

### JSON (default)
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"platforms":["reddit"],"mode":"top","channels":["bitcoin"],"timeRange":"week"}'
```

### CSV
Add `?format=csv` to the URL:
```bash
curl "http://localhost:3000/api/search?format=csv" \
  -H "Content-Type: application/json" \
  -d '{"platforms":["reddit","hackernews"],"mode":"top","timeRange":"day"}' > results.csv
```

### HTML
```bash
curl "http://localhost:3000/api/search?format=html" \
  -H "Content-Type: application/json" \
  -d '{"platforms":["reddit"],"mode":"top","channels":["programming"],"timeRange":"week"}' > view.html
```

### Pretty JSON
```bash
curl "http://localhost:3000/api/search?pretty=1" \
  -H "Content-Type: application/json" \
  -d '{"platforms":["hackernews"],"mode":"latest","limit":5}'
```

---

## AI Analysis

After fetching results, click **Analyze with AI** in the UI (or call the API directly):

```bash
curl -X POST http://localhost:3000/api/analytics/analyze \
  -H "Content-Type: application/json" \
  -d '{"posts": [...], "keyword": "TypeScript"}'
```

Returns:
```json
{
  "sentiment": {"positive": 55, "neutral": 30, "negative": 15},
  "themes": ["performance", "type safety", "tooling", "adoption"],
  "summary": "Developers discuss TypeScript's ergonomics...",
  "mood": "curious",
  "insights": ["Performance is the top concern.", "Migration from JS is a common topic."],
  "postCount": 25,
  "analyzedAt": "2026-05-12T10:00:00.000Z"
}
```

Check AI status:
```bash
curl http://localhost:3000/api/analytics/status
```

---

## Common Use Cases

### Monitor breaking news across platforms
```json
{
  "platforms": ["reddit", "hackernews"],
  "mode": "latest",
  "channels": ["worldnews"],
  "limit": 50,
  "filters": {"minEngagement": 100}
}
```

### Track a keyword across all tech communities
```json
{
  "platforms": ["reddit", "hackernews"],
  "mode": "search",
  "keyword": "Rust language",
  "channels": ["programming", "story"],
  "timeRange": "month",
  "filters": {"sortBy": "comments"}
}
```

### Deep-dive with comments for AI analysis
```json
{
  "platforms": ["reddit", "hackernews"],
  "mode": "top",
  "timeRange": "week",
  "limit": 15,
  "fetchComments": true,
  "commentLimit": 10
}
```

---

## Adding a New Platform

1. Create `src/collectors/my-platform-collector.ts`:

```ts
import { BaseCollector, CollectorCapabilities, SearchOptions } from './base-collector';
import { Post } from '../models/post';

export class MyPlatformCollector extends BaseCollector {
  readonly platformId = 'myplatform';
  readonly displayName = 'My Platform';
  readonly capabilities: CollectorCapabilities = {
    search: true, latest: true, top: false, comments: false, requiresAuth: false
  };

  async search(keyword: string | null, options: SearchOptions = {}): Promise<Post[]> {
    // fetch from your API, transform to Post[]
    return this.validatePosts(raw);
  }
}
```

2. Register it in `src/collectors/index.ts`:
```ts
import { MyPlatformCollector } from './my-platform-collector';
registry.register(new MyPlatformCollector());
```

3. Rebuild Docker: `docker compose up --build`

The platform chip appears in the UI automatically — no frontend changes needed.

---

## Troubleshooting

**No results from HackerNews:**
- `latest` mode defaults to `story` tag — try without `channels` filter first
- `search` mode requires a keyword; empty keywords fall back to latest

**Reddit rate limit (429):**
- Wait ~60 seconds and retry
- Reduce `limit` or disable comment fetching

**Platform shows `platformErrors` but not failure:**
- Expected behaviour — partial results are returned from working platforms
- Check `platformErrors[platformId]` for the specific error message

**CSV opens garbled in Excel:**
- Use "Data → From Text/CSV" import wizard and select UTF-8

**Only Reddit shows in UI platform picker:**
- Docker image may be stale — run `docker compose up --build`
- Hard-refresh the browser with Ctrl+Shift+R to bypass cached JS
