import { BaseCollector, CollectorCapabilities, CollectorConfig, SearchOptions } from './base-collector';
import { Post } from '../models/post';
import { logger } from '../utils/logger';

let ParserClass: any;
try { ParserClass = require('rss-parser'); } catch { ParserClass = null; }

/**
 * Finnish newspapers, no API keys.
 *
 * Most Finnish papers have no public search API (Yle's API no longer serves news
 * content), and their RSS feeds only list the latest articles. So keyword search
 * goes through Google News' Finnish edition restricted to the paper's site
 * (`site:kaleva.fi`), and the paper's own RSS feed is the fallback when Google
 * News fails. All feeds below were checked to respond (2026-10).
 */
export interface FinnishOutlet {
  id: string;
  name: string;
  domain: string;
  /** The outlet's own RSS feeds (fallback), if it has working ones */
  rss?: string[];
}

export const FINNISH_OUTLETS: FinnishOutlet[] = [
  { id: 'fi-yle', name: 'Yle', domain: 'yle.fi', rss: ['https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET'] },
  { id: 'fi-hs', name: 'Helsingin Sanomat', domain: 'hs.fi', rss: ['https://www.hs.fi/rss/tuoreimmat.xml'] },
  { id: 'fi-is', name: 'Ilta-Sanomat', domain: 'is.fi', rss: ['https://www.is.fi/rss/tuoreimmat.xml'] },
  { id: 'fi-il', name: 'Iltalehti', domain: 'iltalehti.fi', rss: ['https://www.iltalehti.fi/rss/uutiset.xml'] },
  { id: 'fi-mtv', name: 'MTV Uutiset', domain: 'mtvuutiset.fi', rss: ['https://www.mtvuutiset.fi/api/feed/rss/uutiset_uusimmat'] },
  { id: 'fi-kaleva', name: 'Kaleva', domain: 'kaleva.fi', rss: ['https://www.kaleva.fi/feedit/rss/managed-listing/rss-uusimmat/'] },
  { id: 'fi-aamulehti', name: 'Aamulehti', domain: 'aamulehti.fi' },
  { id: 'fi-ts', name: 'Turun Sanomat', domain: 'ts.fi', rss: ['https://www.ts.fi/rss.xml'] },
  { id: 'fi-savonsanomat', name: 'Savon Sanomat', domain: 'savonsanomat.fi', rss: ['https://www.savonsanomat.fi/rss/'] },
  { id: 'fi-ksml', name: 'Keskisuomalainen', domain: 'ksml.fi', rss: ['https://www.ksml.fi/rss/'] },
  { id: 'fi-satakunnankansa', name: 'Satakunnan Kansa', domain: 'satakunnankansa.fi' },
  { id: 'fi-kauppalehti', name: 'Kauppalehti', domain: 'kauppalehti.fi', rss: ['https://feeds.kauppalehti.fi/rss/main'] },
  { id: 'fi-mt', name: 'Maaseudun Tulevaisuus', domain: 'maaseuduntulevaisuus.fi', rss: ['https://www.maaseuduntulevaisuus.fi/feed'] },
  { id: 'fi-uusisuomi', name: 'Uusi Suomi', domain: 'uusisuomi.fi' },
  { id: 'fi-hbl', name: 'Hufvudstadsbladet', domain: 'hbl.fi', rss: ['https://www.hbl.fi/rss'] },
];

/** Google News `when:` operator for each time range */
const WHEN: Record<string, string> = { hour: '1h', day: '1d', week: '7d', month: '30d', year: '1y' };

export class FinnishNewsCollector extends BaseCollector {
  readonly platformId: string;
  readonly displayName: string;
  readonly description: string;
  readonly category = 'finnish' as const;
  readonly defaultEnabled: boolean;
  readonly capabilities: CollectorCapabilities = {
    search: true, latest: false, top: false, comments: false, requiresAuth: false,
  };

  private parser: any;

  /** outlet = null → all Finnish media via Google News Finland */
  constructor(private readonly outlet: FinnishOutlet | null, config?: CollectorConfig) {
    super(config);
    this.platformId = outlet?.id ?? 'fi-all';
    this.displayName = outlet?.name ?? 'Google News Suomi';
    this.description = outlet
      ? `Articles from ${outlet.domain}${outlet.rss ? ' (Google News search, own RSS feed as fallback)' : ' (Google News search)'}. No key needed.`
      : 'All Finnish media (Yle, HS, IS, IL, Kaleva, …) in one search, via Google News Finland. No key needed.';
    // Single papers are opt-in so a default search doesn't fire 15 extra requests
    this.defaultEnabled = !outlet;
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
    if (!this.parser) throw new Error('rss-parser is not installed');
    const q = keyword?.trim();
    if (!q) return [];
    const { limit = 25, timeRange = 'week' } = options;

    try {
      const posts = await this.searchGoogleNews(q, timeRange, limit);
      if (posts.length || !this.outlet?.rss) return posts;
    } catch (err: any) {
      if (!this.outlet?.rss) throw err;
      logger.warn(`${this.displayName}: Google News failed (${err.message}), using the paper's RSS feed`);
    }
    return this.searchOwnFeeds(q, timeRange, limit);
  }

  private async searchGoogleNews(q: string, timeRange: string, limit: number): Promise<Post[]> {
    const query = [q, this.outlet ? `site:${this.outlet.domain}` : '', WHEN[timeRange] ? `when:${WHEN[timeRange]}` : '']
      .filter(Boolean).join(' ');
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fi&gl=FI&ceid=FI:fi`;
    logger.info(`${this.displayName}: Google News FI "${query}"`);
    const feed = await this.parser.parseURL(url);
    const cutoff = this.sinceDate(timeRange);
    return (feed.items ?? [])
      .filter((it: any) => !cutoff || new Date(it.isoDate ?? it.pubDate ?? 0) >= cutoff)
      .slice(0, limit)
      .map((it: any) => {
        const source = typeof it.source === 'string' ? it.source : it.source?._ ?? this.outlet?.name ?? '';
        // Google News titles end with " - <source>"
        const title = source && it.title?.endsWith(` - ${source}`) ? it.title.slice(0, -(source.length + 3)) : it.title;
        return this.toPost(it.guid ?? it.link, title, '', it.link, it.isoDate ?? it.pubDate, source);
      });
  }

  /** Fallback: the paper's latest articles that mention the keyword. */
  private async searchOwnFeeds(q: string, timeRange: string, limit: number): Promise<Post[]> {
    // Finnish inflects words (Suomi → Suomen, Suomessa), so match on a word stem
    const stems = q.toLowerCase().split(/\s+/).filter(Boolean).map(w => w.slice(0, Math.max(4, w.length - 2)));
    const cutoff = this.sinceDate(timeRange);
    const posts: Post[] = [];
    for (const feedUrl of this.outlet?.rss ?? []) {
      const feed = await this.parser.parseURL(feedUrl);
      for (const it of feed.items ?? []) {
        const text = `${it.title ?? ''} ${it.contentSnippet ?? ''}`.toLowerCase();
        const date = new Date(it.isoDate ?? it.pubDate ?? Date.now());
        if (stems.every(s => text.includes(s)) && (!cutoff || date >= cutoff)) {
          posts.push(this.toPost(it.guid ?? it.link, it.title, it.contentSnippet, it.link, it.isoDate ?? it.pubDate, this.outlet!.name));
        }
      }
    }
    return posts.slice(0, limit);
  }

  private toPost(id: string, title: string, content: string | undefined, url: string, date: string | undefined, source: string): Post {
    return {
      id: String(id ?? url),
      platform: this.platformId,
      title: title || '(no title)',
      content: (content || title || '').trim(),
      author: source || this.displayName,
      url: url ?? '',
      createdAt: new Date(date ?? Date.now()),
      engagement: { likes: 0, comments: 0, shares: 0, score: 0 },
      metadata: { source },
    };
  }
}
