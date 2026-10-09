export interface Comment {
  id: string;
  author: string;
  body: string;
  score: number;
  createdAt: Date;
  replies?: Comment[];
}

export interface Post {
  id: string;
  /** Collector platformId, e.g. 'reddit', 'hackernews', 'guardian' */
  platform: string;
  title: string;
  content: string;
  author: string;
  url: string;
  createdAt: Date;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
    score: number;
  };
  metadata?: {
    subreddit?: string;
    flair?: string;
    isNSFW?: boolean;
    [key: string]: any;
  };
  comments?: Comment[];
}