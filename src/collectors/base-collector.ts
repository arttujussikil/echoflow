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

export interface PlatformInfo {
  id: string;
  displayName: string;
  capabilities: CollectorCapabilities;
}

export abstract class BaseCollector {
  protected config: Required<CollectorConfig>;

  abstract readonly platformId: string;
  abstract readonly displayName: string;
  abstract readonly capabilities: CollectorCapabilities;

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

  getPlatformInfo(): PlatformInfo {
    return {
      id: this.platformId,
      displayName: this.displayName,
      capabilities: this.capabilities,
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
      month: 2592000
    };
    return ranges[timeRange] ?? ranges.day;
  }
}
