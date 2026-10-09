import axios from 'axios';
import { BaseCollector, CollectorCapabilities, CollectorConfig, SearchOptions } from './base-collector';
import { Post } from '../models/post';
import { logger } from '../utils/logger';

const INSTANCES = ['lemmy.world', 'lemmy.ml', 'beehaw.org'];
const LEMMY_TOP_SORT: Record<string, string> = {
  hour: 'TopHour', day: 'TopDay', week: 'TopWeek', month: 'TopMonth', year: 'TopYear', all: 'TopAll',
};

export class LemmyCollector extends BaseCollector {
  readonly platformId = 'lemmy';
  readonly displayName = 'Lemmy';
  readonly description = 'Federated Reddit alternative. No key needed.';
  readonly capabilities: CollectorCapabilities = {
    search: true, latest: true, top: true, comments: false, requiresAuth: false,
  };

  constructor(config?: CollectorConfig) { super(config); }

  async search(keyword: string | null, options: SearchOptions = {}): Promise<Post[]> {
    const { mode = 'search', limit = 25, timeRange = 'day' } = options;
    const q = keyword?.trim();

    if ((mode === 'latest' || mode === 'top') && !q) {
      return this.fetchTop(INSTANCES[0], limit, timeRange);
    }
    if (!q) return [];
    return this.searchPosts(q, limit, timeRange);
  }

  private async searchPosts(q: string, limit: number, timeRange: string): Promise<Post[]> {
    for (const instance of INSTANCES) {
      logger.info(`Lemmy search "${q}" on ${instance} [${timeRange}]`);
      try {
        const { data } = await axios.get(`https://${instance}/api/v3/search`, {
          params: {
            q,
            type_: 'Posts',
            sort: LEMMY_TOP_SORT[timeRange] ?? 'TopWeek',
            listing_type: 'All',
            limit: Math.min(limit, 50),
          },
          timeout: 12_000,
        });
        const posts = this.transform(data.posts ?? [], instance);
        if (posts.length > 0) return posts;
      } catch (err: any) {
        logger.warn(`Lemmy ${instance} failed: ${err.message}`);
      }
    }
    return [];
  }

  private async fetchTop(instance: string, limit: number, timeRange: string): Promise<Post[]> {
    logger.info(`Lemmy top on ${instance} [${timeRange}]`);
    try {
      const { data } = await axios.get(`https://${instance}/api/v3/post/list`, {
        params: { sort: LEMMY_TOP_SORT[timeRange] ?? 'TopDay', listing_type: 'All', limit: Math.min(limit, 50) },
        timeout: 12_000,
      });
      return this.transform(data.posts ?? [], instance);
    } catch (err: any) {
      logger.error('Lemmy top failed', { message: err.message });
      return [];
    }
  }

  private transform(items: any[], instance: string): Post[] {
    return items
      .filter(i => i?.post?.name && i?.post?.ap_id)
      .map(i => {
        const p = i.post;
        const counts = i.counts ?? {};
        return {
          id: String(p.id),
          platform: 'lemmy' as const,
          title: p.name,
          content: p.body || p.name,
          author: i.creator?.name ?? 'unknown',
          url: p.ap_id,
          createdAt: new Date(p.published ?? Date.now()),
          engagement: {
            likes: counts.upvotes ?? counts.score ?? 0,
            comments: counts.comments ?? 0,
            shares: 0,
            score: counts.score ?? counts.upvotes ?? 0,
          },
          metadata: { community: i.community?.name, instance },
        };
      });
  }
}
