# EchoFlow DB – Quick Guide

What this does
- Saves Reddit searches, posts, and comments to PostgreSQL.
- Lets you link each search run to the posts it returned.

Files
- pool.ts: Creates a pg Pool and exports query().
- repositories.ts: Simple functions to save/relate data.
- init/01_schema.sql: Tables and indexes (auto-runs on a fresh DB volume).

Main tables
- subreddits: unique subreddit names.
- posts: posts with title, author, score, etc.
- comments: comments linked to posts.
- searches: one row per “search run” (with parameters).
- search_posts: links searches <-> posts.

Core functions (repositories.ts)
- createSearch(payload): number
  - Inserts a search run. Returns searchId.
- upsertPost(post): number
  - Inserts/updates a post by reddit_id. Returns postId.
- upsertComment(comment, postId): number
  - Inserts/updates a comment by reddit_id.
- linkPostToSearch(searchId, postId): void
  - Connects a post to a search run.
- updateSearchResultCount(searchId, count): void
  - Stores how many results the search produced.

Typical usage
```ts
const searchId = await createSearch({
  timeRange: 'week',
  platforms: ['reddit'],
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

From the UI
- The “Save results to database” checkbox sends persist: true in the POST body.
- The API only saves when persist is true and returns searchId.

Verify quickly (Adminer or psql)
```sql
SELECT id, result_count FROM searches ORDER BY created_at DESC LIMIT 5;
SELECT COUNT(*) FROM posts;
SELECT COUNT(*) FROM comments;
SELECT COUNT(*) FROM search_posts;
```

Reset DB (re-run init scripts)
- docker compose down -v
- docker compose up -d --build