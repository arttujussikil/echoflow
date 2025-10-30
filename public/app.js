const formEl = document.getElementById('searchForm');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  await runSearch();
});

document.getElementById('viewHtml').addEventListener('click', async () => {
  const payload = buildPayload();
  if (!payload) return;
  const url = '/api/search?format=html';
  const win = window.open('about:blank', '_blank');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const html = await response.text();
    win.document.write(html);
    win.document.close();
  } catch (error) {
    win.close();
    alert('Failed to generate HTML view: ' + error.message);
  }
});

document.getElementById('downloadCsv').addEventListener('click', async () => {
  const payload = buildPayload();
  if (!payload) return;
  const url = '/api/search?format=csv';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `reddit-export-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    alert('Failed to download CSV: ' + error.message);
  }
});

function buildPayload() {
  const subreddits = document.getElementById('subreddits').value
    .split(',').map(s => s.trim()).filter(Boolean);
  const mode = document.getElementById('mode').value;
  const keyword = document.getElementById('keyword').value.trim();
  const timeRange = document.getElementById('timeRange').value;
  const limit = Number(document.getElementById('limit').value);
  const minEngagement = Number(document.getElementById('minEngagement').value) || undefined;
  const postSort = document.querySelector('input[name="postSort"]:checked')?.value || undefined;
  const fetchComments = document.getElementById('fetchComments').checked;
  const commentLimit = Number(document.getElementById('commentLimit').value);
  const commentSort = document.getElementById('commentSort').value;
  const persist = document.getElementById('persistToggle').checked;

  if (!subreddits.length) {
    statusEl.textContent = 'Please enter at least one subreddit';
    statusEl.className = 'status error';
    return null;
  }

  return {
    mode,
    platforms: ['reddit'],
    subreddits,
    keyword: mode === 'search' ? keyword : undefined,
    timeRange,
    limit,
    fetchComments,
    commentLimit,
    commentSort,
    persist, // NEW
    filters: {
      minEngagement,
      sortBy: postSort
    }
  };
}

async function runSearch() {
  const payload = buildPayload();
  if (!payload) return;

  statusEl.textContent = 'Searching...';
  statusEl.className = 'status';
  resultsEl.innerHTML = '';

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Search failed');
    }

    const data = await response.json();
    const posts = data.results || [];

    statusEl.textContent = payload.persist && data.searchId
      ? `Found ${posts.length} posts. Saved to DB (searchId: ${data.searchId}).`
      : `Found ${posts.length} posts`;
    statusEl.className = 'status';
    renderResults(posts);
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status error';
    
    if (error.message.includes('Rate limit')) {
      statusEl.innerHTML = `
        <strong>⚠️ Rate Limit Exceeded</strong><br>
        Reddit is temporarily blocking requests. Please wait a few minutes and try again.
      `;
    } else if (error.message.includes('timeout') || error.message.includes('Network')) {
      statusEl.innerHTML = `
        <strong>🔌 Connection Error</strong><br>
        Unable to reach Reddit. Check your internet connection and try again.
      `;
    } else if (error.message.includes('not found')) {
      statusEl.innerHTML = `
        <strong>❌ Not Found</strong><br>
        One or more subreddits don't exist. Please check the names and try again.
      `;
    }
  }
}

function renderResults(posts) {
  if (!posts || posts.length === 0) {
    resultsEl.innerHTML = '<p style="color:var(--muted);">No results found.</p>';
    return;
  }

  resultsEl.innerHTML = posts.map(p => {
    const sr = p.metadata?.subreddit || '';
    const title = escapeHtml(p.title || '');
    const author = escapeHtml(p.author || '');
    const score = p.engagement?.score ?? p.score ?? 0;
    const commentCount = p.engagement?.comments ?? p.num_comments ?? 0;
    const created = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '';
    const url = p.url || '#';

    const contentRaw = p.content || p.selftext || '';
    const content = contentRaw ? escapeHtml(contentRaw).substring(0, 300) : '';
    const comments = Array.isArray(p.comments) ? p.comments : [];

    return `
      <div class="card">
        <div class="card-h">
          <span class="sr">r/${sr}</span>
          <a href="${url}" target="_blank" rel="noopener" class="title">${title}</a>
        </div>
        <div class="meta">
          <span>↑ ${score}</span>
          <span>💬 ${commentCount}</span>
          <span>by ${author}</span>
          <span>${created}</span>
        </div>
        ${content ? `<pre class="content">${content}${contentRaw.length > 300 ? '...' : ''}</pre>` : ''}
        ${comments.length > 0 ? `
          <details>
            <summary style="cursor:pointer;color:var(--accent);margin-top:8px;">
              Comments (${comments.length})
            </summary>
            <div class="comments">
              ${comments.map(c => `
                <div class="comment">
                  <div class="meta">
                    <span class="author">${escapeHtml(c.author || '')}</span>
                    <span class="score">↑ ${c.score ?? 0}</span>
                  </div>
                  <div class="body">${escapeHtml(c.body || c.text || '')}</div>
                </div>
              `).join('')}
            </div>
          </details>
        ` : ''}
      </div>
    `;
  }).join('');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Mode selector logic
const modeSelect = document.getElementById('mode');
const keywordWrap = document.getElementById('keywordWrap');
const timeRangeWrap = document.getElementById('timeRangeWrap');

modeSelect.addEventListener('change', () => {
  const mode = modeSelect.value;
  
  if (mode === 'search') {
    keywordWrap.classList.remove('hidden');
    timeRangeWrap.classList.remove('hidden');
  } else if (mode === 'top') {
    keywordWrap.classList.add('hidden');
    timeRangeWrap.classList.remove('hidden');
  } else {
    keywordWrap.classList.add('hidden');
    timeRangeWrap.classList.add('hidden');
  }
});