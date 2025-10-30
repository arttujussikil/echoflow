import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { RedditCollector } from '../../collectors/reddit-collector';

export const redditRouter = Router();
const redditCollector = new RedditCollector({ maxResults: 50 });

/**
 * POST /api/reddit/comments
 * Body: { id?: string; subreddit?: string; url?: string; limit?: number; sort?: 'top'|'best'|'new' }
 */
redditRouter.post('/comments', async (req: Request, res: Response) => {
  try {
    let { id, subreddit, url, limit = 5, sort = 'top' } = req.body as {
      id?: string; subreddit?: string; url?: string; limit?: number; sort?: 'top'|'best'|'new';
    };

    // Derive from URL if provided
    if ((!id || !subreddit) && url) {
      const m = url.match(/\/r\/([^/]+)\/comments\/([^/]+)/);
      if (m) {
        subreddit = subreddit || m[1];
        id = id || m[2];
      }
    }

    if (!id || !subreddit) {
      return res.status(400).json({ error: 'Provide subreddit and id or full post URL' });
    }

    const comments = await redditCollector.fetchCommentsBy(subreddit, id, { limit, sort });
    return res.json({ subreddit, id, count: comments.length, comments });
  } catch (error: any) {
    logger.error('Comments endpoint failed', { message: error?.message });
    return res.status(500).json({ error: 'Failed to fetch comments' });
  }
});