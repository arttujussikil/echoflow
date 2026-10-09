import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { registry } from '../../collectors';
import { postsToCsv } from '../../exporters/csv-formatter';
import { postsToHtml } from '../../exporters/html-formatter';
import { handleAPIError } from '../../utils/errors';
import {
  upsertPost,
  upsertComment,
  createSearch,
  updateSearchResultCount,
  linkPostToSearch,
} from '../../db/repositories';
import { Post } from '../../models/post';

export const searchRouter = Router();

/**
 * POST /api/search
 * Body: { keyword, platforms, timeRange, channels, filters, mode, limit,
 *         fetchComments, commentLimit, commentSort, persist }
 *
 * platforms: array of platform IDs registered in the collector registry
 *            e.g. ["reddit"], ["hackernews"], ["reddit","hackernews"]
 * channels:  platform-agnostic list — subreddits for Reddit, tags for HN, etc.
 */
searchRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      keyword,
      platforms: requestedPlatforms,
      timeRange,
      channels,
      // Legacy alias: subreddits → channels (Reddit-only callers still work)
      subreddits,
      filters,
      mode = 'search',
      limit,
      fetchComments = false,
      commentLimit = 10,
      commentSort = 'top',
      persist: persistInBody
    } = req.body as any;

    const persist =
      typeof persistInBody === 'boolean' ? persistInBody : req.query.persist === '1';

    const selectedPlatforms: string[] = requestedPlatforms || ['reddit'];
    const selectedTimeRange: string = timeRange || 'day';
    const selectedLimit: number = limit ?? 50;
    // channels takes precedence; subreddits is the legacy alias
    const selectedChannels: string[] = channels ?? subreddits ?? [];

    // ── Validation ────────────────────────────────────────────────────────────
    if (mode === 'search' && (!keyword || typeof keyword !== 'string')) {
      return res.status(400).json({ error: 'keyword is required for mode=search' });
    }
    if (mode !== 'search' && selectedChannels.length === 0) {
      // latest/top without channels is valid — collectors fall back to their default feed
    }

    const unsupported = selectedPlatforms.filter(p => !registry.isSupported(p));
    if (unsupported.length > 0) {
      return res.status(400).json({
        error: `Unknown platform(s): ${unsupported.join(', ')}`,
        supported: registry.getSupportedPlatforms().map(p => p.id)
      });
    }

    // ── Collection ────────────────────────────────────────────────────────────
    let allResults: Post[] = [];
    const platformErrors: Record<string, string> = {};

    for (const platformId of selectedPlatforms) {
      const collector = registry.get(platformId)!;

      // Skip if the collector doesn't support the requested mode
      if (mode === 'latest' && !collector.capabilities.latest) {
        logger.warn(`${platformId} does not support mode=latest, skipping`);
        continue;
      }
      if (mode === 'top' && !collector.capabilities.top) {
        logger.warn(`${platformId} does not support mode=top, skipping`);
        continue;
      }
      if (mode === 'search' && !collector.capabilities.search) {
        logger.warn(`${platformId} does not support mode=search, skipping`);
        continue;
      }

      try {
        const posts = await collector.search(keyword ?? null, {
          mode,
          timeRange: selectedTimeRange,
          channels: selectedChannels,
          limit: selectedLimit,
        });
        allResults.push(...posts);
      } catch (error: any) {
        const apiError = handleAPIError(error);
        logger.error(`${platformId} collection failed`, {
          code: apiError.code,
          message: apiError.message
        });
        platformErrors[platformId] = apiError.message;
      }
    }

    // Fail only if every requested platform errored out
    if (Object.keys(platformErrors).length === selectedPlatforms.length) {
      const first = Object.values(platformErrors)[0];
      return res.status(502).json({ error: first, platformErrors });
    }

    // ── Filters ───────────────────────────────────────────────────────────────
    if (filters?.minEngagement != null) {
      allResults = allResults.filter(p => (p.engagement?.score ?? 0) >= filters.minEngagement);
    }
    if (filters?.sortBy) {
      allResults = sortResults(allResults, filters.sortBy);
    }

    // ── Comment fetching ──────────────────────────────────────────────────────
    if (fetchComments && allResults.length > 0) {
      for (const platformId of selectedPlatforms) {
        const collector = registry.get(platformId);
        if (!collector?.capabilities.comments || !collector.fetchCommentsForPosts) continue;

        const platformPosts = allResults.filter(p => p.platform === platformId);
        if (platformPosts.length === 0) continue;

        logger.info(`Fetching comments for ${platformPosts.length} ${platformId} posts`);
        try {
          const withComments = await collector.fetchCommentsForPosts(platformPosts, {
            limit: commentLimit,
            sort: commentSort,
            delayMs: 1000,
          });

          // Splice the enriched posts back in
          const enrichedIds = new Set(withComments.map(p => p.id));
          allResults = [
            ...allResults.filter(p => p.platform !== platformId || !enrichedIds.has(p.id)),
            ...withComments,
          ];
        } catch (error: any) {
          logger.error(`Comment fetching failed for ${platformId}`, { message: error?.message });
        }
      }
    }

    // ── Persistence ───────────────────────────────────────────────────────────
    let searchId: number | null = null;
    if (persist) {
      searchId = await createSearch({
        timeRange: selectedTimeRange,
        platforms: selectedPlatforms,
        subreddits: selectedChannels,
        fetchComments,
        commentLimit,
        commentSort,
        params: { mode, keyword, filters, limit: selectedLimit },
      });

      for (const post of allResults) {
        const postId = await upsertPost(post);
        await linkPostToSearch(searchId!, postId);
        if (fetchComments && Array.isArray(post.comments)) {
          for (const c of post.comments.slice(0, commentLimit)) {
            await upsertComment(c, postId);
          }
        }
      }
      await updateSearchResultCount(searchId!, allResults.length);
    }

    // ── Response ──────────────────────────────────────────────────────────────
    const responseFormat =
      (req.query.format as string) ||
      req.body?.responseFormat ||
      (req.headers.accept?.includes('text/csv') ? 'csv' : 'json');

    if (responseFormat === 'csv') {
      const csv = postsToCsv(allResults);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const base = mode === 'latest'
        ? `latest-${selectedChannels.join('_') || selectedPlatforms.join('_')}`
        : `search-${(keyword || 'query').replace(/\s+/g, '_')}`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}-${stamp}.csv"`);
      return res.status(200).send(csv);
    }

    if (responseFormat === 'html') {
      const title = mode === 'latest'
        ? `Latest: ${selectedChannels.join(', ') || selectedPlatforms.join(', ')}`
        : `Search "${keyword}"`;
      const html = postsToHtml(allResults, {
        title,
        meta: {
          mode,
          timeRange: selectedTimeRange,
          platforms: selectedPlatforms.join(', '),
          channels: selectedChannels.join(', '),
          totalResults: allResults.length,
          fetchComments: fetchComments ? `Yes (${commentLimit} ${commentSort})` : 'No'
        }
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    const payload = {
      ...(persist ? { searchId } : {}),
      ...(Object.keys(platformErrors).length > 0 ? { platformErrors } : {}),
      keyword: keyword ?? null,
      platforms: selectedPlatforms,
      timeRange: selectedTimeRange,
      channels: selectedChannels,
      mode,
      limit: selectedLimit,
      fetchComments,
      commentLimit,
      commentSort,
      results: allResults,
      totalResults: allResults.length,
      timestamp: new Date().toISOString()
    };

    if (req.query.pretty === '1') {
      return res
        .set('Content-Type', 'application/json; charset=utf-8')
        .status(200)
        .send(JSON.stringify(payload, null, 2));
    }
    return res.json(payload);

  } catch (error: any) {
    const apiError = handleAPIError(error);
    logger.error('Search failed', { message: apiError.message });
    return res.status(apiError.statusCode).json({ error: apiError.message, code: apiError.code });
  }
});

function sortResults(results: Post[], sortBy: string): Post[] {
  switch (sortBy) {
    case 'likes':    return results.sort((a, b) => b.engagement.likes - a.engagement.likes);
    case 'comments': return results.sort((a, b) => b.engagement.comments - a.engagement.comments);
    case 'recent':   return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    default:         return results;
  }
}

/** GET /api/search/rate-limits — per-platform rate limit status */
searchRouter.get('/rate-limits', (_req: Request, res: Response) => {
  const status: Record<string, any> = {};

  for (const collector of registry.getAll()) {
    // Only collectors that expose getRateLimitStatus contribute
    const c = collector as any;
    if (typeof c.getRateLimitStatus === 'function') {
      const s = c.getRateLimitStatus();
      status[collector.platformId] = {
        remaining: s.remaining,
        resetAt: s.resetAt instanceof Date ? s.resetAt.toISOString() : s.resetAt,
        resetIn: Math.max(0, new Date(s.resetAt).getTime() - Date.now())
      };
    }
  }

  res.json(status);
});
