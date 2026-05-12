import { BaseCollector, CollectorCapabilities, SearchOptions } from './base-collector';
import { Post } from '../models/post';

/**
 * Template for a generic forum collector.
 * To add a real forum: extend this class, implement search(), and register it
 * in src/collectors/index.ts via registry.register(new YourForumCollector()).
 */
export abstract class ForumCollector extends BaseCollector {
  readonly capabilities: CollectorCapabilities = {
    search: false,
    latest: false,
    top: false,
    comments: false,
    requiresAuth: false,
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async search(_keyword: string | null, _options?: SearchOptions): Promise<Post[]> {
    throw new Error(`${this.displayName} collector is not yet implemented`);
  }
}
