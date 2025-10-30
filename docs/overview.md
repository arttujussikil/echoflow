# EchoFlow – Project Overview

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (via Docker)
- **Collector**: Reddit JSON API (no auth required)
- **UI**: Vanilla HTML/CSS/JS
- **Deployment**: Docker Compose

## Architecture

```
public/
  reddit.html       → UI
  app.js            → Client logic
  styles.css

src/
  index.ts          → Express server entry
  api/routes/
    search.ts       → Main API endpoint
  collectors/
    base-collector.ts    → Abstract base class
    reddit-collector.ts  → Reddit API wrapper
  db/
    pool.ts         → PostgreSQL connection
    repositories.ts → Data persistence functions
    init/
      01_schema.sql → DB schema
  exporters/
    csv-formatter.ts
    html-formatter.ts
  utils/
    logger.ts
    errors.ts

docs/
  database.md       → DB schema + usage
  reddit_guide.md   → Collector guide
  overview.md       → This file
```

## Key Flows

### 1. Search Flow (No Persistence)
```
User → UI → POST /api/search
  → RedditCollector.fetchTop()
  → Filter/sort results
  → Return JSON
```

### 2. Search + Save Flow
```
User checks "Save to DB" → persist: true
  → Create search record (searchId)
  → Fetch posts
  → Upsert posts
  → Link posts to search
  → Fetch & save comments
  → Update result_count
  → Return JSON with searchId
```

### 3. Export Flow
```
User clicks "Download CSV"
  → POST /api/search?format=csv
  → Fetch & format results
  → Return CSV download
```

## Database Tables

- `subreddits` – Unique subreddit names
- `posts` – Posts with engagement metrics
- `comments` – Comments linked to posts
- `searches` – Search runs with parameters
- `search_posts` – Links searches to posts

See [database.md](./database.md) for schema.


## Docker Services

- **web** – Node.js app (port 3000)
- **db** – PostgreSQL 15 (port 5432)
- **adminer** – DB admin UI (port 8080)

## Quick Start

```bash
# Clone and setup
git clone <repo>
cd echoflow
cp .env.example .env

# Start services
docker compose up -d --build

# Check logs
docker compose logs -f web

# Access
http://localhost:3000/reddit.html  # UI
http://localhost:8080              # Adminer



Quick fresh-clone checklist:

Copy env: cp .env.example .env and set DB_PASSWORD
Install: npm install
Start DB stack: docker compose up -d --build
Dev server: npm run dev
Open UI: http://localhost:3000/ui/


```


**First time setup:**
1. The database schema auto-initializes from `src/db/init/01_schema.sql`
2. No manual migrations needed
3. Adminer credentials: user=`echoflow`, password=from `.env`


## Adding a New Collector

1. Create `src/collectors/new-collector.ts`
2. Extend `BaseCollector`
3. Implement `search()` method
4. Add platform option to UI
5. Update `search.ts` to call new collector

Example:
```ts
export class NEWCollector extends BaseCollector {
  async search(keyword: string, timeRange: string): Promise<any[]> {
    // Fetch from forum API
    const raw = await fetchNEWPosts(keyword);
    return this.validatePosts(raw);
  }
}
```

## Useful Commands

```bash
# View DB
docker exec -it echoflow-db psql -U echoflow -d echoflow

# Reset DB
docker compose down -v
docker compose up -d --build

# Check rate limits
curl http://localhost:3000/api/search/rate-limits

# Run search
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"mode":"top","subreddits":["typescript"],"timeRange":"week","limit":10}'
```

## Support

- Check logs: `docker compose logs web`
- Inspect DB: Adminer at http://localhost:8080
- Reddit API docs: https://www.reddit.com/dev/api