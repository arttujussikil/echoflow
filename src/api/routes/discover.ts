import { Router, Request, Response } from 'express';
import { registry } from '../../collectors';
import { BaseCollector } from '../../collectors/base-collector';
import { Post } from '../../models/post';
import { logger } from '../../utils/logger';
import { handleAPIError } from '../../utils/errors';

export const discoverRouter = Router();

const MAX_KEYWORDS = 5;
const SOURCE_TIMEOUT_MS = 20_000;

interface SourceStatus {
  name: string;
  count: number;
  /** Set when the source failed or was skipped */
  error?: string;
  skipped?: boolean;
}

/**
 * POST /api/discover — the single search box behind the main page.
 *
 * Body:
 *   query      "News, Finland" — comma-separated keywords, each searched separately
 *   sources?   platform IDs to use; default = every source that works without extra setup
 *   timeRange? hour | day | week | month | year | all   (default week)
 *   limit?     max results per source per keyword       (default 15)
 *   feeds?     RSS/Atom URLs whose latest items are included as-is (used by quick-search presets)
 *   apiKeys?   { [platformId]: key } — keys the user pasted in Settings; override env keys
 *
 * Every source runs in parallel and one failing source never fails the request:
 * its error is reported in `sources[id].error` instead.
 */
discoverRouter.post('/', async (req: Request, res: Response) => {
  const {
    query = '',
    sources: requestedSources,
    timeRange = 'week',
    limit = 15,
    feeds = [],
    apiKeys = {},
  } = req.body as {
    query?: string; sources?: string[]; timeRange?: string; limit?: number;
    feeds?: string[]; apiKeys?: Record<string, string>;
  };

  const keywords = String(query)
    .split(',')
    .map(k => k.trim())
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);
  const feedUrls = (Array.isArray(feeds) ? feeds : []).filter(f => typeof f === 'string' && /^https?:\/\//.test(f));

  if (keywords.length === 0 && feedUrls.length === 0) {
    return res.status(400).json({ error: 'Type something to search for' });
  }

  const perSourceLimit = Math.min(Math.max(Number(limit) || 15, 1), 50);
  const keyFor = (id: string) => (typeof apiKeys?.[id] === 'string' ? apiKeys[id].trim() : '');

  // Searchable sources (RSS is handled separately through `feeds`)
  const searchable = registry.getAll().filter(c => c.capabilities.search && c.category !== 'feed');
  const selected: BaseCollector[] = Array.isArray(requestedSources)
    ? searchable.filter(c => requestedSources.includes(c.platformId))
    : searchable.filter(c => c.defaultEnabled && (c.isReady() || keyFor(c.platformId)));

  const status: Record<string, SourceStatus> = {};
  const collected: Post[] = [];
  const tasks: Promise<void>[] = [];

  for (const collector of selected) {
    const id = collector.platformId;
    status[id] = { name: collector.displayName, count: 0 };

    const apiKey = keyFor(id);
    if (!collector.isReady() && !apiKey) {
      status[id] = { ...status[id], skipped: true, error: 'No API key — add one in Settings' };
      continue;
    }

    // Sources run in parallel; a source's keywords run one after another so we
    // don't hit the same API with simultaneous requests (Reddit answers 429).
    tasks.push((async () => {
      for (const keyword of keywords) {
        try {
          const posts = await withTimeout(
            collector.search(keyword, { mode: 'search', timeRange, limit: perSourceLimit, apiKey: apiKey || undefined }),
            SOURCE_TIMEOUT_MS,
            `${collector.displayName} timed out`
          );
          for (const p of posts) collected.push(tag(p, keyword));
          status[id].count += posts.length;
        } catch (err: any) {
          const message = handleAPIError(err).message || err.message;
          logger.warn(`discover: ${id} failed for "${keyword}": ${message}`);
          // Keep the first error; a source often fails the same way for every keyword
          status[id].error ??= message;
        }
      }
    })());
  }

  if (feedUrls.length > 0) {
    const rss = registry.get('rss')!;
    status.rss = { name: 'RSS feeds', count: 0 };
    tasks.push(
      withTimeout(rss.search(null, { mode: 'latest', channels: feedUrls, limit: perSourceLimit }), SOURCE_TIMEOUT_MS, 'RSS feeds timed out')
        .then(posts => {
          for (const p of posts) collected.push(tag(p, null));
          status.rss.count = posts.length;
        })
        .catch(err => { status.rss.error = err.message; })
    );
  }

  await Promise.all(tasks);

  // Some APIs (e.g. Lemmy search) ignore the time range, so enforce it here
  const cutoff = timeRangeCutoff(timeRange);
  const results = dedupe(collected).filter(p => {
    const t = new Date(p.createdAt).getTime();
    return !cutoff || isNaN(t) || t >= cutoff;
  });

  // Report what is actually returned (after de-duplication and the time filter)
  for (const [id, st] of Object.entries(status)) {
    if (!st.skipped) st.count = results.filter(p => p.platform === id).length;
  }
  logger.info(`discover "${keywords.join(', ')}": ${results.length} results from ${Object.keys(status).length} sources`);

  return res.json({
    query: keywords.join(', '),
    keywords,
    timeRange,
    sources: status,
    results,
    totalResults: results.length,
    timestamp: new Date().toISOString(),
  });
});

function timeRangeCutoff(timeRange: string): number | null {
  const seconds: Record<string, number> = { hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
  return seconds[timeRange] ? Date.now() - seconds[timeRange] * 1000 : null;
}

function tag(post: Post, keyword: string | null): Post {
  return { ...post, metadata: { ...post.metadata, ...(keyword ? { keyword } : {}) } };
}

/** Same story found via two keywords or sources → keep one copy. */
function dedupe(posts: Post[]): Post[] {
  const seen = new Map<string, Post>();
  for (const p of posts) {
    const key = (p.url || `${p.platform}:${p.id}`).replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, p);
    } else if (p.metadata?.keyword && existing.metadata?.keyword !== p.metadata.keyword) {
      // Remember that the story matched several keywords
      const kws = new Set([...(existing.metadata?.keywords ?? [existing.metadata?.keyword]), p.metadata.keyword].filter(Boolean));
      existing.metadata = { ...existing.metadata, keywords: [...kws] };
    }
  }
  return [...seen.values()];
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}
