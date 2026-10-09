import { Router, Request, Response } from 'express';
import { registry } from '../../collectors';
import { extractRecommendations } from '../../services/ai-service';
import { logger } from '../../utils/logger';
import { Post } from '../../models/post';

export const recsRouter = Router();

/**
 * POST /api/recs
 * Body: { query, platforms?, limit?, timeRange? }
 *
 * Reddit: uses RSS search feeds (JSON search API returns 403 server-side).
 * HackerNews: uses Algolia search API normally.
 */
recsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      query,
      platforms = ['reddit', 'hackernews'],
      limit = 15,
      timeRange = 'year',
    } = req.body as any;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'query is required' });
    }

    const q = query.trim();
    const searchVariants = [`best ${q}`, `${q} recommendations`, `recommend ${q}`];
    const selectedPlatforms: string[] = (platforms as string[]).filter(
      p => p === 'reddit' || p === 'hackernews'
    );

    if (selectedPlatforms.length === 0) {
      return res.status(400).json({ error: 'Select Reddit or HackerNews (or both)' });
    }

    const seenIds = new Set<string>();
    const allPosts: Post[] = [];

    const addPosts = (posts: Post[]) => {
      for (const post of posts) {
        if (!seenIds.has(post.id)) {
          seenIds.add(post.id);
          allPosts.push(post);
        }
      }
    };

    const tasks: Promise<void>[] = [];

    // ── Reddit via RSS search (JSON API returns 403 server-side) ─────────────
    if (selectedPlatforms.includes('reddit')) {
      const rssCollector = registry.get('rss');
      if (rssCollector) {
        const redditUrls = searchVariants.map(v =>
          `https://www.reddit.com/search.rss?q=${encodeURIComponent(v)}&sort=top&t=${timeRange}&limit=${limit}`
        );
        tasks.push(
          rssCollector.search(null, { mode: 'latest', channels: redditUrls, limit: limit * searchVariants.length })
            .then(posts => {
              // Tag these as reddit so the frontend shows the right label
              addPosts(posts.map(p => ({ ...p, platform: 'reddit' as const })));
            })
            .catch((err: any) => {
              logger.warn(`Reddit RSS recs search failed: ${err.message}`);
            })
        );
      }
    }

    // ── HackerNews via Algolia search ─────────────────────────────────────────
    // Use 'all' time range for recs — older recommendation threads are still valuable.
    // Include ask_hn so "Ask HN: What X do you recommend?" threads are included.
    if (selectedPlatforms.includes('hackernews')) {
      const hnCollector = registry.get('hackernews');
      if (hnCollector?.capabilities.search) {
        for (const variant of searchVariants) {
          tasks.push(
            hnCollector.search(variant, {
              mode: 'search',
              timeRange: 'all',
              channels: ['story', 'ask_hn'],
              limit,
            })
              .then(posts => addPosts(posts))
              .catch((err: any) => {
                logger.warn(`HN recs search failed ["${variant}"]: ${err.message}`);
              })
          );
        }
      }
    }

    await Promise.all(tasks);

    if (allPosts.length === 0) {
      return res.json({
        query: q, recommendations: [], postCount: 0,
        analyzedAt: new Date().toISOString(),
      });
    }

    // Sort by engagement, take top 20 for AI
    allPosts.sort((a, b) => (b.engagement?.score ?? 0) - (a.engagement?.score ?? 0));
    let topPosts = allPosts.slice(0, 20);

    // ── Fetch comments for HN posts (Reddit via RSS has no comments) ──────────
    const hnCollector = registry.get('hackernews');
    if (hnCollector?.capabilities.comments && hnCollector.fetchCommentsForPosts) {
      const hnPosts = topPosts.filter(p => p.platform === 'hackernews');
      if (hnPosts.length > 0) {
        try {
          const withComments = await hnCollector.fetchCommentsForPosts(hnPosts, {
            limit: 3, sort: 'top', delayMs: 200,
          });
          const enrichedMap = new Map(withComments.map(p => [p.id, p]));
          topPosts = topPosts.map(p => enrichedMap.get(p.id) ?? p);
        } catch (err: any) {
          logger.warn(`HN comment fetch failed for recs: ${err.message}`);
        }
      }
    }

    // ── AI extraction ─────────────────────────────────────────────────────────
    const result = await extractRecommendations(topPosts, q);

    const sources = topPosts.slice(0, 8).map(p => ({
      title: p.title,
      url: p.url,
      platform: p.platform,
      score: p.engagement?.score ?? 0,
    }));

    return res.json({ ...result, sources });

  } catch (error: any) {
    logger.error('Recs endpoint failed', { message: error.message });
    return res.status(500).json({ error: error.message });
  }
});
