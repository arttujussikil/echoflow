import axios from 'axios';
import { BaseCollector, CollectorCapabilities, CollectorConfig, SearchOptions, ApiKeyInfo } from './base-collector';
import { Post } from '../models/post';
import { logger } from '../utils/logger';
import { APIError } from '../utils/errors';

/**
 * News APIs from https://github.com/public-apis/public-apis#news that are free
 * (either no auth at all, or a free-tier API key).
 *
 * Each API is a small definition: how to build the request and how to read
 * the articles out of the response. Adding a new one = adding an entry below.
 */
interface Article {
  id?: string;
  title?: string;
  content?: string;
  author?: string;
  url?: string;
  publishedAt?: string | number;
  source?: string;
}

interface NewsApiDefinition {
  id: string;
  displayName: string;
  description: string;
  apiKey?: ApiKeyInfo;
  request(q: string, limit: number, since: Date | null, key: string): { url: string; params: Record<string, any> };
  articles(data: any): Article[];
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const isoSeconds = (d: Date) => d.toISOString().slice(0, 19);
const stripHtml = (s?: string) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export const NEWS_APIS: NewsApiDefinition[] = [
  {
    id: 'spaceflight',
    displayName: 'Spaceflight News',
    description: 'Space & science news. No key needed.',
    request: (q, limit, since) => ({
      url: 'https://api.spaceflightnewsapi.net/v4/articles/',
      params: { search: q, limit: Math.min(limit, 100), ...(since ? { published_at_gte: since.toISOString() } : {}) },
    }),
    articles: data => (data.results ?? []).map((a: any) => ({
      id: `sfn-${a.id}`, title: a.title, content: a.summary, author: a.authors?.[0]?.name ?? a.news_site,
      url: a.url, publishedAt: a.published_at, source: a.news_site,
    })),
  },
  {
    id: 'guardian',
    displayName: 'The Guardian',
    description: 'Full Guardian archive. Free developer key.',
    apiKey: { envVar: 'GUARDIAN_API_KEY', signupUrl: 'https://open-platform.theguardian.com/access/' },
    request: (q, limit, since, key) => ({
      url: 'https://content.guardianapis.com/search',
      params: {
        q, 'api-key': key, 'page-size': Math.min(limit, 50), 'order-by': 'relevance',
        'show-fields': 'trailText,byline', ...(since ? { 'from-date': isoDay(since) } : {}),
      },
    }),
    articles: data => (data.response?.results ?? []).map((a: any) => ({
      id: a.id, title: a.webTitle, content: stripHtml(a.fields?.trailText) || a.webTitle,
      author: a.fields?.byline, url: a.webUrl, publishedAt: a.webPublicationDate,
      source: `The Guardian · ${a.sectionName ?? ''}`.replace(/ · $/, ''),
    })),
  },
  {
    id: 'nyt',
    displayName: 'New York Times',
    description: 'NYT Article Search. Free developer key.',
    apiKey: { envVar: 'NYT_API_KEY', signupUrl: 'https://developer.nytimes.com/get-started' },
    request: (q, _limit, since, key) => ({
      url: 'https://api.nytimes.com/svc/search/v2/articlesearch.json',
      params: { q, 'api-key': key, sort: 'relevance', ...(since ? { begin_date: isoDay(since).replace(/-/g, '') } : {}) },
    }),
    articles: data => (data.response?.docs ?? []).map((a: any) => ({
      id: a._id, title: a.headline?.main, content: a.abstract || a.snippet, author: a.byline?.original,
      url: a.web_url, publishedAt: a.pub_date, source: 'New York Times',
    })),
  },
  {
    id: 'gnewsio',
    displayName: 'GNews.io',
    description: '60k+ sources. Free key, 100 requests/day.',
    apiKey: { envVar: 'GNEWS_API_KEY', signupUrl: 'https://gnews.io/register' },
    request: (q, limit, since, key) => ({
      url: 'https://gnews.io/api/v4/search',
      params: { q, apikey: key, lang: 'en', max: Math.min(limit, 10), ...(since ? { from: isoSeconds(since) + 'Z' } : {}) },
    }),
    articles: data => (data.articles ?? []).map((a: any) => ({
      id: a.url, title: a.title, content: a.description, url: a.url,
      publishedAt: a.publishedAt, source: a.source?.name, author: a.source?.name,
    })),
  },
  {
    id: 'newsdata',
    displayName: 'NewsData.io',
    description: 'Breaking news, many languages. Free key, 200 requests/day.',
    apiKey: { envVar: 'NEWSDATA_API_KEY', signupUrl: 'https://newsdata.io/register' },
    request: (q, limit, _since, key) => ({
      url: 'https://newsdata.io/api/1/latest',
      params: { q, apikey: key, size: Math.min(limit, 10) },
    }),
    articles: data => (data.results ?? []).map((a: any) => ({
      id: a.article_id, title: a.title, content: a.description, author: a.creator?.[0] ?? a.source_name,
      url: a.link, publishedAt: a.pubDate ? a.pubDate.replace(' ', 'T') + 'Z' : undefined,
      source: a.source_name ?? a.source_id,
    })),
  },
  {
    id: 'currents',
    displayName: 'Currents',
    description: 'Global multilingual news. Free key.',
    apiKey: { envVar: 'CURRENTS_API_KEY', signupUrl: 'https://currentsapi.services/en/register' },
    request: (q, limit, since, key) => ({
      url: 'https://api.currentsapi.services/v1/search',
      params: { keywords: q, apiKey: key, page_size: Math.min(limit, 50), ...(since ? { start_date: since.toISOString() } : {}) },
    }),
    articles: data => (data.news ?? []).map((a: any) => ({
      id: a.id, title: a.title, content: a.description, author: a.author,
      url: a.url, publishedAt: a.published, source: a.author,
    })),
  },
  {
    id: 'thenewsapi',
    displayName: 'TheNewsAPI',
    description: 'Aggregated headlines. Free key, 100 requests/day.',
    apiKey: { envVar: 'THENEWSAPI_KEY', signupUrl: 'https://www.thenewsapi.com/register' },
    request: (q, limit, since, key) => ({
      url: 'https://api.thenewsapi.com/v1/news/all',
      params: { search: q, api_token: key, language: 'en', limit: Math.min(limit, 3), ...(since ? { published_after: isoSeconds(since) } : {}) },
    }),
    articles: data => (data.data ?? []).map((a: any) => ({
      id: a.uuid, title: a.title, content: a.description || a.snippet,
      url: a.url, publishedAt: a.published_at, source: a.source, author: a.source,
    })),
  },
  {
    id: 'newsapi',
    displayName: 'NewsAPI.org',
    description: '150k+ sources. Free developer key (articles up to 1 month old).',
    apiKey: { envVar: 'NEWSAPI_KEY', signupUrl: 'https://newsapi.org/register' },
    request: (q, limit, since, key) => ({
      url: 'https://newsapi.org/v2/everything',
      params: { q, apiKey: key, pageSize: Math.min(limit, 100), sortBy: 'popularity', ...(since ? { from: isoSeconds(since) } : {}) },
    }),
    articles: data => (data.articles ?? [])
      .filter((a: any) => a.title && a.title !== '[Removed]')
      .map((a: any) => ({
        id: a.url, title: a.title, content: a.description, author: a.author ?? a.source?.name,
        url: a.url, publishedAt: a.publishedAt, source: a.source?.name,
      })),
  },
  {
    id: 'mediastack',
    displayName: 'Mediastack',
    description: 'Live news & blogs. Free key, 100 requests/month.',
    apiKey: { envVar: 'MEDIASTACK_API_KEY', signupUrl: 'https://mediastack.com/signup/free' },
    // Free plan is HTTP-only
    request: (q, limit, since, key) => ({
      url: 'http://api.mediastack.com/v1/news',
      params: {
        keywords: q, access_key: key, languages: 'en', limit: Math.min(limit, 100),
        ...(since ? { date: `${isoDay(since)},${isoDay(new Date())}` } : {}),
      },
    }),
    articles: data => (data.data ?? []).map((a: any) => ({
      id: a.url, title: a.title, content: a.description, author: a.author ?? a.source,
      url: a.url, publishedAt: a.published_at, source: a.source,
    })),
  },
];

export class NewsApiCollector extends BaseCollector {
  readonly platformId: string;
  readonly displayName: string;
  readonly description: string;
  readonly category = 'news' as const;
  readonly apiKeyInfo?: ApiKeyInfo;
  readonly capabilities: CollectorCapabilities = {
    search: true, latest: false, top: false, comments: false, requiresAuth: false,
  };

  constructor(private readonly def: NewsApiDefinition, config?: CollectorConfig) {
    super(config);
    this.platformId = def.id;
    this.displayName = def.displayName;
    this.description = def.description;
    this.apiKeyInfo = def.apiKey;
    this.capabilities.requiresAuth = Boolean(def.apiKey);
  }

  async search(keyword: string | null, options: SearchOptions = {}): Promise<Post[]> {
    const q = keyword?.trim();
    if (!q) return [];

    const key = this.resolveApiKey(options);
    if (this.apiKeyInfo && !key) {
      throw new APIError(`${this.displayName} needs an API key (set it in Settings or ${this.apiKeyInfo.envVar})`, 401, 'NO_API_KEY');
    }

    const { limit = 25, timeRange = 'week' } = options;
    const { url, params } = this.def.request(q, limit, this.sinceDate(timeRange), key);
    logger.info(`${this.displayName} search "${q}" [${timeRange}]`);

    try {
      const { data } = await axios.get(url, { params, timeout: 15_000 });
      return this.def.articles(data)
        .filter(a => a.title && a.url)
        .slice(0, limit)
        .map(a => this.toPost(a));
    } catch (err: any) {
      const status = err.response?.status;
      // Most of these APIs put a human-readable reason in the body
      const reason = err.response?.data?.message ?? err.response?.data?.error?.message ?? err.response?.data?.error ?? err.message;
      throw new APIError(`${this.displayName}: ${typeof reason === 'string' ? reason : 'request failed'}`, status ?? 502);
    }
  }

  private toPost(a: Article): Post {
    let created = new Date(a.publishedAt ?? Date.now());
    if (isNaN(created.getTime())) created = new Date();
    return {
      id: String(a.id ?? a.url),
      platform: this.platformId,
      title: stripHtml(a.title),
      content: stripHtml(a.content) || stripHtml(a.title),
      author: a.author || a.source || this.displayName,
      url: a.url!,
      createdAt: created,
      engagement: { likes: 0, comments: 0, shares: 0, score: 0 },
      metadata: { source: a.source || this.displayName },
    };
  }
}
