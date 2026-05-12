// ── DOM refs ───────────────────────────────────────────────────────────────────
const form             = document.getElementById('analyticsForm');
const loading          = document.getElementById('loading');
const loadingTitle     = document.getElementById('loadingTitle');
const loadingStatus    = document.getElementById('loadingStatus');
const progressFill     = document.getElementById('progressFill');
const statsSection     = document.getElementById('statsSection');
const sentimentSection = document.getElementById('sentimentSection');
const trendsSection    = document.getElementById('trendsSection');
const topPostsSection  = document.getElementById('topPostsSection');
const aiInsightsSection= document.getElementById('aiInsightsSection');
const modeSelect       = document.getElementById('mode');
const keywordWrap      = document.getElementById('keywordWrap');
const timeRangeWrap    = document.getElementById('timeRangeWrap');
const channelsLabel    = document.getElementById('channelsLabel');
const channelsInput    = document.getElementById('channels');

let currentAnalyticsData = null;
let allAnalysedPosts = [];
let activeSentimentFilter = null;

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
    channelsInput.placeholder = 'e.g. programming, technology, worldnews';
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
  timeRangeWrap.classList.toggle('hidden', m === 'latest');
});

// ── Comment options toggle ─────────────────────────────────────────────────────
document.getElementById('fetchComments').addEventListener('change', function () {
  document.getElementById('commentOptions').classList.toggle('hidden', !this.checked);
});

// ── Form submit ────────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await analyzeData();
});

function updateProgress(percent, title, status, stepIndex) {
  progressFill.style.width = `${percent}%`;
  loadingTitle.textContent = title;
  loadingStatus.textContent = status;
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`stepIcon${i}`).textContent = i < stepIndex ? '✅' : '⏳';
  }
}

// ── Main analysis flow ─────────────────────────────────────────────────────────
async function analyzeData() {
  const platforms = getSelectedPlatforms();
  if (!platforms.length) { alert('Select at least one platform.'); return; }

  const mode        = modeSelect.value;
  const keyword     = document.getElementById('keyword').value.trim();
  const channels    = channelsInput.value.split(',').map(s => s.trim()).filter(Boolean);
  const timeRange   = document.getElementById('timeRange').value;
  const limit       = Number(document.getElementById('minPosts').value) || 25;
  const postSort    = document.querySelector('input[name="postSort"]:checked')?.value || undefined;
  const fetchComments  = document.getElementById('fetchComments').checked;
  const commentLimit   = Number(document.getElementById('commentLimit').value) || 5;
  const commentSort    = document.getElementById('commentSort').value;

  if (mode === 'search' && !keyword) { alert('Enter a keyword for Search mode.'); return; }

  loading.classList.remove('hidden');
  hideAllSections();
  allAnalysedPosts = [];
  activeSentimentFilter = null;
  clearSentimentHighlight();
  document.getElementById('sentimentFilterPanel').style.display = 'none';
  updateProgress(0, 'Starting analysis…', 'Preparing request…', 1);

  try {
    // ── Step 1: Collect posts ──────────────────────────────────────────────────
    updateProgress(10, 'Fetching data…', `Querying ${platforms.join(', ')}…`, 1);

    const searchRes = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platforms,
        mode,
        keyword: mode === 'search' ? keyword : undefined,
        channels,
        timeRange,
        limit,
        fetchComments,
        commentLimit,
        commentSort,
        filters: { sortBy: postSort }
      })
    });

    if (!searchRes.ok) {
      const err = await searchRes.json();
      throw new Error(err.error || 'Search failed');
    }

    updateProgress(40, 'Processing data…', 'Parsing results…', 1);
    const data = await searchRes.json();
    const posts = data.results || [];

    if (posts.length === 0) {
      loading.classList.add('hidden');
      alert('No posts found for the selected criteria.');
      return;
    }

    // ── Step 2: Stats (instant) ────────────────────────────────────────────────
    updateProgress(50, 'Calculating statistics…', `Processing ${posts.length} posts…`, 2);
    await tick();
    displayStats(posts, fetchComments);
    statsSection.classList.remove('hidden');

    // ── Step 3: AI analysis ────────────────────────────────────────────────────
    const aiStatus = await fetch('/api/analytics/status').then(r => r.json()).catch(() => ({}));
    const aiLabel = aiStatus.nvidia
      ? `NVIDIA NIM (${(aiStatus.nvidiaModel || 'mistral-nemotron').split('/').pop()})`
      : `Ollama (${aiStatus.model || 'llama3.2:3b'})`;
    updateProgress(60, 'Running AI analysis…', `Sending posts to ${aiLabel}…`, 2);
    aiInsightsSection.classList.remove('hidden');
    showAILoading();

    let aiAnalysis = null;
    try {
      const aiRes = await fetch('/api/analytics/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts, keyword: keyword || undefined })
      });
      const aiData = await aiRes.json();
      if (!aiRes.ok) throw new Error(aiData.error || 'AI analysis failed');
      aiAnalysis = aiData;
    } catch (aiErr) {
      showAIError(aiErr.message);
    }

    // Sentiment from AI (or keyword fallback if AI failed)
    updateProgress(80, 'Computing sentiment…', 'Mapping results…', 3);
    await tick();
    if (aiAnalysis) {
      displayAISentiment(aiAnalysis.sentiment);
    } else {
      displayKeywordSentiment(posts, fetchComments);
    }
    sentimentSection.classList.remove('hidden');

    if (aiAnalysis) showAIResults(aiAnalysis);

    // ── Step 4: Trends & top posts ─────────────────────────────────────────────
    updateProgress(90, 'Extracting trends…', 'Identifying keywords…', 4);
    await tick();
    displayTrends(posts, fetchComments);
    trendsSection.classList.remove('hidden');

    displayTopPosts(posts);
    topPostsSection.classList.remove('hidden');

    // ── Done ───────────────────────────────────────────────────────────────────
    allAnalysedPosts = posts;
    classifyPostsSentiment(aiAnalysis?.sentiment);
    wireSentimentBars();
    currentAnalyticsData = { posts, platforms, keyword, timeRange };
    updateProgress(100, 'Complete!', `Analysed ${posts.length} posts`, 4);
    await tick(300);
    loading.classList.add('hidden');
    document.getElementById('exportButtons').classList.remove('hidden');

  } catch (error) {
    console.error('Analytics error:', error);
    updateProgress(0, 'Error', error.message, 1);
    await tick(1500);
    loading.classList.add('hidden');
    alert('Failed to analyse data: ' + error.message);
  }
}

// ── AI display helpers ─────────────────────────────────────────────────────────
function showAILoading() {
  document.getElementById('aiLoadingState').classList.remove('hidden');
  document.getElementById('aiResultsState').classList.add('hidden');
  document.getElementById('aiErrorState').classList.add('hidden');
}

function showAIError(msg) {
  document.getElementById('aiLoadingState').classList.add('hidden');
  document.getElementById('aiResultsState').classList.add('hidden');
  const errEl = document.getElementById('aiErrorState');
  errEl.classList.remove('hidden');
  const isDown = msg.toLowerCase().includes('ollama') || msg.toLowerCase().includes('503');
  errEl.innerHTML = isDown
    ? `<div class="ai-error"><strong>Ollama not ready.</strong><br>The model may still be loading. Wait 30 s and try again. On first run, Docker downloads the model (~2 GB).<br><small style="opacity:.6">${escapeHtml(msg)}</small></div>`
    : `<div class="ai-error">${escapeHtml(msg)}</div>`;
}

function showAIResults(a) {
  document.getElementById('aiLoadingState').classList.add('hidden');
  document.getElementById('aiErrorState').classList.add('hidden');

  const moodColor = {
    excited: '#34d399', curious: '#60a5fa', positive: '#34d399',
    negative: '#f87171', frustrated: '#f87171', critical: '#fb923c',
    mixed: '#a78bfa', neutral: '#94a3b8'
  }[a.mood] || '#a78bfa';

  const providerLabel = a.provider
    ? (a.provider.startsWith('nvidia') ? '⚡ NVIDIA NIM' : '🖥 Ollama')
    : '';
  document.getElementById('aiPostCount').textContent =
    `${a.postCount} posts analysed${providerLabel ? ' · ' + providerLabel : ''}`;
  const badge = document.getElementById('aiMoodBadge');
  badge.textContent = a.mood;
  badge.style.background = moodColor + '22';
  badge.style.color = moodColor;

  document.getElementById('aiSummary').textContent = a.summary || '';

  const themesEl = document.getElementById('aiThemes');
  const themesWrap = document.getElementById('aiThemesWrap');
  if (a.themes && a.themes.length) {
    themesEl.innerHTML = a.themes.map(t => `<span class="theme-chip">${escapeHtml(t)}</span>`).join('');
    themesWrap.classList.remove('hidden');
  } else {
    themesWrap.classList.add('hidden');
  }

  const insightsList = document.getElementById('aiInsightsList');
  const insightsWrap = document.getElementById('aiInsightsWrap');
  if (a.insights && a.insights.length) {
    insightsList.innerHTML = a.insights.map(i => `<li>${escapeHtml(i)}</li>`).join('');
    insightsWrap.classList.remove('hidden');
  } else {
    insightsWrap.classList.add('hidden');
  }

  document.getElementById('aiResultsState').classList.remove('hidden');
}

// ── Sentiment ──────────────────────────────────────────────────────────────────
function displayAISentiment(s) {
  setSentimentBar('positive', s.positive ?? 0);
  setSentimentBar('neutral',  s.neutral  ?? 0);
  setSentimentBar('negative', s.negative ?? 0);
}

function setSentimentBar(key, pct) {
  document.getElementById(key + 'Bar').style.width = pct + '%';
  document.getElementById(key + 'Percent').textContent = pct + '%';
}

function displayKeywordSentiment(posts, includeComments) {
  const pos = ['good','great','excellent','amazing','love','best','awesome','happy','bullish','profit','win','success'];
  const neg = ['bad','terrible','worst','hate','awful','scam','crash','bearish','dump','loss','fail'];
  let positive = 0, neutral = 0, negative = 0;
  posts.forEach(p => {
    let text = (p.title + ' ' + (p.content || '')).toLowerCase();
    if (includeComments && p.comments) text += ' ' + p.comments.map(c => c.body).join(' ').toLowerCase();
    const hasPos = pos.some(w => text.includes(w));
    const hasNeg = neg.some(w => text.includes(w));
    if (hasPos && !hasNeg) positive++;
    else if (hasNeg && !hasPos) negative++;
    else neutral++;
  });
  const t = posts.length;
  setSentimentBar('positive', Math.round((positive / t) * 100));
  setSentimentBar('neutral',  Math.round((neutral  / t) * 100));
  setSentimentBar('negative', Math.round((negative / t) * 100));
}

// ── Stats ──────────────────────────────────────────────────────────────────────
function displayStats(posts, fetchComments) {
  const totalScore    = posts.reduce((s, p) => s + (p.engagement?.score || 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.engagement?.comments || 0), 0);
  const fetchedCount  = fetchComments ? posts.reduce((s, p) => s + (p.comments?.length || 0), 0) : 0;

  document.getElementById('totalPosts').textContent = posts.length.toLocaleString();
  document.getElementById('totalComments').textContent = fetchedCount > 0
    ? `${totalComments.toLocaleString()} (${fetchedCount} fetched)`
    : totalComments.toLocaleString();
  document.getElementById('totalScore').textContent = totalScore.toLocaleString();
  document.getElementById('avgEngagement').textContent = Math.round(totalScore / posts.length).toLocaleString();
}

// ── Trending topics (unchanged, works well) ────────────────────────────────────
function displayTrends(posts, includeComments) {
  const stopWords = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with','is','are','was','were','be','been','being',
    'this','that','these','those','it','its','they','them','their','theirs','there','from','into','onto','upon',
    'have','has','had','do','does','did','will','would','could','should','can','may','might','must',
    'not','no','yes','what','when','where','who','why','how','which','all','any','some','each','every',
    'just','only','also','more','than','then','now','so','very','too','much','many','most','such',
    'get','got','make','made','take','took','see','saw','come','came','go','went','know','think',
    'like','want','use','used','look','need','feel','become','leave','put',
    'post','reddit','comment','thread','subreddit','upvote','downvote',
    'today','yesterday','tomorrow','week','month','year','time','day','hour',
    'first','last','next','before','after','since','until','about','over','under',
    'show','shows','showing','here','there','where','when','why','how',
    'your','said','going','right','already','other','people','really','good','back',
    'still','even','well','way','thing','things','something','someone','everyone',
    'anyone','nothing','everything','anything','yeah','actually','pretty','lot',
    'though','always','never','maybe','probably','sure','mean','means','seems',
    'point','kind','around','down','saying','say','says','tell','told','ask',
    'asked','asking','thought','find','found','seem','give','given','makes',
    'trying','tried','try','doing','done','talking','talk'
  ]);

  const words = {};
  const wordPosts = {};

  posts.forEach(p => {
    let text = (p.title + ' ' + (p.content || '')).toLowerCase();
    if (includeComments && p.comments) text += ' ' + p.comments.map(c => c.body).join(' ').toLowerCase();

    const cleaned = text.replace(/https?:\/\/\S+/g, '').replace(/[^\w\s]/g, ' ').replace(/\d+/g, '');
    const seen = new Set();
    cleaned.split(/\s+/).forEach(word => {
      if (word.length >= 5 && !stopWords.has(word)) {
        words[word] = (words[word] || 0) + 1;
        if (!seen.has(word)) {
          seen.add(word);
          if (!wordPosts[word]) wordPosts[word] = [];
          wordPosts[word].push({ title: p.title, url: p.url, score: p.engagement?.score || 0, platform: p.platform });
        }
      }
    });
  });

  const sorted = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (!sorted.length) {
    document.getElementById('trendsList').innerHTML = '<em>No significant trends detected</em>';
    return;
  }

  const maxCount = sorted[0][1];
  document.getElementById('trendsList').innerHTML = sorted.map(([word, count], idx) => {
    const pct = ((count / maxCount) * 100).toFixed(0);
    const tier = pct > 70 ? 'high' : pct > 40 ? 'medium' : 'low';
    const topPosts = (wordPosts[word] || []).sort((a, b) => b.score - a.score).slice(0, 5);
    const total = (wordPosts[word] || []).length;
    return `
      <details class="trend-item trend-${tier}">
        <summary class="trend-summary">
          <span class="trend-word">${escapeHtml(word)}</span>
          <span class="trend-count">${count}</span>
          <span class="trend-arrow">▼</span>
        </summary>
        <div class="trend-contexts">
          <div class="context-header">Found in ${total} post${total !== 1 ? 's' : ''} (showing top ${topPosts.length}):</div>
          ${topPosts.map(post => `
            <div class="context-post">
              <a href="${post.url}" target="_blank" rel="noopener" class="context-post-title">${escapeHtml(post.title)}</a>
              <div class="context-post-meta">
                <span class="context-subreddit">${escapeHtml(post.platform)}</span>
                <span class="context-score">↑ ${post.score.toLocaleString()}</span>
              </div>
            </div>`).join('')}
          ${total > 5 ? `<div class="context-more">+${total - 5} more</div>` : ''}
        </div>
      </details>`;
  }).join('');
}

// ── Top posts ──────────────────────────────────────────────────────────────────
function displayTopPosts(posts) {
  const top = [...posts].sort((a, b) => b.engagement.score - a.engagement.score).slice(0, 5);
  document.getElementById('topPostsList').innerHTML = top.map(p => {
    const hasContent  = p.content && p.content.trim();
    const hasComments = Array.isArray(p.comments) && p.comments.length > 0;
    return `
      <div class="top-post-item">
        <div class="post-header">
          <span class="post-subreddit">${escapeHtml(p.platform)}</span>
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
            <summary class="content-summary"><span class="arrow">▶</span> View content</summary>
            <div class="post-content">${escapeHtml(p.content)}</div>
          </details>` : ''}
        ${hasComments ? `
          <details class="post-comments-toggle">
            <summary class="comments-summary"><span class="arrow">▶</span> View ${p.comments.length} comment${p.comments.length !== 1 ? 's' : ''}</summary>
            <div class="comments-list">
              ${p.comments.map(c => `
                <div class="comment-item">
                  <div class="comment-header">
                    <span class="comment-author">${escapeHtml(c.author)}</span>
                    <span class="comment-score">↑ ${c.score.toLocaleString()}</span>
                  </div>
                  <div class="comment-body">${escapeHtml(c.body)}</div>
                </div>`).join('')}
            </div>
          </details>` : ''}
      </div>`;
  }).join('');
}

// ── Sentiment classification + filtering ──────────────────────────────────────
const POS_WORDS = new Set([
  'win','wins','won','victory','champion','record','breakthrough','launch','launches','launched',
  'deal','agreement','approved','peace','rescue','rescued','survive','survived','recover','recovery',
  'growth','grow','grows','improve','improved','boost','rise','rising','gain','gains','increase','expand',
  'upgrade','advance','progress','strengthen','best','top','success','celebrate','positive','innovative',
  'profit','revenue','surplus','invest','funding','partnership','hire','hiring','jobs','employ','save',
  'protect','benefit','achieve','solution','create','build','open','cure','vaccine','effective','discover',
]);

const NEG_WORDS = new Set([
  'dead','death','die','dies','died','kill','kills','killed','murder','shooting','shot','attack','attacks',
  'explosion','bomb','terror','war','conflict','battle','riot','violence','crash','disaster','catastrophe',
  'crisis','emergency','flood','earthquake','hurricane','wildfire','fire','collapse','epidemic','pandemic',
  'arrest','charged','indicted','convicted','sentenced','prison','scandal','corruption','fraud','hack',
  'stolen','theft','robbery','abuse','fail','failed','failure','bankrupt','recession','decline','drop',
  'loss','lose','lost','cut','layoff','fired','resign','shutdown','ban','sanction','restrict','fine',
  'threat','warning','danger','toxic','harmful','damage','injured','hurt','wounded','suffer',
]);


function classifyPostsSentiment(aiSentiment) {
  if (!allAnalysedPosts.length) return;

  // Score each post relatively — keyword score is used only for ranking, not hard cutoffs
  const scored = allAnalysedPosts.map(p => ({ p, score: rawScore(p) }));
  scored.sort((a, b) => b.score - a.score);

  const n = scored.length;
  const s = aiSentiment || { positive: 33, neutral: 34, negative: 33 };
  const posCount = Math.round(n * s.positive / 100);
  const negCount = Math.round(n * s.negative / 100);

  scored.forEach((item, i) => {
    if (i < posCount) item.p._sentiment = 'positive';
    else if (i >= n - negCount && negCount > 0) item.p._sentiment = 'negative';
    else item.p._sentiment = 'neutral';
  });
}

function rawScore(post) {
  const title = (post.title || '').toLowerCase();
  const body  = (post.content || '').substring(0, 400).toLowerCase();
  const tw = title.match(/\b\w+\b/g) || [];
  const bw = body.match(/\b\w+\b/g)  || [];
  let score = 0;
  for (const w of tw) { if (POS_WORDS.has(w)) score += 3; if (NEG_WORDS.has(w)) score -= 3; }
  for (const w of bw) { if (POS_WORDS.has(w)) score++;    if (NEG_WORDS.has(w)) score--; }
  return score;
}

const SENT_COLOR = { positive: '#10b981', neutral: '#6366f1', negative: '#ef4444' };

function wireSentimentBars() {
  ['positive', 'neutral', 'negative'].forEach(s => {
    const row = document.getElementById(`sRow${s.charAt(0).toUpperCase() + s.slice(1)}`);
    if (!row) return;
    row.addEventListener('click', () => {
      if (activeSentimentFilter === s) {
        activeSentimentFilter = null;
        clearSentimentHighlight();
        document.getElementById('sentimentFilterPanel').style.display = 'none';
      } else {
        activeSentimentFilter = s;
        clearSentimentHighlight();
        row.classList.add('s-active');
        renderSentimentFiltered(s);
      }
    });
  });
  document.getElementById('clearSentimentFilter').addEventListener('click', () => {
    activeSentimentFilter = null;
    clearSentimentHighlight();
    document.getElementById('sentimentFilterPanel').style.display = 'none';
  });
}

function clearSentimentHighlight() {
  ['sRowPositive','sRowNeutral','sRowNegative'].forEach(id => {
    document.getElementById(id)?.classList.remove('s-active');
  });
}

function renderSentimentFiltered(s) {
  const filtered = allAnalysedPosts.filter(p => p._sentiment === s);
  const panel = document.getElementById('sentimentFilterPanel');
  const label = document.getElementById('sentimentFilterLabel');
  const list  = document.getElementById('sentimentFilteredPosts');

  label.innerHTML = `Showing <strong style="color:${SENT_COLOR[s]}">${s}</strong> posts (${filtered.length})`;

  if (!filtered.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:13px">No posts classified as ' + s + '.</p>';
  } else {
    list.innerHTML = filtered.map(p => `
      <div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px">
          <span style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;background:rgba(56,189,248,0.12);color:var(--accent);text-transform:uppercase;flex-shrink:0">${escapeHtml(p.platform)}</span>
          <a href="${p.url || '#'}" target="_blank" rel="noopener" style="font-size:14px;font-weight:600;color:var(--fg);text-decoration:none;line-height:1.4">${escapeHtml(p.title)}</a>
        </div>
        <div style="font-size:12px;color:var(--muted);display:flex;gap:12px;padding-left:2px">
          <span>↑ ${p.engagement?.score ?? 0}</span>
          <span>by ${escapeHtml(p.author || '')}</span>
          <span>${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}</span>
        </div>
      </div>`).join('');
  }
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function hideAllSections() {
  [statsSection, sentimentSection, trendsSection, topPostsSection, aiInsightsSection].forEach(el => el.classList.add('hidden'));
  document.getElementById('exportButtons').classList.add('hidden');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function tick(ms = 80) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Export handlers ────────────────────────────────────────────────────────────
document.getElementById('exportCSV').addEventListener('click', async () => {
  if (!currentAnalyticsData) { alert('Run analysis first'); return; }
  try {
    const res = await fetch('/api/analytics/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: currentAnalyticsData, format: 'csv' })
    });
    downloadBlob(await res.blob(), `analytics-${Date.now()}.csv`);
  } catch (err) { alert('Export failed: ' + err.message); }
});

document.getElementById('exportJSON').addEventListener('click', async () => {
  if (!currentAnalyticsData) { alert('Run analysis first'); return; }
  try {
    const res = await fetch('/api/analytics/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: currentAnalyticsData, format: 'json' })
    });
    downloadBlob(await res.blob(), `analytics-${Date.now()}.json`);
  } catch (err) { alert('Export failed: ' + err.message); }
});

function downloadBlob(blob, filename) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: filename
  });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
}

// ── Init ───────────────────────────────────────────────────────────────────────
loadPlatforms();
