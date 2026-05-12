import axios from 'axios';
import { BaseCollector, CollectorConfig, CollectorCapabilities, SearchOptions, CommentOptions } from './base-collector';
import { Post, Comment } from '../models/post';
import { logger } from '../utils/logger';
import { handleAPIError } from '../utils/errors';

interface RedditResponse {
  data: {
    children: RedditPost[];
    after?: string;
  };
}

interface RedditPost {
  kind: string;
  data: {
    id: string;
    title: string;
    selftext?: string;
    author: string;
    permalink: string;
    url: string;
    created_utc: number;
    ups: number;
    score: number;
    num_comments: number;
    subreddit: string;
    link_flair_text?: string;
    over_18: boolean;
  };
}

interface RedditCommentItem {
  kind: string;
  data: {
    id: string;
    author: string;
    body: string;
    score: number;
    created_utc: number;
  };
}

export class RedditCollector extends BaseCollector {
  readonly platformId = 'reddit';
  readonly displayName = 'Reddit';
  readonly capabilities: CollectorCapabilities = {
    search: true,
    latest: true,
    top: true,
    comments: true,
    requiresAuth: false,
  };

  private readonly baseUrl = 'https://www.reddit.com';
  private readonly userAgent = 'EchoFlow/1.0';
  private rateLimitRemaining: number = 60;
  private rateLimitReset: number = Date.now() + 60000;

  constructor(config?: CollectorConfig) {
    super(config);
  }

  /**
   * Unified entry point. Routes to the appropriate internal method based on mode.
   * channels = subreddits for Reddit.
   */
  async search(keyword: string | null, options: SearchOptions = {}): Promise<Post[]> {
    const { mode = 'search', timeRange = 'day', channels = [], limit } = options;
    const effectiveLimit = limit ?? this.config.maxResults;
    const results: Post[] = [];

    if (mode === 'latest') {
      const targets = channels.length > 0 ? channels : ['all'];
      for (const sr of targets) {
        const posts = await this._fetchLatest(sr, effectiveLimit);
        results.push(...posts);
      }
    } else if (mode === 'top') {
      const targets = channels.length > 0 ? channels : ['all'];
      for (const sr of targets) {
        const posts = await this._fetchTop(sr, timeRange, effectiveLimit);
        results.push(...posts);
      }
    } else {
      if (!keyword) throw new Error('keyword is required for search mode');
      if (channels.length > 0) {
        for (const sr of channels) {
          const posts = await this._search(keyword, timeRange, sr);
          results.push(...posts);
        }
      } else {
        const posts = await this._search(keyword, timeRange);
        results.push(...posts);
      }
    }

    return results;
  }

  async fetchCommentsForPosts(posts: Post[], opts: CommentOptions = {}): Promise<Post[]> {
    const delay = opts.delayMs ?? 1200;
    const out: Post[] = [];

    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      const comments = await this.fetchComments(p, { limit: opts.limit, sort: opts.sort as any });
      out.push({ ...p, comments });
      if (i < posts.length - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
    return out;
  }

  // ── Public Reddit-specific helpers (used by /api/reddit route) ──────────────

  async fetchCommentsBy(
    subreddit: string,
    postId: string,
    opts?: { limit?: number; sort?: 'top' | 'best' | 'new' }
  ): Promise<Comment[]> {
    await this.checkRateLimit();

    const limit = opts?.limit ?? 5;
    const sort = this.mapCommentSort(opts?.sort ?? 'top');
    try {
      const url = `${this.baseUrl}/r/${subreddit}/comments/${postId}.json`;
      const resp = await axios.get(url, {
        params: { limit, sort, raw_json: 1, depth: 1 },
        headers: { 'User-Agent': this.userAgent },
        timeout: this.config.timeout
      });

      this.updateRateLimits(resp.headers);
      const commentsData = Array.isArray(resp.data) ? resp.data[1] : undefined;
      const children: RedditCommentItem[] = commentsData?.data?.children ?? [];
      return this.transformRedditComments(children, limit);
    } catch (error: any) {
      const apiError = handleAPIError(error);
      logger.error('fetchCommentsBy failed', {
        subreddit,
        postId,
        code: apiError.code,
        status: apiError.statusCode,
        message: apiError.message
      });
      throw apiError;
    }
  }

  async fetchComments(
    post: Post,
    opts?: { limit?: number; sort?: 'top' | 'best' | 'new' }
  ): Promise<Comment[]> {
    let subreddit = post.metadata?.subreddit;
    let postId = post.id;

    if (!subreddit || !postId) {
      const m = post.url?.match(/\/r\/([^/]+)\/comments\/([^/]+)/);
      if (m) {
        subreddit = subreddit || m[1];
        postId = postId || m[2];
      }
    }
    if (!subreddit || !postId) {
      logger.warn('Missing subreddit or postId for comments', { url: post.url, id: post.id });
      return [];
    }
    return this.fetchCommentsBy(subreddit, postId, opts);
  }

  getRateLimitStatus(): { remaining: number; resetAt: Date } {
    return {
      remaining: Math.floor(this.rateLimitRemaining),
      resetAt: new Date(this.rateLimitReset)
    };
  }

  // ── Private implementation ──────────────────────────────────────────────────

  private async _search(keyword: string, timeRange: string, subreddit?: string): Promise<Post[]> {
    await this.checkRateLimit();
    try {
      const sr = subreddit?.trim();
      const path = sr ? `/r/${sr}/search.json` : `/search.json`;
      const params: Record<string, any> = {
        q: keyword,
        limit: this.config.maxResults,
        sort: 'new',
        t: this.mapTimeRange(timeRange),
        raw_json: 1
      };
      if (sr) params.restrict_sr = 1;

      logger.info(`Reddit search "${keyword}" ${sr ? `in r/${sr}` : '(all)'} [${timeRange}]`);

      const response = await axios.get<RedditResponse>(`${this.baseUrl}${path}`, {
        params,
        headers: { 'User-Agent': this.userAgent },
        timeout: this.config.timeout
      });

      this.updateRateLimits(response.headers);
      return this.validatePosts(this.transformRedditPosts(response.data.data.children));
    } catch (error: any) {
      const apiError = handleAPIError(error);
      logger.error('Reddit search failed', { keyword, code: apiError.code, message: apiError.message });
      throw apiError;
    }
  }

  private async _fetchLatest(subreddit: string, limit: number): Promise<Post[]> {
    await this.checkRateLimit();
    try {
      const sr = subreddit.trim();
      logger.info(`Reddit latest in r/${sr}`);

      const response = await axios.get<RedditResponse>(`${this.baseUrl}/r/${sr}/new.json`, {
        params: { limit: Math.min(limit, 100), raw_json: 1 },
        headers: { 'User-Agent': this.userAgent },
        timeout: this.config.timeout
      });

      this.updateRateLimits(response.headers);
      return this.validatePosts(this.transformRedditPosts(response.data.data.children));
    } catch (error: any) {
      const apiError = handleAPIError(error);
      logger.error('Reddit latest failed', { subreddit, code: apiError.code, message: apiError.message });
      throw apiError;
    }
  }

  private async _fetchTop(subreddit: string, timeRange: string, limit: number): Promise<Post[]> {
    await this.checkRateLimit();
    try {
      const sr = subreddit.trim();
      logger.info(`Reddit top in r/${sr} [${timeRange}]`);

      const response = await axios.get<RedditResponse>(`${this.baseUrl}/r/${sr}/top.json`, {
        params: { limit: Math.min(limit, 100), t: this.mapTimeRange(timeRange), raw_json: 1 },
        headers: { 'User-Agent': this.userAgent },
        timeout: this.config.timeout
      });

      this.updateRateLimits(response.headers);
      return this.validatePosts(this.transformRedditPosts(response.data.data.children));
    } catch (error: any) {
      const apiError = handleAPIError(error);
      logger.error('Reddit top failed', { subreddit, timeRange, code: apiError.code, message: apiError.message });
      throw apiError;
    }
  }

  private transformRedditPosts(redditPosts: RedditPost[]): Post[] {
    return redditPosts.map(item => {
      const p = item.data;
      return {
        id: p.id,
        platform: 'reddit' as const,
        title: p.title,
        content: p.selftext || p.title,
        author: p.author,
        url: `https://reddit.com${p.permalink}`,
        createdAt: new Date(p.created_utc * 1000),
        engagement: {
          likes: p.ups,
          comments: p.num_comments,
          shares: 0,
          score: p.score
        },
        metadata: {
          subreddit: p.subreddit,
          flair: p.link_flair_text,
          isNSFW: p.over_18
        }
      };
    });
  }

  private transformRedditComments(redditComments: RedditCommentItem[], limit: number): Comment[] {
    const out: Comment[] = [];
    for (const item of redditComments) {
      if (item.kind !== 't1') continue;
      if (out.length >= limit) break;
      const c = item.data;
      if (c.author === '[deleted]' || c.body === '[removed]') continue;
      out.push({
        id: c.id,
        author: c.author,
        body: c.body,
        score: c.score,
        createdAt: new Date(c.created_utc * 1000)
      });
    }
    return out;
  }

  private mapTimeRange(timeRange: string): string {
    const mapping: Record<string, string> = {
      hour: 'hour', day: 'day', week: 'week', month: 'month', year: 'year', all: 'all'
    };
    return mapping[timeRange] || 'day';
  }

  private mapCommentSort(s: 'top' | 'best' | 'new'): string {
    return s === 'best' ? 'confidence' : s;
  }

  private async checkRateLimit(): Promise<void> {
    if (this.rateLimitRemaining <= 5 && Date.now() < this.rateLimitReset) {
      const waitTime = this.rateLimitReset - Date.now();
      logger.warn(`Rate limit low (${this.rateLimitRemaining} remaining), waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  private updateRateLimits(headers: any): void {
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];
    if (remaining !== undefined) this.rateLimitRemaining = parseFloat(remaining);
    if (reset !== undefined) this.rateLimitReset = parseFloat(reset) * 1000;
  }
}
