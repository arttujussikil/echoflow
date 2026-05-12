import { registry } from './collector-registry';
import { RedditCollector } from './reddit-collector';
import { HackerNewsCollector } from './hackernews-collector';
import { RSSCollector } from './rss-collector';

registry.register(new RedditCollector({ maxResults: 100 }));
registry.register(new HackerNewsCollector({ maxResults: 100 }));
registry.register(new RSSCollector({ maxResults: 100 }));

export { registry };
