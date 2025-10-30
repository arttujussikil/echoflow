const form = document.getElementById('analyticsForm');
const loading = document.getElementById('loading');
const loadingTitle = document.getElementById('loadingTitle');
const loadingStatus = document.getElementById('loadingStatus');
const progressFill = document.getElementById('progressFill');
const statsSection = document.getElementById('statsSection');
const sentimentSection = document.getElementById('sentimentSection');
const trendsSection = document.getElementById('trendsSection');
const topPostsSection = document.getElementById('topPostsSection');
const aiInsightsSection = document.getElementById('aiInsightsSection');
const fetchCommentsCheckbox = document.getElementById('fetchComments');
const commentOptions = document.getElementById('commentOptions');

let currentAnalyticsData = null;

// Toggle comment options visibility
fetchCommentsCheckbox.addEventListener('change', () => {
  if (fetchCommentsCheckbox.checked) {
    commentOptions.classList.remove('hidden');
  } else {
    commentOptions.classList.add('hidden');
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await analyzeData();
});

function updateProgress(percent, title, status, stepIndex) {
  progressFill.style.width = `${percent}%`;
  loadingTitle.textContent = title;
  loadingStatus.textContent = status;
  
  // Update step icons
  for (let i = 1; i <= 4; i++) {
    const icon = document.getElementById(`stepIcon${i}`);
    if (i < stepIndex) {
      icon.textContent = '✅';
    } else if (i === stepIndex) {
      icon.textContent = '⏳';
    } else {
      icon.textContent = '⏳';
    }
  }
}

async function analyzeData() {
  loading.classList.remove('hidden');
  hideAllSections();
  updateProgress(0, 'Starting analysis...', 'Preparing request...', 1);

  const subreddits = document.getElementById('subreddits').value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const timeRange = document.getElementById('timeRange').value;
  const minPosts = Number(document.getElementById('minPosts').value);
  const postSort = document.querySelector('input[name="postSort"]:checked')?.value || undefined;
  const fetchComments = document.getElementById('fetchComments').checked;
  const commentLimit = Number(document.getElementById('commentLimit').value);
  const commentSort = document.getElementById('commentSort').value;

  try {
    // Step 1: Fetch data
    updateProgress(10, 'Fetching data...', `Collecting posts from ${subreddits.length} subreddit(s)...`, 1);
    
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'top',
        platforms: ['reddit'],
        subreddits,
        timeRange,
        limit: minPosts,
        fetchComments,
        commentLimit,
        commentSort,
        filters: {
          sortBy: postSort
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch data');
    }

    updateProgress(40, 'Processing data...', 'Parsing response...', 1);
    const data = await response.json();
    const posts = data.results || [];

    if (posts.length === 0) {
      alert('No data found for the selected criteria');
      loading.classList.add('hidden');
      return;
    }

    updateProgress(50, 'Analyzing posts...', `Processing ${posts.length} posts...`, 1);
    
    // Step 2: Calculate stats (show immediately)
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for visual feedback
    updateProgress(60, 'Calculating statistics...', 'Computing engagement metrics...', 2);
    
    const totalCommentsFetched = fetchComments 
      ? posts.reduce((sum, p) => sum + (p.comments?.length || 0), 0)
      : 0;

    displayStats(posts, totalCommentsFetched);
    statsSection.classList.remove('hidden');

    // Step 3: Analyze sentiment
    await new Promise(resolve => setTimeout(resolve, 100));
    updateProgress(70, 'Analyzing sentiment...', 'Evaluating post and comment sentiment...', 2);
    
    const sentiment = displaySentiment(posts, fetchComments);
    sentimentSection.classList.remove('hidden');

    // Step 4: Extract trends
    await new Promise(resolve => setTimeout(resolve, 100));
    updateProgress(80, 'Extracting trends...', 'Identifying trending keywords...', 3);
    
    const trends = displayTrends(posts, fetchComments);
    trendsSection.classList.remove('hidden');

    // Step 5: Process top posts
    await new Promise(resolve => setTimeout(resolve, 100));
    updateProgress(90, 'Ranking posts...', 'Finding top content...', 4);
    
    const topPosts = displayTopPosts(posts);
    topPostsSection.classList.remove('hidden');

    // Final step: Store data
    updateProgress(100, 'Complete!', `Analyzed ${posts.length} posts successfully`, 4);
    
    currentAnalyticsData = {
      posts,
      stats: {
        totalPosts: posts.length,
        totalComments: posts.reduce((sum, p) => sum + (p.engagement?.comments || 0), 0),
        totalCommentsFetched,
        totalScore: posts.reduce((sum, p) => sum + (p.engagement?.score || 0), 0),
        avgEngagement: Math.round(posts.reduce((sum, p) => sum + (p.engagement?.score || 0), 0) / posts.length)
      },
      sentiment,
      trends,
      topPosts
    };

    await new Promise(resolve => setTimeout(resolve, 300));
    loading.classList.add('hidden');
    aiInsightsSection.classList.remove('hidden');
    document.getElementById('exportButtons').classList.remove('hidden');

  } catch (error) {
    console.error('Analytics error:', error);
    updateProgress(0, 'Error', error.message, 1);
    await new Promise(resolve => setTimeout(resolve, 2000));
    loading.classList.add('hidden');
    alert('Failed to analyze data: ' + error.message);
  }
}

function hideAllSections() {
  statsSection.classList.add('hidden');
  sentimentSection.classList.add('hidden');
  trendsSection.classList.add('hidden');
  topPostsSection.classList.add('hidden');
  aiInsightsSection.classList.add('hidden');
  document.getElementById('exportButtons').classList.add('hidden');
}

function displayStats(posts, totalCommentsFetched) {
  const totalPosts = posts.length;
  const totalComments = posts.reduce((sum, p) => sum + (p.engagement?.comments || 0), 0);
  const totalScore = posts.reduce((sum, p) => sum + (p.engagement?.score || 0), 0);
  const avgEngagement = Math.round(totalScore / totalPosts);

  document.getElementById('totalPosts').textContent = totalPosts.toLocaleString();
  
  // Show fetched comments count if applicable
  const commentsText = totalCommentsFetched > 0 
    ? `${totalComments.toLocaleString()} (${totalCommentsFetched} fetched)`
    : totalComments.toLocaleString();
  document.getElementById('totalComments').textContent = commentsText;
  
  document.getElementById('totalScore').textContent = totalScore.toLocaleString();
  document.getElementById('avgEngagement').textContent = avgEngagement.toLocaleString();
}

function displaySentiment(posts, includeComments) {
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'best', 'awesome', 'happy', 'bullish', 'moon', 'profit', 'win', 'success'];
  const negativeWords = ['bad', 'terrible', 'worst', 'hate', 'awful', 'scam', 'crash', 'bearish', 'dump', 'loss', 'fail', 'dead'];

  let positive = 0, neutral = 0, negative = 0;

  posts.forEach(p => {
    let text = (p.title + ' ' + (p.content || '')).toLowerCase();
    
    // Include comment text if comments were fetched
    if (includeComments && p.comments && p.comments.length > 0) {
      const commentText = p.comments.map(c => c.body).join(' ').toLowerCase();
      text += ' ' + commentText;
    }

    const hasPositive = positiveWords.some(w => text.includes(w));
    const hasNegative = negativeWords.some(w => text.includes(w));

    if (hasPositive && !hasNegative) positive++;
    else if (hasNegative && !hasPositive) negative++;
    else neutral++;
  });

  const total = posts.length;
  const posPercent = Math.round((positive / total) * 100);
  const neuPercent = Math.round((neutral / total) * 100);
  const negPercent = Math.round((negative / total) * 100);

  document.getElementById('positiveBar').style.width = `${posPercent}%`;
  document.getElementById('positivePercent').textContent = `${posPercent}%`;
  
  document.getElementById('neutralBar').style.width = `${neuPercent}%`;
  document.getElementById('neutralPercent').textContent = `${neuPercent}%`;
  
  document.getElementById('negativeBar').style.width = `${negPercent}%`;
  document.getElementById('negativePercent').textContent = `${negPercent}%`;

  return { positive, neutral, negative };
}

function displayTrends(posts, includeComments) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'theirs', 'there', 'from', 'into', 'onto', 'upon',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must',
    'not', 'no', 'yes', 'what', 'when', 'where', 'who', 'why', 'how', 'which', 'all', 'any', 'some', 'each', 'every',
    'just', 'only', 'also', 'more', 'than', 'then', 'now', 'so', 'very', 'too', 'much', 'many', 'most', 'such',
    'get', 'got', 'make', 'made', 'take', 'took', 'see', 'saw', 'come', 'came', 'go', 'went', 'know', 'think',
    'like', 'want', 'use', 'used', 'look', 'need', 'feel', 'become', 'leave', 'put',
    'post', 'reddit', 'comment', 'thread', 'subreddit', 'upvote', 'downvote',
    'today', 'yesterday', 'tomorrow', 'week', 'month', 'year', 'time', 'day', 'hour',
    'first', 'last', 'next', 'before', 'after', 'since', 'until', 'about', 'over', 'under',
    'show', 'shows', 'showing', 'here', 'there', 'where', 'when', 'why', 'how',
    'your', 'said', 'going', 'right', 'already', 'other', 'people', 'really', 'good', 'back',
    'still', 'even', 'well', 'way', 'thing', 'things', 'something', 'someone', 'everyone',
    'anyone', 'nothing', 'everything', 'anything', 'yeah', 'actually', 'pretty', 'lot',
    'though', 'always', 'never', 'maybe', 'probably', 'sure', 'mean', 'means', 'seems',
    'point', 'kind', 'around', 'down', 'saying', 'say', 'says', 'tell', 'told', 'ask',
    'asked', 'asking', 'thought', 'find', 'found', 'seem', 'give', 'given', 'makes',
    'trying', 'tried', 'try', 'doing', 'done', 'say', 'tell', 'talking', 'talk'
  ]);

  const words = {};
  const wordPosts = {};

  posts.forEach(p => {
    let text = (p.title + ' ' + (p.content || '')).toLowerCase();
    
    if (includeComments && p.comments && p.comments.length > 0) {
      const commentText = p.comments.map(c => c.body).join(' ').toLowerCase();
      text += ' ' + commentText;
    }

    const cleaned = text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\d+/g, '');
    
    const wordsInPost = new Set();
    cleaned.split(/\s+/).forEach(word => {
      if (word.length >= 5 && !stopWords.has(word.toLowerCase())) {
        words[word] = (words[word] || 0) + 1;
        wordsInPost.add(word);
      }
    });

    wordsInPost.forEach(word => {
      if (!wordPosts[word]) {
        wordPosts[word] = [];
      }
      wordPosts[word].push({
        title: p.title,
        subreddit: p.metadata?.subreddit || 'unknown',
        url: p.url,
        score: p.engagement?.score || 0
      });
    });
  });

  const sorted = Object.entries(words)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  if (sorted.length === 0) {
    document.getElementById('trendsList').innerHTML = '<em>No significant trends detected</em>';
    return [];
  }

  const maxCount = sorted[0][1];

  const html = sorted.map(([word, count], index) => {
    const percentage = ((count / maxCount) * 100).toFixed(0);
    const tier = percentage > 70 ? 'high' : percentage > 40 ? 'medium' : 'low';
    const relatedPosts = wordPosts[word] || [];
    const topPosts = relatedPosts
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    
    // Create unique ID for each trend item
    const trendId = `trend-${word.replace(/[^a-z0-9]/gi, '')}-${index}`;
    
    return `
      <details class="trend-item trend-${tier}" id="${trendId}">
        <summary class="trend-summary">
          <span class="trend-word">${escapeHtml(word)}</span>
          <span class="trend-count">${count}</span>
          <span class="trend-arrow">▼</span>
        </summary>
        <div class="trend-contexts">
          <div class="context-header">
            Found in ${relatedPosts.length} post${relatedPosts.length > 1 ? 's' : ''} (showing top ${topPosts.length}):
          </div>
          ${topPosts.map((post, postIndex) => `
            <div class="context-post">
              <a href="${post.url}" target="_blank" rel="noopener" class="context-post-title">
                ${escapeHtml(post.title)}
              </a>
              <div class="context-post-meta">
                <span class="context-subreddit">r/${escapeHtml(post.subreddit)}</span>
                <span class="context-score">↑ ${post.score.toLocaleString()}</span>
              </div>
            </div>
          `).join('')}
          ${relatedPosts.length > 5 ? `
            <div class="context-more">
              +${relatedPosts.length - 5} more post${relatedPosts.length - 5 > 1 ? 's' : ''}
            </div>
          ` : ''}
        </div>
      </details>
    `;
  }).join('');

  document.getElementById('trendsList').innerHTML = html;
  
  return sorted.map(([word, count]) => ({ word, count }));
}

function displayTopPosts(posts) {
  const top = [...posts]
    .sort((a, b) => b.engagement.score - a.engagement.score)
    .slice(0, 5);

  const html = top.map(p => {
    const hasComments = p.comments && p.comments.length > 0;
    const hasContent = p.content && p.content.trim().length > 0;
    
    return `
      <div class="top-post-item">
        <div class="post-header">
          <span class="post-subreddit">r/${escapeHtml(p.metadata?.subreddit || '')}</span>
          <span class="post-score">↑ ${p.engagement.score.toLocaleString()}</span>
        </div>
        <a href="${p.url}" target="_blank" rel="noopener" class="post-title">${escapeHtml(p.title)}</a>
        <div class="post-meta">
          <span>${p.engagement.comments} comments</span>
          <span>by ${escapeHtml(p.author)}</span>
          <span class="post-date">${new Date(p.createdAt).toLocaleDateString()}</span>
        </div>
        
        ${hasContent ? `
          <details class="post-content-toggle">
            <summary class="content-summary">
              <span class="arrow">▶</span>
              View post content
            </summary>
            <div class="post-content">
              ${escapeHtml(p.content)}
            </div>
          </details>
        ` : ''}
        
        ${hasComments ? `
          <details class="post-comments-toggle">
            <summary class="comments-summary">
              <span class="arrow">▶</span>
              View ${p.comments.length} fetched comment${p.comments.length > 1 ? 's' : ''}
            </summary>
            <div class="comments-list">
              ${p.comments.map(c => `
                <div class="comment-item">
                  <div class="comment-header">
                    <span class="comment-author">${escapeHtml(c.author)}</span>
                    <span class="comment-score">↑ ${c.score.toLocaleString()}</span>
                  </div>
                  <div class="comment-body">${escapeHtml(c.body)}</div>
                  <div class="comment-meta">
                    ${new Date(c.createdAt).toLocaleDateString()} at ${new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              `).join('')}
            </div>
          </details>
        ` : ''}
      </div>
    `;
  }).join('');

  document.getElementById('topPostsList').innerHTML = html;
  
  return top;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Export handlers
document.getElementById('exportCSV').addEventListener('click', async () => {
  if (!currentAnalyticsData) {
    alert('Run analysis first');
    return;
  }

  try {
    const response = await fetch('/api/analytics/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: currentAnalyticsData, format: 'csv' })
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    alert('Export failed: ' + error.message);
  }
});

document.getElementById('exportJSON').addEventListener('click', async () => {
  if (!currentAnalyticsData) {
    alert('Run analysis first');
    return;
  }

  try {
    const response = await fetch('/api/analytics/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: currentAnalyticsData, format: 'json' })
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    alert('Export failed: ' + error.message);
  }
});