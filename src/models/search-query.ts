import { Post } from './post';

export type SearchMode = 'search' | 'latest' | 'top';

export interface SearchQuery {
  keyword?: string;
  platforms: string[];
  timeRange?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  subreddits?: string[];
  mode?: SearchMode;
  limit?: number;
  filters?: {
    minEngagement?: number;
    sortBy?: 'likes' | 'comments' | 'shares' | 'recent';
  };
  fetchComments?: boolean;
  commentLimit?: number;
  commentSort?: 'top' | 'best' | 'new';
}

export interface SearchResult {
  query: SearchQuery;
  posts: Post[];
  totalResults: number;
  timestamp: Date;
}