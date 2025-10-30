import { Post } from '../models/post';

export interface AnalyticsData {
  posts: Post[];
  stats: {
    totalPosts: number;
    totalComments: number;
    totalScore: number;
    avgEngagement: number;
  };
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  trends: Array<{ word: string; count: number }>;
  topPosts: Post[];
}

export class AnalyticsExporter {
  static toCSV(data: AnalyticsData): string {
    const lines: string[] = [];
    
    // Summary section
    lines.push('# Analytics Summary');
    lines.push('Metric,Value');
    lines.push(`Total Posts,${data.stats.totalPosts}`);
    lines.push(`Total Comments,${data.stats.totalComments}`);
    lines.push(`Total Score,${data.stats.totalScore}`);
    lines.push(`Average Engagement,${data.stats.avgEngagement}`);
    lines.push('');
    
    // Sentiment section
    lines.push('# Sentiment Analysis');
    lines.push('Type,Count,Percentage');
    const total = data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative;
    lines.push(`Positive,${data.sentiment.positive},${((data.sentiment.positive/total)*100).toFixed(1)}%`);
    lines.push(`Neutral,${data.sentiment.neutral},${((data.sentiment.neutral/total)*100).toFixed(1)}%`);
    lines.push(`Negative,${data.sentiment.negative},${((data.sentiment.negative/total)*100).toFixed(1)}%`);
    lines.push('');
    
    // Trending topics
    lines.push('# Trending Topics');
    lines.push('Keyword,Mentions');
    data.trends.forEach(t => {
      lines.push(`${t.word},${t.count}`);
    });
    lines.push('');
    
    // Top posts
    lines.push('# Top Posts');
    lines.push('Subreddit,Title,Score,Comments,Author,URL');
    data.topPosts.forEach(p => {
      const title = (p.title || '').replace(/"/g, '""');
      lines.push(`r/${p.metadata?.subreddit},"${title}",${p.engagement.score},${p.engagement.comments},${p.author},${p.url}`);
    });
    
    return lines.join('\n');
  }

  static toJSON(data: AnalyticsData, pretty: boolean = true): string {
    return JSON.stringify(data, null, pretty ? 2 : 0);
  }
}