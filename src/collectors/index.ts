import { registry } from './collector-registry';
import { RedditCollector } from './reddit-collector';
import { HackerNewsCollector } from './hackernews-collector';
import { RSSCollector } from './rss-collector';
import { BlueskyCollector } from './bluesky-collector';
import { LemmyCollector } from './lemmy-collector';
import { GoogleNewsCollector } from './gnews-collector';
import { NewsApiCollector, NEWS_APIS } from './news-api-collector';
import { FinnishNewsCollector, FINNISH_OUTLETS } from './finnish-news-collector';

// Social / discussion platforms (no key needed)
registry.register(new RedditCollector({ maxResults: 100 }));
registry.register(new HackerNewsCollector({ maxResults: 100 }));
registry.register(new BlueskyCollector({ maxResults: 100 }));
registry.register(new LemmyCollector({ maxResults: 100 }));

// News (Google News needs no key; the rest come from public-apis, see news-api-collector.ts)
registry.register(new GoogleNewsCollector({ maxResults: 100 }));
for (const def of NEWS_APIS) {
  registry.register(new NewsApiCollector(def, { maxResults: 100 }));
}

// Finnish newspapers (no keys): all of them via Google News Finland, plus single papers
registry.register(new FinnishNewsCollector(null));
for (const outlet of FINNISH_OUTLETS) {
  registry.register(new FinnishNewsCollector(outlet));
}

// Raw feeds
registry.register(new RSSCollector({ maxResults: 100 }));

export { registry };
