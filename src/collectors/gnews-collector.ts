import { BaseCollector, CollectorCapabilities, CollectorConfig, SearchOptions } from './base-collector';
import { Post } from '../models/post';
import { logger } from '../utils/logger';

let ParserClass: any;
try { ParserClass = require('rss-parser'); } catch { ParserClass = null; }

export class GoogleNewsCollector extends BaseCollector {
  readonly platformId = 'gnews';
  readonly displayName = 'Google News';
  readonly category = 'news' as const;
  readonly description = 'Google News search via RSS. No key needed.';
  readonly capabilities: CollectorCapabilities = {
    search: true, latest: true, top: false, comments: false, requiresAuth: false,
  };

  private parser: any;

  constructor(config?: CollectorConfig) {
    super(config);
    if (ParserClass) {
      this.parser = new ParserClass({
        timeout: 15_000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EchoFlow/1.0; Feed Reader)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        customFields: { item: ['source'] },
      });
    }
  }

  async search(keyword: string | null, options: SearchOptions = {}): Promise<Post[]> {
    if (!this.parser) return [];
    const { limit = 25, timeRange = 'day' } = options;
    const q = keyword?.trim() || 'top news';
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    logger.info(`Google News search "${q}" [${timeRange}]`);
    try {
      const feed = await this.parser.parseURL(url);
      const cutoff = this.cutoffDate(timeRange);
      const items = (feed.items ?? []).filter((item: any) => {
        if (!cutoff) return true;
        const d = new Date(item.pubDate ?? item.isoDate ?? 0);
        return d >= cutoff;
      }).slice(0, limit);
      return items.map((item: any, i: number) => {
        const source = typeof item.source === 'string' ? item.source : item.source?._ ?? '';
        // Google News titles end with " - <source>"
        const title = source && item.title?.endsWith(` - ${source}`) ? item.title.slice(0, -(source.length + 3)) : item.title;
        return {
        id: item.guid ?? item.link ?? `gnews-${i}`,
        platform: 'gnews' as const,
        title: title ?? 'News article',
        content: item.contentSnippet || item.content || item.title || '',
        author: source || item.creator || '',
        url: item.link ?? '',
        createdAt: new Date(item.pubDate ?? item.isoDate ?? Date.now()),
        engagement: { likes: 0, comments: 0, shares: 0, score: 0 },
        metadata: { source },
        };
      });
    } catch (err: any) {
      logger.error('Google News search failed', { q, message: err.message });
      throw err;
    }
  }

  private cutoffDate(timeRange: string): Date | null {
    const s = this.getTimeRangeInSeconds(timeRange);
    return s ? new Date(Date.now() - s * 1000) : null;
  }
}
