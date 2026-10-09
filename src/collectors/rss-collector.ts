import { BaseCollector, CollectorCapabilities, SearchOptions, CollectorConfig } from './base-collector';
import { Post } from '../models/post';
import { logger } from '../utils/logger';

// Lazy-load rss-parser so a missing package shows a clear error
// instead of crashing the entire collector registry at startup.
// eslint-disable-next-line @typescript-eslint/no-var-requires
let ParserClass: any;
try {
  ParserClass = require('rss-parser');
} catch {
  ParserClass = null;
}

export class RSSCollector extends BaseCollector {
  readonly platformId = 'rss';
  readonly displayName = 'RSS / Atom Feeds';
  readonly category = 'feed' as const;
  readonly description = 'Any RSS or Atom feed URL.';
  readonly capabilities: CollectorCapabilities = {
    search: true,
    latest: true,
    top: true,
    comments: false,
    requiresAuth: false,
  };

  private parser: any;

  constructor(config?: CollectorConfig) {
    super(config);
    if (ParserClass) {
      this.parser = new ParserClass({
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EchoFlow/1.0; Feed Reader)',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
      });
    }
  }

  /**
   * channels = array of feed URLs (RSS 2.0 or Atom).
   *
   * Working examples:
   *   https://www.hltv.org/rss/news
   *   https://hnrss.org/frontpage
   *   https://feeds.arstechnica.com/arstechnica/index
   *   https://www.theverge.com/rss/index.xml
   *
   * Note: Sites behind Cloudflare (e.g. HLTV forum threads) cannot be scraped.
   */
  async search(keyword: string | null, options: SearchOptions = {}): Promise<Post[]> {
    if (!this.parser) {
      throw new Error('rss-parser is not installed. Run: npm install rss-parser');
    }

    const { mode = 'latest', channels = [], limit } = options;
    const effectiveLimit = limit ?? this.config.maxResults;

    if (channels.length === 0) {
      throw new Error('RSS collector requires at least one feed URL in the channels field');
    }

    const allPosts: Post[] = [];

    for (const feedUrl of channels) {
      try {
        const posts = await this.fetchFeed(feedUrl, effectiveLimit);
        allPosts.push(...posts);
      } catch (err: any) {
        logger.warn(`RSS: failed to fetch "${feedUrl}": ${err.message}`);
      }
    }

    if (allPosts.length === 0) {
      return [];
    }

    let results = allPosts;
    if (mode === 'search' && keyword) {
      const kw = keyword.toLowerCase();
      results = allPosts.filter(
        p => p.title.toLowerCase().includes(kw) ||
             (p.content || '').toLowerCase().includes(kw)
      );
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return this.validatePosts(results.slice(0, effectiveLimit));
  }

  private async fetchFeed(url: string, limit: number): Promise<Post[]> {
    logger.info(`RSS: fetching ${url}`);
    const feed = await this.parser.parseURL(url);

    return (feed.items as any[]).slice(0, limit).map((item): Post => {
      const dateStr = item.isoDate || item.pubDate;
      return {
        id: item.guid || item.link || `${url}#${Math.random()}`,
        platform: 'rss',
        title: item.title || '(no title)',
        content: item.contentSnippet || item.summary || item.title || '',
        author: item.creator || item.author || feed.title || 'unknown',
        url: item.link || url,
        createdAt: dateStr ? new Date(dateStr) : new Date(),
        engagement: { likes: 0, comments: 0, shares: 0, score: 0 },
        metadata: { feedTitle: feed.title ?? url, feedUrl: url },
      };
    });
  }
}
