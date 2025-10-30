import { query } from './pool';

export async function upsertSubreddit(name: string): Promise<number> {
  const res = await query(
    `INSERT INTO subreddits(name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name]
  );
  return res.rows[0].id;
}

function toTs(val: any): Date {
  if (!val) return new Date();
  if (typeof val === 'number') return new Date(val * 1000);
  return new Date(val);
}

export async function upsertPost(p: any): Promise<number> {
  const subredditName = p.metadata?.subreddit || p.subreddit || 'unknown';
  const subredditId = await upsertSubreddit(subredditName);
  const redditId = p.id || p.reddit_id;
  const created = p.created_utc || p.metadata?.created || p.created || Date.now() / 1000;

  const res = await query(
    `INSERT INTO posts (reddit_id, subreddit_id, title, author, url, permalink, selftext, created_utc, score, num_comments, over_18, flair)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (reddit_id) DO UPDATE SET
       subreddit_id = EXCLUDED.subreddit_id,
       title = EXCLUDED.title,
       author = EXCLUDED.author,
       url = EXCLUDED.url,
       permalink = EXCLUDED.permalink,
       selftext = EXCLUDED.selftext,
       score = GREATEST(posts.score, EXCLUDED.score),
       num_comments = GREATEST(posts.num_comments, EXCLUDED.num_comments),
       over_18 = EXCLUDED.over_18,
       flair = EXCLUDED.flair
     RETURNING id`,
    [
      redditId,
      subredditId,
      p.title || '',
      p.author || p.metadata?.author || null,
      p.url || null,
      p.permalink || null,
      p.selftext || p.content || null,
      toTs(created),
      p.score || p.engagement?.score || 0,
      p.num_comments || p.engagement?.comments || 0,
      !!(p.over_18 || p.nsfw),
      p.link_flair_text || null,
    ]
  );
  return res.rows[0].id;
}

export async function upsertComment(c: any, postId: number): Promise<number> {
  const redditId = c.id || c.reddit_id;
  const created = c.created_utc || c.created || Date.now() / 1000;

  const res = await query(
    `INSERT INTO comments (reddit_id, post_id, author, body, score, created_utc, parent_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (reddit_id) DO UPDATE SET
       post_id = EXCLUDED.post_id,
       author = EXCLUDED.author,
       body = EXCLUDED.body,
       score = GREATEST(comments.score, EXCLUDED.score),
       created_utc = EXCLUDED.created_utc,
       parent_id = EXCLUDED.parent_id
     RETURNING id`,
    [
      redditId,
      postId,
      c.author || null,
      c.body || c.text || null,
      c.score || 0,
      toTs(created),
      c.parent_id || null,
    ]
  );
  return res.rows[0].id;
}

export async function createSearch(payload: any): Promise<number> {
  const {
    timeRange,
    platforms,
    subreddits,
    fetchComments = false,
    commentLimit = 0,
    commentSort = 'top',
    params = {},
  } = payload;

  const res = await query(
    `INSERT INTO searches (time_range, platforms, subreddits, params, fetch_comments, comment_limit, comment_sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [timeRange || null, platforms || [], subreddits || [], params, fetchComments, commentLimit, commentSort]
  );
  return res.rows[0].id;
}

export async function updateSearchResultCount(searchId: number, count: number): Promise<void> {
  await query(`UPDATE searches SET result_count = $2 WHERE id = $1`, [searchId, count]);
}

export async function linkPostToSearch(searchId: number, postId: number): Promise<void> {
  await query(
    `INSERT INTO search_posts (search_id, post_id)
     VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [searchId, postId]
  );
}

export async function saveTrends(searchId: number, trends: any[] = []): Promise<void> {
  if (!trends.length) return;
  const values: any[] = [];
  const params: string[] = [];
  trends.forEach((t, i) => {
    params.push(`($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`);
    values.push(searchId, t.word, t.count || 0, t.tier || null);
  });
  await query(
    `INSERT INTO trends (search_id, word, count, tier) VALUES ${params.join(',')}`,
    values
  );
}