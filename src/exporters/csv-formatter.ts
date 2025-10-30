import { Post } from '../models/post';

/**
 * Convert posts array to CSV format
 */
export function postsToCsv(posts: any[]): string {
  if (!posts || posts.length === 0) {
    return 'No results';
  }

  const headers = [
    'ID',
    'Platform',
    'Subreddit',
    'Title',
    'Author',
    'URL',
    'Score',
    'Comments',
    'Created',
    'Content'
  ];

  const rows = posts.map(post => {
    const subreddit = post.metadata?.subreddit || post.subreddit || '';
    const author = post.metadata?.author || post.author || '';
    const created = post.metadata?.created 
      ? new Date(post.metadata.created * 1000).toISOString()
      : (post.createdAt || '');
    const score = post.engagement?.score ?? post.score ?? 0;
    const comments = post.engagement?.comments ?? post.num_comments ?? 0;
    const content = (post.selftext || post.content || '').replace(/[\r\n]+/g, ' ').substring(0, 500);

    return [
      escapeCsv(post.id || ''),
      'reddit',
      escapeCsv(subreddit),
      escapeCsv(post.title || ''),
      escapeCsv(author),
      escapeCsv(post.url || ''),
      score,
      comments,
      created,
      escapeCsv(content)
    ];
  });

  const csvLines = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ];

  return csvLines.join('\n');
}

function escapeCsv(field: string | number): string {
  if (typeof field === 'number') return field.toString();
  if (!field) return '';
  
  const str = field.toString();
  
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}