import axios from 'axios';
import { BaseCollector, CollectorConfig, CollectorCapabilities, SearchOptions, CommentOptions } from './base-collector';
import { Post, Comment } from '../models/post';
import { logger } from '../utils/logger';
import { handleAPIError } from '../utils/errors';

interface HNHit {
  objectID: string;
  title?: string;
  story_title?: string;   // present on Ask HN items
  url?: string;
  author: string;
  points: number;
  num_comments: number;
  created_at: string;
  story_text?: string;
  _tags: string[];
}

interface HNSearchResponse {
  hits: HNHit[];
  nbHits: number;
}

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  author: string;
  points: number;
  created_at: string;
  text?: string;
  children?: HNItemChild[];
}

interface HNItemChild {
  id: number;
  author: string;
  text?: string;
  points: number;
  created_at: string;
  type: string;
}

export class HackerNewsCollector extends BaseCollector {
  readonly platformId = 'hackernews';
  readonly displayName = 'Hacker News';
  readonly capabilities: CollectorCapabilities = {
    search: true,
    latest: true,
    top: true,
    comments: true,
    requiresAuth: false,
  };

  private readonly baseUrl = 'https://hn.algolia.com/api/v1';

  constructor(config?: CollectorConfig) {
    super(config);
  }

  /**
   * Unified entry point.
   * channels = HN tags to filter by (e.g. 'story', 'ask_hn', 'show_hn').
   * Defaults to 'story' if no channels provided.
   */
  async search(keyword: string | null, options: SearchOptions = {}): Promise<Post[]> {
    const { mode = 'search', timeRange = 'day', channels = [], limit } = options;
    const effectiveLimit = limit ?? this.config.maxResults;
    const tags = this.buildTagFilter(channels);

    try {
      if (mode === 'latest') {
        return await this._fetchLatest(tags, effectiveLimit);
      } else if (mode === 'top') {
        return await this._fetchTop(tags, timeRange, effectiveLimit);
      } else {
        if (!keyword) throw new Error('keyword is required for search mode');
        return await this._search(keyword, tags, timeRange, effectiveLimit);
      }
    } catch (error: any) {
      const apiError = handleAPIError(error);
      logger.error('HackerNews collection failed', { mode, code: apiError.code, message: apiError.message });
      throw apiError;
    }
  }

  async fetchCommentsForPosts(posts: Post[], opts: CommentOptions = {}): Promise<Post[]> {
    const delay = opts.delayMs ?? 500;
    const out: Post[] = [];

    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      const comments = await this._fetchComments(p.id, opts.limit ?? 5);
      out.push({ ...p, comments });
      if (i < posts.length - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
    return out;
  }

  // ── Private implementation ──────────────────────────────────────────────────

  private async _search(
    keyword: string,
    tags: string,
    timeRange: string,
    limit: number
  ): Promise<Post[]> {
    const numericFilter = this.buildNumericFilter(timeRange);
    logger.info(`HN search "${keyword}" [${timeRange}]`);

    const response = await axios.get<HNSearchResponse>(`${this.baseUrl}/search`, {
      params: {
        query: keyword,
        tags,
        hitsPerPage: Math.min(limit, 100),
        ...(numericFilter ? { numericFilters: numericFilter } : {})
      },
      timeout: this.config.timeout
    });

    return this.validatePosts(this.transformHits(response.data.hits));
  }

  private async _fetchLatest(tags: string, limit: number): Promise<Post[]> {
    logger.info(`HN latest [tags: ${tags}]`);

    const response = await axios.get<HNSearchResponse>(`${this.baseUrl}/search_by_date`, {
      params: { tags, hitsPerPage: Math.min(limit, 100) },
      timeout: this.config.timeout
    });

    return this.validatePosts(this.transformHits(response.data.hits));
  }

  private async _fetchTop(tags: string, timeRange: string, limit: number): Promise<Post[]> {
    const numericFilter = this.buildNumericFilter(timeRange);
    logger.info(`HN top [${timeRange}]`);

    const response = await axios.get<HNSearchResponse>(`${this.baseUrl}/search`, {
      params: {
        tags,
        hitsPerPage: Math.min(limit, 100),
        ...(numericFilter ? { numericFilters: numericFilter } : {})
      },
      timeout: this.config.timeout
    });

    return this.validatePosts(this.transformHits(response.data.hits));
  }

  private async _fetchComments(storyId: string, limit: number): Promise<Comment[]> {
    try {
      const response = await axios.get<HNItem>(`${this.baseUrl}/items/${storyId}`, {
        timeout: this.config.timeout
      });

      const children = response.data.children ?? [];
      return children
        .filter(c => c.type === 'comment' && c.text && c.author)
        .slice(0, limit)
        .map(c => ({
          id: String(c.id),
          author: c.author,
          body: this.stripHtml(c.text ?? ''),
          score: c.points ?? 0,
          createdAt: new Date(c.created_at)
        }));
    } catch {
      return [];
    }
  }

  private transformHits(hits: HNHit[]): Post[] {
    return hits.map(hit => {
      const title = hit.title ?? hit.story_title ?? '(untitled)';
      return {
        id: hit.objectID,
        platform: 'hackernews' as const,
        title,
        content: hit.story_text ? this.stripHtml(hit.story_text) : title,
        author: hit.author,
        url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
        createdAt: new Date(hit.created_at),
        engagement: {
          likes: hit.points ?? 0,
          comments: hit.num_comments ?? 0,
          shares: 0,
          score: hit.points ?? 0
        },
        metadata: {
          tags: hit._tags
        }
      };
    });
  }

  /** Map channel names to Algolia tag filter string. Defaults to 'story'. */
  private buildTagFilter(channels: string[]): string {
    const validTags = ['story', 'ask_hn', 'show_hn', 'job'];
    const filtered = channels.filter(c => validTags.includes(c));
    return filtered.length > 0 ? filtered.join(',') : 'story';
  }

  /** Build Algolia numericFilters to restrict to a time range. */
  private buildNumericFilter(timeRange: string): string | null {
    const seconds = this.getTimeRangeInSeconds(timeRange);
    if (!seconds) return null;
    const since = Math.floor(Date.now() / 1000) - seconds;
    return `created_at_i>${since}`;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
