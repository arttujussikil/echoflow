// ── State ──────────────────────────────────────────────────────────────────────
let lastResults = [];
let lastKeyword = '';

const formEl       = document.getElementById('searchForm');
const statusEl     = document.getElementById('status');
const resultsEl    = document.getElementById('results');
const analyzeBtn   = document.getElementById('analyzeBtn');
const aiPanel      = document.getElementById('aiPanel');
const aiContent    = document.getElementById('aiContent');
const modeSelect   = document.getElementById('mode');
const keywordWrap  = document.getElementById('keywordWrap');
const timeWrap     = document.getElementById('timeRangeWrap');
const channelsWrap = document.getElementById('channelsWrap');
const channelsLabel= document.getElementById('channelsLabel');
const channelsInput= document.getElementById('channels');

// ── Platform loading ───────────────────────────────────────────────────────────
async function loadPlatforms() {
  const container = document.getElementById('platformChips');
  try {
    const res = await fetch('/api/platforms');
    const { platforms } = await res.json();

    container.innerHTML = '';
    platforms.forEach((p, i) => {
      const chip = document.createElement('label');
      chip.className = 'platform-chip' + (i === 0 ? ' selected' : '');
      chip.innerHTML = `
        <input type="checkbox" name="platform" value="${p.id}" ${i === 0 ? 'checked' : ''} />
        <span class="dot"></span>
        ${p.displayName}
      `;
      chip.querySelector('input').addEventListener('change', () => {
        chip.classList.toggle('selected', chip.querySelector('input').checked);
        updateChannelsLabel();
      });
      container.appendChild(chip);
    });
    updateChannelsLabel();
  } catch {
    container.innerHTML = '<span style="color:#fca5a5;font-size:13px">Could not load platforms — is the server running?</span>';
  }
}

function getSelectedPlatforms() {
  return [...document.querySelectorAll('input[name="platform"]:checked')].map(el => el.value);
}

function updateChannelsLabel() {
  const selected = getSelectedPlatforms();
  if (selected.length === 1 && selected[0] === 'reddit') {
    channelsLabel.textContent = 'Subreddits';
    channelsInput.placeholder = 'e.g. programming, webdev, MachineLearning';
  } else if (selected.length === 1 && selected[0] === 'hackernews') {
    channelsLabel.textContent = 'Tags';
    channelsInput.placeholder = 'story, ask_hn, show_hn, job';
  } else if (selected.length === 1 && selected[0] === 'rss') {
    channelsLabel.textContent = 'Feed URLs';
    channelsInput.placeholder = 'https://hnrss.org/frontpage, https://reddit.com/r/programming/.rss';
  } else {
    channelsLabel.textContent = 'Channels';
    channelsInput.placeholder = 'subreddits / tags / feed URLs — comma-separated';
  }
}

// ── Mode selector ──────────────────────────────────────────────────────────────
modeSelect.addEventListener('change', () => {
  const m = modeSelect.value;
  keywordWrap.classList.toggle('hidden', m !== 'search');
  timeWrap.classList.toggle('hidden', m === 'latest');
});

// ── Build request payload ──────────────────────────────────────────────────────
function buildPayload() {
  const platforms = getSelectedPlatforms();
  if (!platforms.length) {
    setStatus('Select at least one platform.', 'error');
    return null;
  }

  const mode     = modeSelect.value;
  const keyword  = document.getElementById('keyword').value.trim();
  const channels = channelsInput.value.split(',').map(s => s.trim()).filter(Boolean);
  const timeRange= document.getElementById('timeRange').value;
  const limit    = Number(document.getElementById('limit').value) || 25;
  const minEngagement = Number(document.getElementById('minEngagement').value) || undefined;
  const postSort = document.querySelector('input[name="postSort"]:checked')?.value || undefined;
  const fetchComments = document.getElementById('fetchComments').checked;
  const commentLimit  = Number(document.getElementById('commentLimit').value) || 5;
  const commentSort   = document.getElementById('commentSort').value;
  const persist       = document.getElementById('persistToggle').checked;

  if (mode === 'search' && !keyword) {
    setStatus('Enter a keyword for Search mode.', 'error');
    return null;
  }

  return {
    platforms,
    mode,
    keyword: mode === 'search' ? keyword : undefined,
    channels,
    timeRange,
    limit,
    fetchComments,
    commentLimit,
    commentSort,
    persist,
    filters: { minEngagement, sortBy: postSort }
  };
}

// ── Search ─────────────────────────────────────────────────────────────────────
formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  await runSearch();
});

async function runSearch() {
  const payload = buildPayload();
  if (!payload) return;

  setStatus('Searching…');
  resultsEl.innerHTML = '';
  hideAI();
  lastResults = [];

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Search failed');
    }
    const data = await res.json();
    lastResults = data.results || [];
    lastKeyword = payload.keyword || '';

    let msg = `Found ${lastResults.length} post${lastResults.length !== 1 ? 's' : ''}`;
    if (data.platformErrors) {
      const failed = Object.keys(data.platformErrors).join(', ');
      msg += ` (${failed} had errors)`;
    }
    if (payload.persist && data.searchId) msg += ` — saved (id: ${data.searchId})`;
    setStatus(msg);

    renderResults(lastResults);

    if (lastResults.length > 0) {
      analyzeBtn.classList.add('visible');
    }
  } catch (err) {
    setStatus(friendlyError(err.message), 'error');
  }
}

// ── HTML / CSV exports ─────────────────────────────────────────────────────────
document.getElementById('viewHtml').addEventListener('click', async () => {
  const payload = buildPayload();
  if (!payload) return;
  const win = window.open('about:blank', '_blank');
  try {
    const res = await fetch('/api/search?format=html', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    win.document.write(await res.text());
    win.document.close();
  } catch (err) { win.close(); alert('Failed: ' + err.message); }
});

document.getElementById('downloadCsv').addEventListener('click', async () => {
  const payload = buildPayload();
  if (!payload) return;
  try {
    const res = await fetch('/api/search?format=csv', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const blob = await res.blob();
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `echoflow-export-${Date.now()}.csv`
    });
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch (err) { alert('Failed: ' + err.message); }
});

// ── AI Analysis ────────────────────────────────────────────────────────────────
analyzeBtn.addEventListener('click', async () => {
  if (!lastResults.length) return;

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing…';
  showAILoading();

  try {
    const res = await fetch('/api/analytics/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: lastResults, keyword: lastKeyword || undefined })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Analysis failed');
    renderAI(data);
  } catch (err) {
    showAIError(err.message);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = '✦ Analyze with AI';
  }
});

function showAILoading() {
  aiPanel.classList.add('visible');
  aiContent.innerHTML = `
    <div class="ai-loading">
      <div class="spinner"></div>
      <span>Running local AI analysis — this may take 30–60 seconds on first run…</span>
    </div>`;
}

function showAIError(msg) {
  aiPanel.classList.add('visible');
  const isDown = msg.toLowerCase().includes('ollama') || msg.toLowerCase().includes('503');
  aiContent.innerHTML = `<div class="ai-error">
    ${isDown
      ? `<strong>Ollama is not ready yet.</strong><br>
         The model may still be loading. Wait 30 seconds and try again.<br>
         On first run, Docker needs to download the model (~700 MB).<br>
         <small style="opacity:.6">${escapeHtml(msg)}</small>`
      : escapeHtml(msg)}
  </div>`;
}

function hideAI() {
  aiPanel.classList.remove('visible');
  aiContent.innerHTML = '';
  analyzeBtn.classList.remove('visible');
  analyzeBtn.disabled = false;
  analyzeBtn.innerHTML = '✦ Analyze with AI';
}

function renderAI(a) {
  const moodColor = {
    excited: '#34d399', curious: '#60a5fa', positive: '#34d399',
    negative: '#f87171', frustrated: '#f87171', critical: '#fb923c',
    mixed: '#a78bfa', neutral: '#94a3b8'
  }[a.mood] || '#a78bfa';

  const sentimentRows = [
    { label: 'Positive', cls: 'pos', pct: a.sentiment.positive },
    { label: 'Neutral',  cls: 'neu', pct: a.sentiment.neutral  },
    { label: 'Negative', cls: 'neg', pct: a.sentiment.negative  }
  ].map(r => `
    <div class="s-row">
      <span class="s-label">${r.label}</span>
      <div class="s-track"><div class="s-fill ${r.cls}" style="width:${r.pct}%"></div></div>
      <span class="s-pct">${r.pct}%</span>
    </div>`).join('');

  const themes = (a.themes || [])
    .map(t => `<span class="theme-chip">${escapeHtml(t)}</span>`).join('');

  const insights = (a.insights || [])
    .map(i => `<li>${escapeHtml(i)}</li>`).join('');

  aiContent.innerHTML = `
    <div class="ai-status-row">
      <span>${escapeHtml(String(a.postCount))} posts analysed</span>
      <span style="color:var(--line)">·</span>
      <span class="mood-badge" style="background:${moodColor}22;color:${moodColor}">${escapeHtml(a.mood)}</span>
    </div>

    <div class="ai-section">
      <div class="ai-section-title">Sentiment</div>
      <div class="sentiment-row">${sentimentRows}</div>
    </div>

    ${a.summary ? `
    <div class="ai-section">
      <div class="ai-section-title">Summary</div>
      <p class="ai-summary">${escapeHtml(a.summary)}</p>
    </div>` : ''}

    ${themes ? `
    <div class="ai-section">
      <div class="ai-section-title">Key Themes</div>
      <div class="themes">${themes}</div>
    </div>` : ''}

    ${insights ? `
    <div class="ai-section">
      <div class="ai-section-title">Insights</div>
      <ul class="insights">${insights}</ul>
    </div>` : ''}
  `;
}

// ── Results rendering ──────────────────────────────────────────────────────────
function renderResults(posts) {
  if (!posts.length) {
    resultsEl.innerHTML = '<p style="color:var(--muted)">No results found.</p>';
    return;
  }

  resultsEl.innerHTML = posts.map(p => {
    const title    = escapeHtml(p.title || '');
    const author   = escapeHtml(p.author || '');
    const score    = p.engagement?.score ?? 0;
    const comments = p.engagement?.comments ?? 0;
    const created  = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '';
    const url      = p.url || '#';
    const content  = escapeHtml((p.content || '').substring(0, 300));
    const hasMore  = (p.content || '').length > 300;
    const platform = p.platform || '';

    const badgeClass = platform === 'reddit' ? 'badge-reddit'
      : platform === 'hackernews' ? 'badge-hackernews'
      : 'badge-default';

    const commentsHtml = Array.isArray(p.comments) && p.comments.length
      ? `<details>
          <summary style="cursor:pointer;color:var(--accent);margin-top:8px;font-size:13px">
            Comments (${p.comments.length})
          </summary>
          <div class="comments">
            ${p.comments.map(c => `
              <div class="comment">
                <div class="meta">
                  <span class="author">${escapeHtml(c.author || '')}</span>
                  <span class="score">↑ ${c.score ?? 0}</span>
                </div>
                <div class="body">${escapeHtml(c.body || '')}</div>
              </div>`).join('')}
          </div>
        </details>`
      : '';

    return `
      <div class="card">
        <div class="card-h">
          <span class="platform-badge ${badgeClass}">${platform}</span>
          <a href="${url}" target="_blank" rel="noopener" class="title">${title}</a>
        </div>
        <div class="meta">
          <span>↑ ${score}</span>
          <span>💬 ${comments}</span>
          <span>${author}</span>
          <span>${created}</span>
        </div>
        ${content ? `<pre class="content">${content}${hasMore ? '…' : ''}</pre>` : ''}
        ${commentsHtml}
      </div>`;
  }).join('');
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function setStatus(msg, type) {
  statusEl.innerHTML = escapeHtml(msg);
  statusEl.className = type === 'error' ? 'status error' : 'status';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function friendlyError(msg) {
  if (msg.includes('Rate limit')) return '⚠ Rate limit hit — wait a few minutes and try again.';
  if (msg.includes('timeout') || msg.includes('Network')) return '🔌 Connection error — check your internet.';
  if (msg.includes('not found')) return '❌ Resource not found — check your channel names.';
  return msg;
}

// ── Init ───────────────────────────────────────────────────────────────────────
loadPlatforms();
