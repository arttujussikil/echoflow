import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { RedditCollector } from '../../collectors/reddit-collector';
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

export const searchRouter = Router();
const redditCollector = new RedditCollector({ maxResults: 100 });

/**
 * POST /api/search
 * Search for content across multiple platforms
 */
searchRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      keyword, platforms, timeRange, subreddits, filters,
      mode = 'search', limit,
      fetchComments = false, commentLimit = 10, commentSort = 'top',
      persist: persistInBody
    } = req.body as any;

    const persist =
      typeof persistInBody === 'boolean'
        ? persistInBody
        : req.query.persist === '1';

    const selectedPlatforms = platforms || ['reddit'];
    const selectedTimeRange = timeRange || 'day';
    const selectedLimit = limit ?? 50;

    if (mode === 'search' && (!keyword || typeof keyword !== 'string')) {
      return res.status(400).json({ error: 'Keyword is required for mode=search' });
    }
    if ((mode === 'latest' || mode === 'top') && (!Array.isArray(subreddits) || subreddits.length === 0)) {
      return res.status(400).json({ error: 'Provide at least one subreddit for mode=latest or mode=top' });
    }

    let allResults: any[] = [];

    // Collect posts from Reddit
    if (selectedPlatforms.includes('reddit')) {
      try {
        if (mode === 'latest') {
          for (const sr of subreddits!) {
            const posts = await redditCollector.fetchLatest(sr, selectedLimit);
            allResults.push(...posts);
          }
        } else if (mode === 'top') {
          for (const sr of subreddits!) {
            const posts = await redditCollector.fetchTop(sr, selectedTimeRange, selectedLimit);
            allResults.push(...posts);
          }
        } else {
          if (Array.isArray(subreddits) && subreddits.length > 0) {
            for (const sr of subreddits) {
              const posts = await redditCollector.search(keyword!, selectedTimeRange, { subreddit: sr });
              allResults.push(...posts);
            }
          } else {
            const posts = await redditCollector.search(keyword!, selectedTimeRange);
            allResults.push(...posts);
          }
        }
      } catch (error: any) {
        const apiError = handleAPIError(error);
        logger.error('Reddit collection failed', { 
          code: apiError.code, 
          message: apiError.message 
        });
        
        return res.status(apiError.statusCode).json({ 
          error: apiError.message,
          code: apiError.code,
          retryAfter: apiError.retryAfter
        });
      }
    }

    // Apply filters
    if (filters?.minEngagement != null) {
      allResults = allResults.filter(p => (p.engagement?.score ?? 0) >= filters.minEngagement!);
    }
    if (filters?.sortBy) {
      allResults = sortResults(allResults, filters.sortBy);
    }

    // Fetch comments if requested
    if (fetchComments && allResults.length > 0 && selectedPlatforms.includes('reddit')) {
      logger.info(`Fetching comments for ${allResults.length} posts (${commentLimit} ${commentSort} per post)`);
      
      allResults = await redditCollector.fetchCommentsForPosts(allResults, {
        limit: commentLimit,
        sort: commentSort,
        delayMs: 1000  // 1 second between requests to respect rate limits
      });
      
      logger.info('Comment fetching complete');
    }

    // Persist only when requested
    let searchId: number | null = null;
    if (persist) {
      searchId = await createSearch({
        timeRange: timeRange || 'day',
        platforms: platforms || ['reddit'],
        subreddits: subreddits || [],
        fetchComments,
        commentLimit,
        commentSort,
        params: { mode, keyword, filters, limit: limit ?? 50 },
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

    // Build meta for HTML
    const meta = {
      mode,
      timeRange: selectedTimeRange,
      subreddits: (subreddits || []).join(', '),
      totalResults: allResults.length,
      fetchComments: fetchComments ? `Yes (${commentLimit} ${commentSort})` : 'No'
    };

    // Choose response format
    const responseFormat =
      (req.query.format as string) ||
      req.body?.responseFormat ||
      (req.headers.accept?.includes('text/csv') ? 'csv' : 'json');

    if (responseFormat === 'csv') {
      const csv = postsToCsv(allResults);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const base = mode === 'latest'
        ? `latest-${(subreddits || []).join('_') || 'reddit'}`
        : `search-${(keyword || 'query').toString().replace(/\s+/g, '_')}`;
      const filename = `${base}-${stamp}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    }

    if (responseFormat === 'html') {
      const title = mode === 'latest'
        ? `Reddit latest: ${((subreddits || []).join(', ') || 'reddit')}`
        : `Reddit search "${keyword}"`;
      const html = postsToHtml(allResults, { title, meta });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    // Pretty JSON when ?pretty=1
    const pretty = req.query.pretty === '1';
    const payload = {
      // include searchId only if persisted
      ...(persist ? { searchId } : {}),
      keyword: keyword ?? null,
      platforms: selectedPlatforms,
      timeRange: selectedTimeRange,
      subreddits: subreddits || [],
      mode,
      limit: selectedLimit,
      fetchComments,
      commentLimit,
      commentSort,
      results: allResults,
      totalResults: allResults.length,
      timestamp: new Date().toISOString()
    };
    
    if (pretty) {
      return res
        .set('Content-Type', 'application/json; charset=utf-8')
        .status(200)
        .send(JSON.stringify(payload, null, 2));
    }
    return res.json(payload);
  } catch (error: any) {
    const apiError = handleAPIError(error);
    logger.error('Search failed', { message: apiError.message });
    return res.status(apiError.statusCode).json({ 
      error: apiError.message,
      code: apiError.code 
    });
  }
});

function sortResults(results: any[], sortBy: string): any[] {
  switch (sortBy) {
    case 'likes': return results.sort((a, b) => b.engagement.likes - a.engagement.likes);
    case 'comments': return results.sort((a, b) => b.engagement.comments - a.engagement.comments);
    case 'recent': return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    default: return results;
  }
}

/**
 * GET /api/search/:id
 * Fetch a specific search result
 */
searchRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    logger.info(`Fetching search results: ${id}`);
    res.json({ id, status: 'not_implemented' });
  } catch (error) {
    logger.error('Fetch search error:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Add rate limit status endpoint
searchRouter.get('/rate-limits', (_req: Request, res: Response) => {
  const status = redditCollector.getRateLimitStatus();
  res.json({
    reddit: {
      remaining: status.remaining,
      resetAt: status.resetAt.toISOString(),
      resetIn: Math.max(0, status.resetAt.getTime() - Date.now())
    }
  });
});