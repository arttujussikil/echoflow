export interface CollectorConfig {
  maxResults?: number;
  timeout?: number;
}

export abstract class BaseCollector {
  protected config: Required<CollectorConfig>;

  constructor(config: CollectorConfig = {}) {
    this.config = {
      maxResults: config.maxResults ?? 100,
      timeout: config.timeout ?? 30000
    };
  }

  // Concrete collectors must implement search
  abstract search(keyword: string, timeRange: string, opts?: Record<string, any>): Promise<any[]>;

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


// When adding ForumCollector or TwitterCollector or whatever, you just extend BaseCollector and implement search()

// Feature	                      Benefit

// Abstract search()	            Forces every collector to have a .search() method with the same signature
// validatePosts()	              Shared logic to filter out bad data
// getTimeRangeInSeconds()	      Converts "week" → 604800 for APIs that need epoch timestamps
// config defaults	              Every collector gets maxResults: 100, timeout: 30000 automatically