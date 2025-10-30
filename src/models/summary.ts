export interface Summary {
  keyword: string;
  overallSentiment: 'positive' | 'negative' | 'neutral';
  keyTrends: string[];
  insights: string[];
  timestamp: Date;

  // optional enrichments
  searchId?: string;
  postsAnalyzed?: number;
  sentimentBreakdown?: {
    positive: number;
    neutral: number;
    negative: number;
  };
  confidence?: number;           // 0..1 confidence in the summary
  platforms?: string[];          // e.g., ['reddit']
  timeRange?: 'hour' | 'day' | 'week' | 'month';
}