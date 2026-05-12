# EchoFlow – Database Guide

PostgreSQL 16, auto-initialized from `src/db/init/01_schema.sql` on first run.

---

## Tables

### `posts`
One row per unique post across all platforms.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | Internal auto-increment |
| `reddit_id` | VARCHAR UNIQUE | Platform post ID (works for all platforms despite the column name) |
| `platform` | VARCHAR | `reddit`, `hackernews`, etc. |
| `title` | TEXT | Post title |
| `content` | TEXT | Body or self-text |
| `author` | VARCHAR | Username |
| `url` | TEXT | Link to original post |
| `score` | INTEGER | Upvotes / points |
| `comment_count` | INTEGER | |
| `created_at` | TIMESTAMPTZ | Original post timestamp |
| `saved_at` | TIMESTAMPTZ | When EchoFlow saved it |
| `metadata` | JSONB | Platform-specific extras (subreddit, flair, tags, etc.) |

### `comments`
Top-level comments linked to posts.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `post_id` | INTEGER FK → posts | |
| `reddit_id` | VARCHAR UNIQUE | Platform comment ID |
| `author` | VARCHAR | |
| `body` | TEXT | Comment text |
| `score` | INTEGER | |
| `created_at` | TIMESTAMPTZ | |

### `subreddits`
Unique channel/source names seen across all searches.

| Column | Type |
|---|---|
| `id` | SERIAL PK |
| `name` | VARCHAR UNIQUE |
| `created_at` | TIMESTAMPTZ |

### `searches`
One row per search run (only when `persist: true` is sent).

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | Returned as `searchId` |
| `time_range` | VARCHAR | |
| `platforms` | JSONB | Array of platform IDs |
| `subreddits` | JSONB | Array of channels/subreddits |
| `fetch_comments` | BOOLEAN | |
| `comment_limit` | INTEGER | |
| `comment_sort` | VARCHAR | |
| `result_count` | INTEGER | Filled after collection |
| `params` | JSONB | Full request params |
| `created_at` | TIMESTAMPTZ | |

### `search_posts`
Many-to-many join: which posts belong to which search.

| Column | Type |
|---|---|
| `search_id` | INTEGER FK → searches |
| `post_id` | INTEGER FK → posts |

---

## Core Repository Functions

All in `src/db/repositories.ts`:

### `createSearch(payload)` → `number`
Inserts a search run, returns `searchId`.

```ts
const searchId = await createSearch({
  timeRange: 'week',
  platforms: ['reddit', 'hackernews'],
  subreddits: ['programming', 'story'],
  fetchComments: true,
  commentLimit: 5,
  commentSort: 'top',
  params: { mode: 'top', limit: 25 }
});
```

### `upsertPost(post)` → `number`
Insert or update a post by platform ID. Returns internal `postId`.

### `upsertComment(comment, postId)` → `number`
Insert or update a comment. Returns internal `commentId`.

### `linkPostToSearch(searchId, postId)` → `void`
Connects a post to a search run (insert-or-ignore).

### `updateSearchResultCount(searchId, count)` → `void`
Sets the final `result_count` on a search run.

---

## Typical Usage

```ts
const searchId = await createSearch({
  timeRange: 'week',
  platforms: ['reddit', 'hackernews'],
  subreddits: ['typescript'],
  fetchComments: true,
  commentLimit: 5,
  commentSort: 'top',
  params: { mode: 'top', limit: 10 }
});

for (const post of results) {
  const postId = await upsertPost(post);
  await linkPostToSearch(searchId, postId);

  if (Array.isArray(post.comments)) {
    for (const c of post.comments.slice(0, 5)) {
      await upsertComment(c, postId);
    }
  }
}

await updateSearchResultCount(searchId, results.length);
```

---

## Using the UI

The **Save to database** checkbox in the search UI sends `persist: true`. The API returns `searchId` in the response when persist is enabled.

---

## Quick Queries (Adminer or psql)

```sql
-- Recent searches
SELECT id, platforms, result_count, created_at
FROM searches
ORDER BY created_at DESC
LIMIT 10;

-- Posts by platform
SELECT platform, COUNT(*) FROM posts GROUP BY platform;

-- Posts for a specific search
SELECT p.title, p.score, p.platform
FROM posts p
JOIN search_posts sp ON sp.post_id = p.id
WHERE sp.search_id = 1
ORDER BY p.score DESC;

-- Comment count per post
SELECT p.title, COUNT(c.id) AS comments
FROM posts p
LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id
ORDER BY comments DESC
LIMIT 20;
```

---

## Adminer

Access at `http://localhost:8888` after `docker compose up`.

| Field | Value |
|---|---|
| System | PostgreSQL |
| Server | `db` |
| Username | `echoflow` (from `.env` `DB_USER`) |
| Password | value from `.env` `DB_PASSWORD` |
| Database | `echoflow` |

---

## Reset Database

```bash
# Destroys all data and re-runs init SQL
docker compose down -v
docker compose up -d --build
```
