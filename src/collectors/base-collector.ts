import { Post } from '../models/post';

export interface CollectorConfig {
  maxResults?: number;
  timeout?: number;
}

export interface SearchOptions {
  mode?: 'search' | 'latest' | 'top';
  timeRange?: string;
  /** Platform-agnostic channel list: subreddits for Reddit, tags for HN, etc. */
  channels?: string[];
  limit?: number;
  /** Per-request API key (e.g. pasted by the user in the UI settings). Overrides the env key. */
  apiKey?: string;
}

export interface CommentOptions {
  limit?: number;
  sort?: string;
  delayMs?: number;
}

export interface CollectorCapabilities {
  search: boolean;
  latest: boolean;
  top: boolean;
  comments: boolean;
  requiresAuth: boolean;
}

/** social = discussion platforms, news = news APIs, feed = raw RSS/Atom */
export type SourceCategory = 'social' | 'news' | 'feed';

export interface ApiKeyInfo {
  /** Env var the server reads the key from, e.g. GUARDIAN_API_KEY */
  envVar: string;
  /** Where a free key can be obtained */
  signupUrl: string;
}

export interface PlatformInfo {
  id: string;
  displayName: string;
  category: SourceCategory;
  description?: string;
  capabilities: CollectorCapabilities;
  /** Present when the source needs an API key */
  apiKey?: ApiKeyInfo & { configured: boolean };
}

export abstract class BaseCollector {
  protected config: Required<CollectorConfig>;

  abstract readonly platformId: string;
  abstract readonly displayName: string;
  abstract readonly capabilities: CollectorCapabilities;
  readonly category: SourceCategory = 'social';
  readonly description?: string;
  readonly apiKeyInfo?: ApiKeyInfo;

  constructor(config: CollectorConfig = {}) {
    this.config = {
      maxResults: config.maxResults ?? 100,
      timeout: config.timeout ?? 30000
    };
  }

  /**
   * Unified search entry point. All modes (search/latest/top) go through here.
   * keyword may be null for latest/top modes that don't need one.
   */
  abstract search(keyword: string | null, options?: SearchOptions): Promise<Post[]>;

  /** Optional — only collectors with capabilities.comments implement this. */
  fetchCommentsForPosts?(posts: Post[], opts?: CommentOptions): Promise<Post[]>;

  /** Key from the request if given, otherwise from the environment. */
  protected resolveApiKey(options?: SearchOptions): string {
    if (options?.apiKey) return options.apiKey;
    return this.apiKeyInfo ? process.env[this.apiKeyInfo.envVar] || '' : '';
  }

  /** True when the source can run without a per-request key. */
  isReady(): boolean {
    return !this.apiKeyInfo || Boolean(process.env[this.apiKeyInfo.envVar]);
  }

  getPlatformInfo(): PlatformInfo {
    return {
      id: this.platformId,
      displayName: this.displayName,
      category: this.category,
      description: this.description,
      capabilities: this.capabilities,
      ...(this.apiKeyInfo
        ? { apiKey: { ...this.apiKeyInfo, configured: this.isReady() } }
        : {}),
    };
  }

  protected validatePosts<T extends { id?: string; title?: string; content?: string }>(posts: T[]): T[] {
    return posts.filter(p => p.id && p.title && p.content) as T[];
  }

  protected getTimeRangeInSeconds(timeRange: string): number {
    const ranges: Record<string, number> = {
      hour: 3600,
      day: 86400,
      week: 604800,
      month: 2592000,
      year: 31536000,
      all: 0,
    };
    return ranges[timeRange] ?? ranges.day;
  }

  /** Start of the time range as a Date, or null for 'all'. */
  protected sinceDate(timeRange: string): Date | null {
    const s = this.getTimeRangeInSeconds(timeRange);
    return s ? new Date(Date.now() - s * 1000) : null;
  }
}
