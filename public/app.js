'use strict';

// ── Feed bundles (curated RSS feeds a quick-search button can pull in) ─────────
const FEED_BUNDLES = {
  world: {
    label: 'World news',
    feeds: [
      'http://feeds.bbci.co.uk/news/world/rss.xml',
      'https://www.theguardian.com/world/rss',
      'https://feeds.npr.org/1001/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
      'https://feeds.abcnews.com/abcnews/topstories',
      'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    ],
  },
  finland: {
    label: 'Finland',
    feeds: [
      'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_NEWS',
      'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET',
      'https://www.hs.fi/rss/tuoreimmat.xml',
      'https://www.is.fi/rss/tuoreimmat.xml',
      'https://www.iltalehti.fi/rss/uutiset.xml',
    ],
  },
  tech: {
    label: 'Tech',
    feeds: [
      'https://feeds.arstechnica.com/arstechnica/index',
      'https://www.theverge.com/rss/index.xml',
      'https://techcrunch.com/feed/',
      'https://www.wired.com/feed/rss',
      'https://www.technologyreview.com/feed/',
    ],
  },
  gaming: {
    label: 'Gaming',
    feeds: [
      'https://feeds.ign.com/ign/all',
      'https://www.pcgamer.com/rss/',
      'https://www.eurogamer.net/feed',
      'https://www.rockpapershotgun.com/feed/news',
      'https://www.polygon.com/rss/index.xml',
    ],
  },
  esports: {
    label: 'Esports',
    feeds: [
      'https://www.hltv.org/rss/news',
      'https://dotesports.com/feed',
      'https://www.dexerto.com/feed/',
    ],
  },
};

const DEFAULT_QUICK = [
  { label: 'News',     query: '',                        bundle: 'world' },
  { label: 'Finland',  query: 'Finland',                 bundle: 'finland' },
  { label: 'Football', query: 'football' },
  { label: 'Tech',     query: 'technology',              bundle: 'tech' },
  { label: 'AI',       query: 'artificial intelligence' },
  { label: 'Gaming',   query: 'gaming',                  bundle: 'gaming' },
  { label: 'Space',    query: 'space' },
];

const DEFAULT_SETTINGS = {
  timeRange: 'week',
  perSource: 15,
  disabledSources: [],
  aiLanguage: 'en',     // language the AI writes in: 'en' | 'fi'
  apiKeys: {},
  quick: DEFAULT_QUICK,
};

const AI_SAMPLE_SIZE = 25;   // posts the AI summarises (labels are given to all, up to AI_MAX_POSTS)
const AI_MAX_POSTS = 200;
const FEED_PAGE = 30;

// ── Settings (per-browser, localStorage) ───────────────────────────────────────
const SETTINGS_KEY = 'echoflow.settings.v1';

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...structuredClone(DEFAULT_SETTINGS), ...saved };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

let settings = loadSettings();

// ── State ──────────────────────────────────────────────────────────────────────
let platforms = [];          // from /api/platforms
let current = null;          // { query, results, sources, analysis, analysisError }
let searchSeq = 0;           // guards against stale responses
let aiStatus = null;         // from /api/analytics/status: which AI providers are configured
let compare = null;          // side-by-side model comparison for the current results
let topMode = 'popular';
let feedFilter = { sent: '', source: '', sort: 'popular', shown: FEED_PAGE };

const $ = id => document.getElementById(id);

// keywordSentiment() comes from sentiment-keywords.js (fallback when the AI can't label a post)

function popularity(p) {
  const e = p.engagement || {};
  return (e.score || 0) + 2 * (e.comments || 0) + (e.shares || 0);
}

function prepare(posts) {
  const prepared = posts.map(p => ({
    ...p,
    _pop: popularity(p),
    _time: new Date(p.createdAt).getTime() || 0,
    _sent: p._sent || keywordSentiment(p),
    _ai: Boolean(p._ai),
    _reason: p._reason || null,
  }));
  rankWithinPlatform(prepared);
  return prepared;
}

/**
 * Raw engagement isn't comparable across platforms (a Bluesky like ≠ an HN point),
 * so _rank is each post's percentile within its own platform (0..1). Sources with
 * no engagement data (news APIs, RSS) are ranked by recency, scaled down a bit.
 */
function rankWithinPlatform(posts) {
  const groups = new Map();
  for (const p of posts) {
    if (!groups.has(p.platform)) groups.set(p.platform, []);
    groups.get(p.platform).push(p);
  }
  for (const group of groups.values()) {
    const hasEngagement = group.some(p => p._pop > 0);
    group.sort((a, b) => hasEngagement ? a._pop - b._pop : a._time - b._time);
    group.forEach((p, i) => {
      const pct = group.length > 1 ? i / (group.length - 1) : 1;
      p._rank = hasEngagement ? pct : pct * 0.6;
    });
  }
}

// ── Search ─────────────────────────────────────────────────────────────────────
function enabledSources() {
  return platforms
    .filter(p => p.category !== 'feed' && p.capabilities.search)
    .filter(p => !settings.disabledSources.includes(p.id))
    .filter(p => !p.apiKey || p.apiKey.configured || settings.apiKeys[p.id])
    .map(p => p.id);
}

async function runSearch(query, bundle) {
  const feeds = bundle && FEED_BUNDLES[bundle] ? FEED_BUNDLES[bundle].feeds : [];
  if (!query && !feeds.length) {
    toast('Type something to search for');
    $('searchInput').focus();
    return;
  }

  if (platforms.length && !enabledSources().length && !feeds.length) {
    toast('No sources selected — pick at least one in the filters');
    openFilters(true);
    return;
  }

  const seq = ++searchSeq;
  const url = new URL(location.href);
  url.search = '';
  if (query) url.searchParams.set('q', query);
  if (bundle) url.searchParams.set('feeds', bundle);
  history.replaceState(null, '', url);

  setBusy(true);
  $('welcome').hidden = true;
  $('dashboard').hidden = false;
  $('feed').hidden = true;
  compare = null;
  $('compare').hidden = true;
  $('sourceBar').hidden = true;
  $('stats').innerHTML = '';
  $('topList').innerHTML = `<li class="loading"><span class="spinner"></span>Searching ${enabledSources().length} sources…</li>`;
  $('aiBody').innerHTML = `<p class="ai-foot">The AI reads the results once they are in.</p>`;
  $('moodBadge').hidden = true;

  try {
    const sources = platforms.length ? enabledSources() : undefined;
    const apiKeys = {};
    for (const id of sources || []) if (settings.apiKeys[id]) apiKeys[id] = settings.apiKeys[id];

    const res = await fetch('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, sources, feeds, apiKeys, timeRange: settings.timeRange, limit: settings.perSource }),
    });
    const data = await res.json().catch(() => ({}));
    if (seq !== searchSeq) return;
    if (!res.ok) throw new Error(data.error || `Search failed (${res.status})`);

    current = {
      query: data.query || query,
      bundle,
      results: prepare(data.results || []),
      sources: data.sources || {},
      analysis: null,
      analysisError: null,
      searchedAt: data.timestamp,
    };
    resetFeedFilter();
    renderAll();

    if (current.results.length) await runAI(seq);
    else $('aiBody').innerHTML = `<p class="ai-foot">Nothing to analyse — try other keywords or a longer time range in Settings.</p>`;
  } catch (err) {
    if (seq !== searchSeq) return;
    $('topList').innerHTML = `<li class="ai-error">${esc(err.message)}</li>`;
    $('aiBody').innerHTML = '';
  } finally {
    if (seq === searchSeq) setBusy(false);
  }
}

/** Pick up to N posts, alternating between sources so every source is represented. */
function aiSample(posts) {
  const bySource = new Map();
  for (const p of sortPosts(posts, 'popular')) {
    if (!bySource.has(p.platform)) bySource.set(p.platform, []);
    bySource.get(p.platform).push(p);
  }
  const queues = [...bySource.values()];
  const sample = [];
  while (sample.length < AI_SAMPLE_SIZE && queues.some(q => q.length)) {
    for (const q of queues) if (q.length && sample.length < AI_SAMPLE_SIZE) sample.push(q.shift());
  }
  return sample;
}

/** Only what the AI needs — keeps the request small with 200 posts. */
function slimForAI(posts) {
  return posts.map(p => ({
    id: p.id, platform: p.platform, title: p.title, content: (p.content || '').slice(0, 400),
    engagement: p.engagement, comments: (p.comments || []).slice(0, 1),
  }));
}

/** Posts sent to the AI: a mixed sample first (that's what it summarises), then the rest. */
function aiPosts(posts) {
  const sample = aiSample(posts);
  const rest = sortPosts(posts.filter(p => !sample.includes(p)), 'popular');
  return [...sample, ...rest].slice(0, AI_MAX_POSTS);
}

async function runAI(seq = searchSeq) {
  if (!current?.results.length) return;
  const sample = aiPosts(current.results);
  $('aiBody').innerHTML = `<div class="loading"><span class="spinner"></span>AI is reading ${sample.length} posts… (usually 10–30 s)</div>`;

  try {
    const res = await fetch('/api/analytics/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: current.query || undefined,
        language: settings.aiLanguage,
        posts: slimForAI(sample),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (seq !== searchSeq) return;
    if (!res.ok) throw new Error(data.error || `AI analysis failed (${res.status})`);

    const labelMap = { pos: 'positive', neu: 'neutral', neg: 'negative' };
    // Posts the AI could not label keep their keyword estimate (shown with *)
    (data.articleLabels || []).forEach((label, i) => {
      if (sample[i] && labelMap[label]) {
        sample[i]._sent = labelMap[label];
        sample[i]._ai = true;
        sample[i]._reason = data.articleReasons?.[i] || null;
      }
    });
    current.analysis = data;
    current.analysisError = null;
  } catch (err) {
    if (seq !== searchSeq) return;
    current.analysisError = err.message;
  }
  renderAll();
}

// ── Rendering ──────────────────────────────────────────────────────────────────
function renderAll() {
  if (!current) return;
  $('welcome').hidden = true;
  $('dashboard').hidden = false;
  renderSourceBar();
  renderStats();
  renderTop();
  renderAI();
  renderFeed();
  $('exportCsv').disabled = $('exportJson').disabled = !current.results.length;
}

function platformName(id) {
  return platforms.find(p => p.id === id)?.displayName || current?.sources?.[id]?.name || id;
}

function renderSourceBar() {
  const entries = Object.entries(current.sources || {});
  $('sourceBar').hidden = !entries.length;
  $('sourceBar').innerHTML = entries
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, s]) => {
      const cls = s.skipped ? 'src src--skip' : s.error && !s.count ? 'src src--err' : 'src';
      const title = s.error ? ` title="${esc(s.error)}"` : '';
      return `<span class="${cls}"${title}>${esc(s.name)} <b>${s.count}</b>${s.error && !s.count ? ' ⚠' : ''}</span>`;
    }).join('');
}

function renderStats() {
  const r = current.results;
  const withResults = new Set(r.map(p => p.platform)).size;
  const engagement = r.reduce((s, p) => s + p._pop, 0);
  $('stats').innerHTML = `
    <div><b>${r.length}</b>results</div>
    <div><b>${withResults}</b>sources</div>
    ${engagement ? `<div><b>${compact(engagement)}</b>engagement</div>` : ''}
    ${current.query ? `<div><b>${esc(current.query)}</b>search</div>` : ''}`;
}

function sortPosts(posts, mode) {
  const list = [...posts];
  if (mode === 'latest') return list.sort((a, b) => b._time - a._time);
  return list.sort((a, b) => b._rank - a._rank || b._pop - a._pop || b._time - a._time);
}

/** Top N, at most `perSource` from one platform so one loud source can't fill the list. */
function topPosts(posts, mode, n = 10, perSource = 3) {
  const sorted = sortPosts(posts, mode);
  const counts = {};
  const picked = [];
  for (const p of sorted) {
    if ((counts[p.platform] = (counts[p.platform] || 0) + 1) <= perSource) picked.push(p);
    if (picked.length === n) return picked;
  }
  // Fewer sources than needed: fill up with the rest
  return picked.concat(sorted.filter(p => !picked.includes(p))).slice(0, n);
}

function renderTop() {
  const top = topPosts(current.results, topMode);
  if (!top.length) {
    $('topList').innerHTML = `<li class="ai-foot" style="display:block">No results. Check the source chips above for errors, or widen the time range in Settings.</li>`;
    return;
  }
  $('topList').innerHTML = top.map(p => `
    <li>
      <div>
        <a href="${safeUrl(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>
        <div class="top-meta"><span class="dot dot--${p._sent}" title="${esc(moodTitle(p))}"></span>${esc(sourceLabel(p))} · ${timeAgo(p._time)}</div>
      </div>
      <span class="top-score">${engagementLabel(p)}</span>
    </li>`).join('');
}

const PROVIDER_LABEL = a => !a.provider ? '' : a.provider.startsWith('nvidia')
  ? `NVIDIA NIM · ${a.provider.split('/').pop()}` : `Ollama · ${a.provider.replace(/^ollama:/, '')}`;

function moodCounts() {
  const c = { positive: 0, neutral: 0, negative: 0 };
  for (const p of current.results) c[p._sent]++;
  const n = current.results.length || 1;
  return {
    positive: Math.round((c.positive / n) * 100),
    negative: Math.round((c.negative / n) * 100),
    get neutral() { return 100 - this.positive - this.negative; },
  };
}

function renderAI() {
  const a = current.analysis;
  const badge = $('moodBadge');

  if (!a && !current.analysisError) {
    // Imported data without analysis, or still waiting
    if (!$('aiBody').querySelector('.loading')) {
      $('aiBody').innerHTML = `${moodBlock(moodCounts(), 'Mood by keywords (estimate)')}
        <button id="runAiBtn" class="ghost-btn" type="button">Analyse with AI</button>`;
      $('runAiBtn').onclick = () => runAI();
      wireLegend();
    }
    badge.hidden = true;
    return;
  }

  if (!a) {
    $('aiBody').innerHTML = `
      <p class="ai-error">AI unavailable: ${esc(current.analysisError)}</p>
      ${moodBlock(moodCounts(), 'Mood by keywords (estimate)')}
      <button id="runAiBtn" class="ghost-btn" type="button">Try again</button>`;
    $('runAiBtn').onclick = () => runAI();
    badge.hidden = true;
    wireLegend();
    return;
  }

  badge.hidden = false;
  badge.textContent = a.mood;
  badge.className = `mood mood--${a.mood}`;

  $('aiBody').innerHTML = `
    ${moodBlock(a.sentiment, 'Mood')}
    ${a.summary ? `<div class="ai-block"><h3>Summary</h3><p>${esc(a.summary)}</p></div>` : ''}
    ${a.opinion ? `<div class="ai-block"><h3>AI's opinion</h3><p class="opinion">${esc(a.opinion)}</p></div>` : ''}
    ${a.themes?.length ? `<div class="ai-block"><h3>Themes</h3><div class="themes">${a.themes.map(t => `<span class="theme">${esc(t)}</span>`).join('')}</div></div>` : ''}
    ${a.insights?.length ? `<div class="ai-block"><h3>Insights</h3><ul class="insights">${a.insights.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>` : ''}
    <p class="ai-foot">AI labelled the mood of ${a.labelledCount ?? a.postCount} of ${current.results.length} posts${PROVIDER_LABEL(a) ? ` · ${esc(PROVIDER_LABEL(a))}` : ''}.${(a.labelledCount ?? 0) < current.results.length ? ' Posts marked * are keyword estimates.' : ''}</p>
    ${compareButton()}`;
  wireLegend();
  wireCompareButton();
}

function compareButton() {
  const ready = aiStatus?.nvidia && aiStatus?.gemini;
  const hint = ready ? 'Run both models on the same posts and show them side by side'
    : 'Needs both NVIDIA_API_KEY and GEMINI_API_KEY in .env';
  return `<button id="compareBtn" class="ghost-btn" type="button" title="${esc(hint)}" ${ready ? '' : 'disabled'}>⇄ Compare NVIDIA vs Gemini</button>
    ${ready ? '' : `<p class="ai-foot">Add a free <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Gemini key</a> as <code>GEMINI_API_KEY</code> in .env to compare models.</p>`}`;
}

function wireCompareButton() {
  const btn = $('compareBtn');
  if (btn) btn.onclick = runCompare;
}

function moodBlock(s, title) {
  const rows = [['positive', 'pos', 'Positive'], ['neutral', 'neu', 'Neutral'], ['negative', 'neg', 'Negative']];
  return `
    <div class="ai-block">
      <h3>${esc(title)}</h3>
      <div class="moodbar" role="img" aria-label="Positive ${s.positive}%, neutral ${s.neutral}%, negative ${s.negative}%">
        ${rows.map(([k, c]) => `<span class="${c}" style="width:${s[k]}%"></span>`).join('')}
      </div>
      <div class="legend">
        ${rows.map(([k, , label]) => `<button type="button" data-sent="${k}" class="${feedFilter.sent === k ? 'is-on' : ''}" title="Show only ${label.toLowerCase()} posts">
          <span class="dot dot--${k}"></span>${label} <b>${s[k]}%</b></button>`).join('')}
      </div>
    </div>`;
}

function wireLegend() {
  $('aiBody').querySelectorAll('.legend button').forEach(btn => {
    btn.onclick = () => {
      setSentFilter(feedFilter.sent === btn.dataset.sent ? '' : btn.dataset.sent);
      $('feed').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
}

function resetFeedFilter() {
  feedFilter = { sent: '', source: '', sort: $('sortSelect').value || 'popular', shown: FEED_PAGE };
  $('sourceFilter').value = '';
}

function setSentFilter(sent) {
  feedFilter.sent = sent;
  feedFilter.shown = FEED_PAGE;
  renderAI();
  renderFeed();
}

function renderFeed() {
  const all = current.results;
  $('feed').hidden = !all.length;
  if (!all.length) return;

  // Source dropdown
  const ids = [...new Set(all.map(p => p.platform))];
  $('sourceFilter').innerHTML = `<option value="">All sources (${all.length})</option>` + ids.map(id =>
    `<option value="${esc(id)}">${esc(platformName(id))} (${all.filter(p => p.platform === id).length})</option>`).join('');
  $('sourceFilter').value = feedFilter.source;

  $('sentFilter').querySelectorAll('.chip').forEach(c => c.classList.toggle('is-on', c.dataset.sent === feedFilter.sent));

  const filtered = sortPosts(all.filter(p =>
    (!feedFilter.sent || p._sent === feedFilter.sent) && (!feedFilter.source || p.platform === feedFilter.source)
  ), feedFilter.sort);

  $('feedCount').textContent = filtered.length === all.length ? `(${all.length})` : `(${filtered.length} of ${all.length})`;
  const multiKeyword = new Set(all.map(p => p.metadata?.keyword).filter(Boolean)).size > 1;

  $('feedList').innerHTML = filtered.slice(0, feedFilter.shown).map(p => {
    const snippet = (p.content || '').trim();
    const showSnippet = snippet && snippet !== p.title && !p.title.startsWith(snippet.slice(0, 60));
    const kws = p.metadata?.keywords || (p.metadata?.keyword ? [p.metadata.keyword] : []);
    return `
      <li class="item item--${p._sent}">
        <a class="item__title" href="${safeUrl(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>
        <div class="item__meta">
          <span class="item__src">${esc(sourceLabel(p))}</span>
          <span>${timeAgo(p._time)}</span>
          ${engagementLabel(p) ? `<span>${engagementLabel(p)}</span>` : ''}
          ${p.author && p.author !== 'unknown' ? `<span>by ${esc(p.author)}</span>` : ''}
          ${multiKeyword ? kws.map(k => `<span class="tag">${esc(k)}</span>`).join('') : ''}
          <span class="item__mood" title="${esc(moodTitle(p))}"><span class="dot dot--${p._sent}"></span>${p._sent}${p._ai ? '' : '*'}${p._reason ? `<span class="item__reason"> — ${esc(p._reason)}</span>` : ''}</span>
        </div>
        ${showSnippet ? `<p class="item__snippet">${esc(snippet.slice(0, 240))}${snippet.length > 240 ? '…' : ''}</p>` : ''}
      </li>`;
  }).join('') || `<li class="ai-foot">No posts match these filters.</li>`;

  $('moreBtn').hidden = filtered.length <= feedFilter.shown;
}

function moodTitle(p) {
  if (!p._ai) return `${p._sent} (keyword estimate, not checked by AI)`;
  return `${p._sent} (AI)${p._reason ? `: ${p._reason}` : ''}`;
}

function sourceLabel(p) {
  const name = platformName(p.platform);
  const m = p.metadata || {};
  const sub = m.subreddit ? `r/${m.subreddit}` : m.community ? `!${m.community}` : m.feedTitle || m.source;
  return sub && sub !== name ? `${name} · ${sub}` : name;
}

function engagementLabel(p) {
  const e = p.engagement || {};
  const parts = [];
  if (e.score) parts.push(`↑ ${compact(e.score)}`);
  if (e.comments) parts.push(`💬 ${compact(e.comments)}`);
  return parts.join('  ');
}

// ── Quick searches ─────────────────────────────────────────────────────────────
function renderQuickBar() {
  const activeQ = new URLSearchParams(location.search).get('q') || '';
  const activeB = new URLSearchParams(location.search).get('feeds') || '';
  $('quickBar').innerHTML = settings.quick.map((q, i) =>
    `<button type="button" class="quick__btn${q.query === activeQ && (q.bundle || '') === activeB ? ' is-on' : ''}" data-i="${i}"
      title="${esc([q.query, q.bundle && `+ ${FEED_BUNDLES[q.bundle]?.label} feeds`].filter(Boolean).join(' '))}">${esc(q.label)}</button>`
  ).join('') + `<button type="button" class="quick__btn quick__add" id="saveQuick" title="Save the current search as a button">+ Save search</button>`;

  $('quickBar').querySelectorAll('[data-i]').forEach(btn => {
    btn.onclick = () => {
      const q = settings.quick[Number(btn.dataset.i)];
      $('searchInput').value = q.query;
      runSearch(q.query, q.bundle).then(renderQuickBar);
      renderQuickBar();
    };
  });
  $('saveQuick').onclick = () => {
    const query = $('searchInput').value.trim();
    if (!query) { toast('Search for something first, then save it'); return; }
    const label = query.split(',')[0].trim().slice(0, 24);
    settings.quick.push({ label, query });
    saveSettings();
    renderQuickBar();
    renderQuickEditor();
    toast(`Saved "${label}" — edit buttons in Settings`);
  };
}

function renderQuickEditor() {
  $('quickEditList').innerHTML = settings.quick.map((q, i) => `
    <li><strong>${esc(q.label)}</strong>
      <small>${esc([q.query, q.bundle && `+ ${FEED_BUNDLES[q.bundle]?.label} feeds`].filter(Boolean).join(' '))}</small>
      <button type="button" data-del="${i}" aria-label="Remove ${esc(q.label)}">✕</button></li>`).join('');
  $('quickEditList').querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = () => {
      settings.quick.splice(Number(btn.dataset.del), 1);
      saveSettings(); renderQuickEditor(); renderQuickBar();
    };
  });
  $('qaFeeds').innerHTML = `<option value="">No feeds</option>` +
    Object.entries(FEED_BUNDLES).map(([k, b]) => `<option value="${k}">+ ${esc(b.label)} feeds</option>`).join('');
}

// ── Settings drawer ────────────────────────────────────────────────────────────
function openSettings(open) {
  $('settings').classList.toggle('is-open', open);
  $('settings').setAttribute('aria-hidden', String(!open));
  $('settingsBtn').setAttribute('aria-expanded', String(open));
  $('scrim').hidden = !open;
  if (open) $('closeSettings').focus();
}

// ── Search filters (sliders button next to the search bar) ─────────────────────
const TIME_OPTIONS = [['day', 'Past day'], ['week', 'Past week'], ['month', 'Past month'], ['year', 'Past year'], ['all', 'Any time']];
const PER_SOURCE_OPTIONS = [5, 10, 15, 25, 50];
let filtersChanged = false;   // re-run the current search when the panel closes

function searchablePlatforms() {
  return platforms.filter(p => p.category !== 'feed' && p.capabilities.search);
}

/** A source needing an API key is usable once the server or this browser has one. */
function hasKey(p) {
  return !p.apiKey || p.apiKey.configured || Boolean(settings.apiKeys[p.id]);
}

function openFilters(open) {
  const panel = $('filterPanel');
  const wasOpen = !panel.hidden;
  panel.hidden = !open;
  $('filterBtn').setAttribute('aria-expanded', String(open));
  $('filterBtn').classList.toggle('is-on', open);
  if (open && !wasOpen) { filtersChanged = false; renderFilters(); }
  if (!open && wasOpen && filtersChanged && current) {
    // Apply the new filters to what is on screen
    filtersChanged = false;
    runSearch($('searchInput').value.trim(), current.bundle).then(renderQuickBar);
  }
}

function renderFilters() {
  const seg = (options, value, attr) => options.map(([v, label]) =>
    `<button type="button" class="seg__btn${String(v) === String(value) ? ' is-on' : ''}" role="radio" aria-checked="${String(v) === String(value)}" data-${attr}="${v}">${label}</button>`).join('');
  $('fTime').innerHTML = seg(TIME_OPTIONS, settings.timeRange, 'time');
  $('fPerSource').innerHTML = seg(PER_SOURCE_OPTIONS.map(n => [n, String(n)]), settings.perSource, 'per');

  const list = searchablePlatforms();
  if (!list.length) {
    $('fSources').innerHTML = `<p class="ai-error">Could not load sources — is the server running?</p>`;
    $('fCount').textContent = '';
    return;
  }
  const groups = [['social', 'Social & discussion'], ['news', 'News']];
  $('fSources').innerHTML = groups.map(([cat, title]) => {
    const chips = list.filter(p => p.category === cat).map(p => {
      if (!hasKey(p)) {
        return `<button type="button" class="src-chip is-locked" data-locked="${p.id}" title="${esc(p.displayName)} needs a free API key. Click to add it in Settings.">
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z"/></svg>${esc(p.displayName)}</button>`;
      }
      const on = !settings.disabledSources.includes(p.id);
      return `<button type="button" class="src-chip${on ? ' is-on' : ''}" aria-pressed="${on}" data-src="${p.id}" title="${esc(p.description || p.displayName)}">${esc(p.displayName)}</button>`;
    }).join('');
    return `<div class="src-group"><span class="src-group__title">${title}</span><div class="src-group__chips">${chips}</div></div>`;
  }).join('');

  const usable = list.filter(hasKey);
  const on = enabledSources().length;
  $('fCount').textContent = `${on} of ${usable.length} sources on`;
}

function filterChange(fn) {
  fn();
  saveSettings();
  filtersChanged = true;
  renderFilters();
  updateFilterBadge();
}

/** Number on the filter button = how many filters differ from the defaults. */
function updateFilterBadge() {
  const usable = searchablePlatforms().filter(hasKey).map(p => p.id);
  const n = Number(settings.timeRange !== DEFAULT_SETTINGS.timeRange)
    + Number(settings.perSource !== DEFAULT_SETTINGS.perSource)
    + Number(usable.some(id => settings.disabledSources.includes(id)));
  $('filterBadge').hidden = !n;
  $('filterBadge').textContent = n;
}

function wireFilters() {
  $('filterBtn').addEventListener('click', () => openFilters($('filterPanel').hidden));
  $('fApply').addEventListener('click', () => openFilters(false));
  $('filterPanel').addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.time) filterChange(() => { settings.timeRange = t.dataset.time; });
    else if (t.dataset.per) filterChange(() => { settings.perSource = Number(t.dataset.per); });
    else if (t.dataset.src) filterChange(() => {
      const id = t.dataset.src;
      settings.disabledSources = settings.disabledSources.includes(id)
        ? settings.disabledSources.filter(x => x !== id)
        : [...settings.disabledSources, id];
    });
    else if (t.dataset.locked) {
      openFilters(false);
      openSettings(true);
      $('keysSection').scrollIntoView({ block: 'start' });
      $('sourceList').querySelector(`[data-key="${t.dataset.locked}"]`)?.focus();
    }
    else if (t.id === 'fAll') filterChange(() => { settings.disabledSources = []; });
    else if (t.id === 'fNone') filterChange(() => { settings.disabledSources = searchablePlatforms().map(p => p.id); });
    else if (t.id === 'fReset') filterChange(() => {
      settings.timeRange = DEFAULT_SETTINGS.timeRange;
      settings.perSource = DEFAULT_SETTINGS.perSource;
      settings.disabledSources = [];
    });
  });
  // Close when clicking outside the search area. composedPath() is used because a
  // chip click re-renders the panel, so e.target is already detached here.
  const wrap = document.querySelector('.search-wrap');
  document.addEventListener('click', e => {
    if (!$('filterPanel').hidden && !e.composedPath().includes(wrap)) openFilters(false);
  });
}

// ── API keys (settings drawer) ─────────────────────────────────────────────────
function renderSourceSettings() {
  if (!platforms.length) {
    $('sourceList').innerHTML = `<p class="ai-error">Could not load sources — is the server running?</p>`;
    return;
  }
  const keyed = searchablePlatforms().filter(p => p.apiKey);
  $('sourceList').innerHTML = keyed.map(p => {
    const k = p.apiKey;
    const saved = Boolean(settings.apiKeys[p.id]);
    const badge = k.configured ? '<span class="badge badge--ok">key on server</span>'
      : saved ? '<span class="badge badge--ok">key saved</span>'
      : '<span class="badge">needs free key</span>';
    return `
      <div class="source-row source-row--key">
        <div><strong>${esc(p.displayName)}</strong>${badge}
          ${p.description ? `<p class="hint">${esc(p.description)}</p>` : ''}</div>
        ${k.configured ? '' : `
          <div class="source-key">
            <input type="password" data-key="${p.id}" placeholder="${saved ? '•••••• saved (paste to replace, clear to remove)' : 'Paste API key'}" autocomplete="off" aria-label="${esc(p.displayName)} API key" />
            <a class="ghost-btn" href="${safeUrl(k.signupUrl)}" target="_blank" rel="noopener">Get key</a>
          </div>`}
      </div>`;
  }).join('');

  $('sourceList').querySelectorAll('[data-key]').forEach(input => {
    input.onchange = () => {
      const id = input.dataset.key;
      const v = input.value.trim();
      if (v) {
        settings.apiKeys[id] = v;
        // A newly unlocked source should be on
        settings.disabledSources = settings.disabledSources.filter(x => x !== id);
      } else delete settings.apiKeys[id];
      saveSettings();
      renderSourceSettings();
      updateFilterBadge();
      toast(v ? `${platformName(id)} key saved — the source is now available in the search filters` : `${platformName(id)} key removed`);
    };
  });
}

async function loadPlatforms() {
  try {
    const res = await fetch('/api/platforms');
    platforms = (await res.json()).platforms || [];
  } catch {
    platforms = [];
  }
  renderSourceSettings();
  updateFilterBadge();
}

async function loadAIStatus() {
  try {
    const s = await fetch('/api/analytics/status').then(r => r.json());
    aiStatus = s;
    if (current) renderAI();
    const label = s.nvidia ? `NVIDIA · ${(s.nvidiaModel || '').split('/').pop()}`
      : s.gemini ? `Gemini · ${s.geminiModel}`
      : s.available ? `Ollama · ${s.model}` : 'offline';
    $('aiPill').textContent = `AI: ${label}`;
    $('aiPill').classList.toggle('is-ok', Boolean(s.nvidia || s.gemini || s.available));
    const geminiNote = s.gemini ? ` Gemini (<code>${esc(s.geminiModel)}</code>) is set up as backup and for comparison.` : '';
    $('aiInfo').innerHTML = s.nvidia
      ? `Using NVIDIA NIM (<code>${esc(s.nvidiaModel)}</code>)${s.available ? `, falling back to local Ollama (<code>${esc(s.model)}</code>)` : ''}.${geminiNote}`
      : s.gemini ? `Using Google Gemini (<code>${esc(s.geminiModel)}</code>).`
      : s.available
        ? `Using local Ollama (<code>${esc(s.model)}</code>). Set <code>NVIDIA_API_KEY</code> on the server for faster, better analysis.`
        : `No AI provider reachable. Set <code>NVIDIA_API_KEY</code> (free at build.nvidia.com) or start Ollama. Search still works; mood is then estimated from keywords.`;
  } catch {
    $('aiPill').textContent = 'AI: offline';
  }
}

// ── Side-by-side model comparison ──────────────────────────────────────────────
const COMPARE_PROVIDERS = [
  { id: 'nvidia', name: 'NVIDIA NIM' },
  { id: 'gemini', name: 'Google Gemini' },
];
const SENT_NAME = { pos: 'positive', neu: 'neutral', neg: 'negative' };

/** Runs each provider on exactly the same posts and prompts, with no fallback between them. */
async function runCompare() {
  if (!current?.results.length) return;
  const seq = searchSeq;
  const posts = aiPosts(current.results);
  compare = { seq, posts, results: {} };
  for (const p of COMPARE_PROVIDERS) compare.results[p.id] = { state: 'loading' };
  $('compare').hidden = false;
  renderCompare();
  $('compare').scrollIntoView({ behavior: 'smooth', block: 'start' });

  const body = { keyword: current.query || undefined, language: settings.aiLanguage, posts: slimForAI(posts) };
  await Promise.all(COMPARE_PROVIDERS.map(async p => {
    const started = Date.now();
    let result;
    try {
      const res = await fetch('/api/analytics/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, provider: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `failed (${res.status})`);
      result = { state: 'done', data, ms: Date.now() - started };
    } catch (err) {
      result = { state: 'error', error: err.message };
    }
    // Ignore answers that arrive after a new search
    if (compare?.seq !== seq || searchSeq !== seq) return;
    compare.results[p.id] = result;
    renderCompare();
  }));
}

function renderCompare() {
  if (!compare) return;
  const cols = COMPARE_PROVIDERS.map(p => compareColumn(p, compare.results[p.id])).join('');
  $('compareBody').innerHTML = `<div class="compare__cols">${cols}</div>${compareAgreement()}`;
}

function compareColumn(p, r = { state: 'loading' }) {
  if (r.state === 'loading') {
    return `<div class="cmp-col"><h3>${p.name}</h3><div class="loading"><span class="spinner"></span>Analysing ${compare.posts.length} posts…</div></div>`;
  }
  if (r.state === 'error') {
    return `<div class="cmp-col"><h3>${p.name}</h3><p class="ai-error">${esc(r.error)}</p></div>`;
  }
  const a = r.data;
  const s = a.sentiment;
  const model = (a.provider || '').replace(/^[a-z]+:/, '').split('/').pop();
  return `
    <div class="cmp-col">
      <h3>${p.name} <span class="mood mood--${a.mood}">${esc(a.mood)}</span></h3>
      <p class="ai-foot">${esc(model)} · ${((a.durationMs ?? r.ms) / 1000).toFixed(1)} s · labelled ${a.labelledCount} of ${compare.posts.length}</p>
      <div class="moodbar" role="img" aria-label="Positive ${s.positive}%, neutral ${s.neutral}%, negative ${s.negative}%">
        <span class="pos" style="width:${s.positive}%"></span><span class="neu" style="width:${s.neutral}%"></span><span class="neg" style="width:${s.negative}%"></span>
      </div>
      <p class="cmp-pcts"><span class="dot dot--positive"></span>${s.positive}% <span class="dot dot--neutral"></span>${s.neutral}% <span class="dot dot--negative"></span>${s.negative}%</p>
      ${a.summary ? `<div class="ai-block"><h3>Summary</h3><p>${esc(a.summary)}</p></div>` : ''}
      ${a.opinion ? `<div class="ai-block"><h3>Opinion</h3><p class="opinion">${esc(a.opinion)}</p></div>` : ''}
      ${a.themes?.length ? `<div class="ai-block"><h3>Themes</h3><div class="themes">${a.themes.map(t => `<span class="theme">${esc(t)}</span>`).join('')}</div></div>` : ''}
    </div>`;
}

function compareAgreement() {
  const [A, B] = COMPARE_PROVIDERS.map(p => compare.results[p.id]);
  if (A?.state !== 'done' || B?.state !== 'done') return '';
  const la = A.data.articleLabels || [], lb = B.data.articleLabels || [];
  const ra = A.data.articleReasons || [], rb = B.data.articleReasons || [];
  let both = 0, same = 0, opposite = 0;
  const diffs = [];
  compare.posts.forEach((post, i) => {
    if (!la[i] || !lb[i]) return;
    both++;
    if (la[i] === lb[i]) { same++; return; }
    const isOpposite = (la[i] === 'pos' && lb[i] === 'neg') || (la[i] === 'neg' && lb[i] === 'pos');
    if (isOpposite) opposite++;
    diffs.push({ post, a: la[i], b: lb[i], ra: ra[i], rb: rb[i], isOpposite });
  });
  diffs.sort((x, y) => Number(y.isOpposite) - Number(x.isOpposite));
  const pct = both ? Math.round((100 * same) / both) : 0;
  const cell = (l, r) => `<span class="dot dot--${SENT_NAME[l]}"></span>${SENT_NAME[l]}${r ? `<span class="item__reason"> — ${esc(r)}</span>` : ''}`;

  return `
    <div class="agree">
      <div class="agree__score"><b>${pct}%</b> agreement</div>
      <p class="hint">Both models labelled ${both} posts and gave the same mood to ${same}.
        ${diffs.length} differ${opposite ? `, ${opposite} of them in opposite directions (one says positive, the other negative)` : ''}.
        Differences are where the mood is genuinely debatable, or where one model misread the post.</p>
    </div>
    ${diffs.length ? `
    <div class="diff-wrap">
      <table class="diff">
        <thead><tr><th>Post</th><th>${COMPARE_PROVIDERS[0].name}</th><th>${COMPARE_PROVIDERS[1].name}</th></tr></thead>
        <tbody>${diffs.map(d => `
          <tr class="${d.isOpposite ? 'is-opposite' : ''}">
            <td><a href="${safeUrl(d.post.url)}" target="_blank" rel="noopener">${esc(d.post.title)}</a></td>
            <td>${cell(d.a, d.ra)}</td>
            <td>${cell(d.b, d.rb)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}`;
}

// ── Export / import ────────────────────────────────────────────────────────────
const CSV_COLUMNS = ['platform', 'source', 'title', 'url', 'author', 'published', 'score', 'comments', 'sentiment', 'labelled_by', 'mood_reason', 'keyword', 'snippet'];

function toCsv(posts) {
  const cell = v => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = posts.map(p => [
    p.platform, sourceLabel(p), p.title, p.url, p.author, new Date(p._time).toISOString(),
    p.engagement?.score ?? 0, p.engagement?.comments ?? 0, p._sent, p._ai ? 'ai' : 'keywords', p._reason || '',
    (p.metadata?.keywords || [p.metadata?.keyword]).filter(Boolean).join('; '),
    (p.content || '').replace(/\s+/g, ' ').slice(0, 500),
  ].map(cell).join(','));
  // BOM so Excel opens UTF-8 (ä, ö) correctly
  return '﻿' + [CSV_COLUMNS.join(','), ...rows].join('\r\n');
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(Boolean));
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

function download(name, content, type) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type })), download: name,
  });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportName(ext) {
  const slug = (current.query || current.bundle || 'results').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `echoflow-${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function exportJson() {
  const results = current.results.map(({ _pop, _rank, _time, _sent, _ai, _reason, ...p }) => ({
    ...p, sentiment: _sent, labelledBy: _ai ? 'ai' : 'keywords', moodReason: _reason || undefined,
  }));
  download(exportName('json'), JSON.stringify({
    echoflow: 1, query: current.query, bundle: current.bundle, exportedAt: new Date().toISOString(),
    sources: current.sources, analysis: current.analysis, results,
    comparison: compare && {
      posts: compare.posts.map(p => ({ title: p.title, url: p.url, platform: p.platform })),
      results: compare.results,
    },
  }, null, 2), 'application/json');
}

async function importFile(file) {
  const text = await file.text();
  let posts, extra = {};
  if (file.name.toLowerCase().endsWith('.csv') || !text.trim().startsWith('{')) {
    posts = parseCsv(text).map((r, i) => ({
      id: r.url || String(i), platform: r.platform || 'import', title: r.title || '(no title)', url: r.url,
      author: r.author, createdAt: r.published || new Date().toISOString(), content: r.snippet || '',
      engagement: { score: Number(r.score) || 0, comments: Number(r.comments) || 0, likes: 0, shares: 0 },
      metadata: { source: (r.source || '').split(' · ').pop(), keyword: (r.keyword || '').split('; ')[0] || undefined },
      _sent: ['positive', 'neutral', 'negative'].includes(r.sentiment) ? r.sentiment : undefined,
      _ai: r.labelled_by === 'ai',
      _reason: r.mood_reason || null,
    }));
  } else {
    const data = JSON.parse(text);
    if (!Array.isArray(data.results)) throw new Error('Not an EchoFlow export (no "results" array)');
    posts = data.results.map(p => ({ ...p, _sent: p.sentiment, _ai: p.labelledBy === 'ai', _reason: p.moodReason }));
    extra = { query: data.query, bundle: data.bundle, sources: data.sources, analysis: data.analysis, comparison: data.comparison };
  }
  if (!posts.length) throw new Error('The file has no rows');

  searchSeq++;
  current = {
    query: extra.query || '', bundle: extra.bundle, results: prepare(posts),
    sources: extra.sources || {}, analysis: extra.analysis || null, analysisError: null,
  };
  $('searchInput').value = current.query;
  resetFeedFilter();
  $('aiBody').innerHTML = '';
  compare = extra.comparison?.results ? { ...extra.comparison, seq: searchSeq } : null;
  $('compare').hidden = !compare;
  renderAll();
  if (compare) renderCompare();
  openSettings(false);
  toast(`Imported ${posts.length} results from ${file.name}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeUrl(u) {
  return /^https?:\/\//i.test(u || '') ? esc(u) : '#';
}

function compact(n) {
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function timeAgo(t) {
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

function setBusy(busy) {
  $('searchBtn').disabled = busy;
  $('searchBtn').textContent = busy ? 'Searching…' : 'Search';
}

let toastTimer;
function toast(msg) {
  $('toast').textContent = msg;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}

// ── Wiring ─────────────────────────────────────────────────────────────────────
$('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  filtersChanged = false;
  openFilters(false);
  runSearch($('searchInput').value.trim()).then(renderQuickBar);
});

document.querySelectorAll('.seg__btn').forEach(btn => btn.addEventListener('click', () => {
  topMode = btn.dataset.top;
  document.querySelectorAll('.seg__btn').forEach(b => {
    b.classList.toggle('is-on', b === btn);
    b.setAttribute('aria-selected', String(b === btn));
  });
  if (current) renderTop();
}));

$('sentFilter').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (chip) setSentFilter(chip.dataset.sent);
});
$('sourceFilter').addEventListener('change', () => { feedFilter.source = $('sourceFilter').value; feedFilter.shown = FEED_PAGE; renderFeed(); });
$('sortSelect').addEventListener('change', () => { feedFilter.sort = $('sortSelect').value; renderFeed(); });
$('moreBtn').addEventListener('click', () => { feedFilter.shown += FEED_PAGE; renderFeed(); });

$('settingsBtn').addEventListener('click', () => openSettings(true));
$('closeCompare').addEventListener('click', () => { $('compare').hidden = true; });
$('closeSettings').addEventListener('click', () => openSettings(false));
$('scrim').addEventListener('click', () => openSettings(false));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { openSettings(false); openFilters(false); }
});

$('aiLanguage').value = settings.aiLanguage || 'en';
$('aiLanguage').addEventListener('change', () => {
  settings.aiLanguage = $('aiLanguage').value;
  saveSettings();
  // Re-run the analysis so the change is visible right away
  if (current?.results.length) { openSettings(false); runAI(); }
});

wireFilters();

$('quickAddForm').addEventListener('submit', e => {
  e.preventDefault();
  const label = $('qaLabel').value.trim();
  const query = $('qaQuery').value.trim();
  const bundle = $('qaFeeds').value || undefined;
  if (!label || (!query && !bundle)) { toast('Give the button a label and keywords or a feed bundle'); return; }
  settings.quick.push({ label, query, ...(bundle ? { bundle } : {}) });
  saveSettings();
  e.target.reset();
  renderQuickEditor(); renderQuickBar();
});
$('resetQuick').addEventListener('click', () => {
  settings.quick = structuredClone(DEFAULT_QUICK);
  saveSettings(); renderQuickEditor(); renderQuickBar();
});

$('exportCsv').addEventListener('click', () => download(exportName('csv'), toCsv(sortPosts(current.results, 'popular')), 'text/csv;charset=utf-8'));
$('exportJson').addEventListener('click', exportJson);
$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try { await importFile(file); } catch (err) { toast(`Import failed: ${err.message}`); }
});

// ── Init ───────────────────────────────────────────────────────────────────────
renderQuickBar();
renderQuickEditor();
loadAIStatus();
if (location.hash === '#settings') openSettings(true);
loadPlatforms().then(() => {
  const params = new URLSearchParams(location.search);
  const q = params.get('q') || params.get('keyword') || '';
  const bundle = params.get('feeds') || undefined;
  if (q || bundle) {
    $('searchInput').value = q;
    runSearch(q, bundle).then(renderQuickBar);
  } else {
    $('searchInput').focus();
  }
});
