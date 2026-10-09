import axios from 'axios';
import { BaseCollector, CollectorCapabilities, CollectorConfig, SearchOptions } from './base-collector';
import { Post } from '../models/post';
import { logger } from '../utils/logger';

export class BlueskyCollector extends BaseCollector {
  readonly platformId = 'bluesky';
  readonly displayName = 'Bluesky';
  readonly capabilities: CollectorCapabilities = {
    search: true, latest: false, top: false, comments: false, requiresAuth: false,
  };

  readonly description = 'Public Bluesky posts. No key needed.';
  // public.api.bsky.app returns 403 for searchPosts; api.bsky.app serves it unauthenticated
  private readonly base = 'https://api.bsky.app/xrpc';

  constructor(config?: CollectorConfig) { super(config); }

  async search(keyword: string | null, options: SearchOptions = {}): Promise<Post[]> {
    const { limit = 25, timeRange = 'day' } = options;
    const q = keyword?.trim();
    if (!q) return [];
    return this.searchPosts(q, limit, timeRange);
  }

  private async searchPosts(q: string, limit: number, timeRange: string): Promise<Post[]> {
    logger.info(`Bluesky search "${q}" [${timeRange}]`);
    try {
      const since = this.isoSince(timeRange);
      const { data } = await axios.get(`${this.base}/app.bsky.feed.searchPosts`, {
        params: { q, sort: 'top', limit: Math.min(limit, 100), ...(since ? { since } : {}) },
        timeout: 15_000,
      });
      return this.transform(data.posts ?? []);
    } catch (err: any) {
      logger.error('Bluesky search failed', { q, message: err.message });
      throw err;
    }
  }

  private transform(posts: any[]): Post[] {
    return posts
      .filter(p => p?.record?.text && p?.uri)
      .map(p => {
        const rec  = p.record;
        const auth = p.author ?? {};
        const id   = p.uri.split('/').pop() ?? p.uri;
        return {
          id,
          platform: 'bluesky' as const,
          title: rec.text.split('\n')[0].slice(0, 200) || 'Bluesky post',
          content: rec.text,
          author: auth.handle ?? auth.did ?? 'unknown',
          url: `https://bsky.app/profile/${auth.handle}/post/${id}`,
          createdAt: new Date(rec.createdAt ?? Date.now()),
          engagement: {
            likes: p.likeCount ?? 0,
            comments: p.replyCount ?? 0,
            shares: p.repostCount ?? 0,
            score: (p.likeCount ?? 0) + (p.repostCount ?? 0),
          },
          metadata: { did: auth.did },
        };
      });
  }

  private isoSince(timeRange: string): string | null {
    const seconds = this.getTimeRangeInSeconds(timeRange);
    if (!seconds) return null;
    return new Date(Date.now() - seconds * 1000).toISOString();
  }
}
