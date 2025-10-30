# Reddit Collection Guide

This guide covers how EchoFlow collects and processes Reddit data.

## Overview

EchoFlow uses Reddit's public JSON API (no authentication required) to fetch posts and comments from any subreddit. You can search by keyword, browse top posts, or get the latest content.

## How It Works

### 1. Data Collection

**RedditCollector** (`src/collectors/reddit-collector.ts`) handles all Reddit API calls:

- `search(keyword, timeRange, opts)` – Keyword search with time filtering
- `fetchLatest(subreddit, limit)` – Newest posts from /new
- `fetchTop(subreddit, timeRange, limit)` – Highest-scored posts from /top
- `fetchCommentsBy(subreddit, postId, opts)` – Load comments for a specific post

**Rate Limiting:**
- Reddit allows ~60 requests/minute without OAuth
- Comment fetching adds 1.2s delay between posts to avoid 429 errors

### 2. Search Modes

#### **Latest Mode**
Fetches newest posts from subreddit(s), ignoring time range and keywords.

**Use case:** Monitor recent activity in r/bitcoin

**API endpoint:**
```
GET https://reddit.com/r/{subreddit}/new.json?limit=50
```

**Example request:**
```json
{
  "mode": "latest",
  "platforms": ["reddit"],
  "subreddits": ["bitcoin", "ethereum"],
  "limit": 25
}
```

---

#### **Top Mode**
Fetches highest-scored posts within a time range (no keyword needed).

**Use case:** Find viral posts from the past year in r/CryptoCurrency

**API endpoint:**
```
GET https://reddit.com/r/{subreddit}/top.json?t=year&limit=50
```

**Time ranges:** hour, day, week, month, year, all

**Example request:**
```json
{
  "mode": "top",
  "platforms": ["reddit"],
  "subreddits": ["CryptoCurrency"],
  "timeRange": "year",
  "limit": 50
}
```

---

#### **Search Mode**
Keyword-based search with time filtering. Searches post titles and content.

**Use case:** Find all mentions of "ETF" in r/bitcoin from the past month

**API endpoint:**
```
GET https://reddit.com/r/{subreddit}/search.json?q=ETF&t=month&restrict_sr=1
```

**Example request:**
```json
{
  "mode": "search",
  "keyword": "ETF",
  "platforms": ["reddit"],
  "subreddits": ["bitcoin"],
  "timeRange": "month",
  "limit": 100
}
```

**Note:** If no subreddits specified, searches all of Reddit (slower, less focused).

---

### 3. Filtering & Sorting

**Post-collection filters** applied after fetching:

- **Min engagement** – Only show posts with score ≥ N
- **Sort by:**
  - `likes` – Highest score first
  - `comments` – Most commented first
  - `recent` – Newest first

**Example:**
```json
{
  "mode": "top",
  "subreddits": ["bitcoin"],
  "timeRange": "week",
  "filters": {
    "minEngagement": 100,
    "sortBy": "comments"
  }
}
```

---

### 4. Comment Loading

**Two approaches:**

#### A. Bulk Fetch (Initial Request)
Set `fetchComments: true` to load comments for all posts upfront.

**Pros:** All data in one response  
**Cons:** Slow for many posts (1.2s × post count)

**Example:**
```json
{
  "mode": "latest",
  "subreddits": ["bitcoin"],
  "limit": 10,
  "fetchComments": true,
  "commentLimit": 5,
  "commentSort": "top"
}
```

#### B. On-Demand (UI)
Click "Comments" in the web UI to load them lazily.

**Endpoint:** `POST /api/reddit/comments`

**Request body:**
```json
{
  "subreddit": "bitcoin",
  "id": "abc123",
  "limit": 10,
  "sort": "best"
}
```

**Comment sorts:**
- `top` – Highest scored
- `best` – Reddit's "best" algorithm (uses `confidence` param)
- `new` – Most recent

---

### 5. Data Structure

**Post Object:**
```typescript
{
  id: string;              // Reddit post ID
  platform: "reddit";
  title: string;
  content: string;         // Selftext or title
  author: string;
  url: string;             // Direct link to post
  createdAt: Date;
  engagement: {
    likes: number;         // Upvotes
    comments: number;      // Comment count
    shares: 0;            // Reddit doesn't expose shares
    score: number;        // Net upvotes (ups - downs)
  };
  metadata: {
    subreddit: string;
    flair?: string;
    isNSFW: boolean;
  };
  comments?: Comment[];   // Optional
}
```

**Comment Object:**
```typescript
{
  id: string;
  author: string;
  body: string;           // Comment text
  score: number;
  createdAt: Date;
}
```

---

### 6. Export Formats

#### JSON (Default)
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"mode":"top","subreddits":["bitcoin"],"timeRange":"week"}'
```

#### Pretty JSON
Add `?pretty=1`:
```bash
curl "http://localhost:3000/api/search?pretty=1" \
  -H "Content-Type: application/json" \
  -d '{"mode":"latest","subreddits":["bitcoin"],"limit":5}'
```

#### CSV
Add `?format=csv`:
```bash
curl "http://localhost:3000/api/search?format=csv" \
  -H "Content-Type: application/json" \
  -d '{"mode":"top","subreddits":["bitcoin"],"timeRange":"month"}' > reddit.csv
```

**CSV Columns:**
id, platform, title, content, author, url, createdAt, likes, comments_count, shares, score, subreddit, flair, isNSFW, top_comments

#### HTML
Add `?format=html` for a scrollable table view:
```bash
curl "http://localhost:3000/api/search?format=html" \
  -H "Content-Type: application/json" \
  -d '{"mode":"top","subreddits":["bitcoin"],"timeRange":"year"}' > view.html
```

---

## Web UI Walkthrough

**URL:** `http://localhost:3000/ui/`

### Step-by-Step

1. **Enter subreddits**  
   Type comma-separated names: `bitcoin,ethereum,CryptoCurrency`

2. **Choose mode**
   - Latest → newest posts
   - Top → highest scored (requires time range)
   - Search → keyword + time range

3. **Set options**
   - **Posts per subreddit** – Max results (1-100)
   - **Time range** – hour/day/week/month/year/all
   - **Sort posts** – None, top liked, most commented, newest
   - **Min score** – Filter low-engagement posts

4. **Comments (optional)**
   - Check "Include comments" to fetch with initial request
   - Or leave unchecked and click "Comments" per post to load on-demand
   - **Count** – How many comments per post (1-50)
   - **Sort** – top, best, new

5. **Run & Export**
   - **Run** → See results inline (scrollable cards)
   - **Open HTML View** → New browser tab with table
   - **Download CSV** → Save to disk for Excel/Sheets

---

## Common Use Cases

### Monitor Breaking News
```json
{
  "mode": "latest",
  "subreddits": ["worldnews", "news"],
  "limit": 50,
  "filters": { "minEngagement": 500 }
}
```

### Find Viral Content
```json
{
  "mode": "top",
  "subreddits": ["videos", "funny"],
  "timeRange": "week",
  "limit": 25
}
```

### Track Keyword Over Time
```json
{
  "mode": "search",
  "keyword": "AI regulation",
  "subreddits": ["technology", "Futurology"],
  "timeRange": "month",
  "filters": { "sortBy": "comments" }
}
```

### Deep Dive with Comments
```json
{
  "mode": "top",
  "subreddits": ["AskReddit"],
  "timeRange": "day",
  "limit": 10,
  "fetchComments": true,
  "commentLimit": 20,
  "commentSort": "best"
}
```

---

## Limitations

- **No OAuth** – Uses public API only (no user-specific data, private subs)
- **Rate limits** – ~60 requests/min
- **Deleted content** – `[deleted]` authors and `[removed]` comments are filtered out
- **Comment depth** – Only fetches top-level comments (no nested replies)
- **NSFW** – Included by default; filter via `metadata.isNSFW` if needed

---

## Troubleshooting

**"No results" but posts exist:**
- Check time range (e.g., "hour" in a slow subreddit)
- Try "all" time range or switch to "latest" mode
- Verify subreddit name (case-insensitive but must be exact)

**Comments show "Loading..." forever:**
- Open DevTools → Network → Check for 429 (rate limit)
- Reduce `commentLimit` or increase delays
- Reddit may throttle repeated requests; wait 30s and retry

**CSV opens garbled in Excel:**
- Save as UTF-8
- Use "Data → From Text/CSV" import wizard

**HTML view is blank:**
- Ensure format=html in query string
- Check browser console for JS errors

---

## API Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/search` | POST | Main search (all modes) |
| `/api/reddit/comments` | POST | Fetch comments for a specific post |

**Common Query Params:**
- `?format=json` (default), `csv`, `html`
- `?pretty=1` – Pretty-print JSON

---