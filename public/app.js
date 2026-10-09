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
        // Only what the AI needs — keeps the request small with 200 posts
        posts: sample.map(p => ({
          id: p.id, platform: p.platform, title: p.title, content: (p.content || '').slice(0, 400),
          engagement: p.engagement, comments: (p.comments || []).slice(0, 1),
        })),
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
    <p class="ai-foot">AI labelled the mood of ${a.labelledCount ?? a.postCount} of ${current.results.length} posts${PROVIDER_LABEL(a) ? ` · ${esc(PROVIDER_LABEL(a))}` : ''}.${(a.labelledCount ?? 0) < current.results.length ? ' Posts marked * are keyword estimates.' : ''}</p>`;
  wireLegend();
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

function renderSourceSettings() {
  if (!platforms.length) {
    $('sourceList').innerHTML = `<p class="ai-error">Could not load sources — is the server running?</p>`;
    return;
  }
  const groups = [['social', 'Social & discussion'], ['news', 'News']];
  $('sourceList').innerHTML = groups.map(([cat, title]) => {
    const rows = platforms.filter(p => p.category === cat && p.capabilities.search);
    return `<div class="source-group">${title}</div>` + rows.map(p => {
      const k = p.apiKey;
      const hasKey = k && (k.configured || settings.apiKeys[p.id]);
      const badge = !k ? '<span class="badge badge--ok">free</span>'
        : k.configured ? '<span class="badge badge--ok">key on server</span>'
        : settings.apiKeys[p.id] ? '<span class="badge badge--ok">key saved</span>'
        : '<span class="badge">needs free key</span>';
      return `
        <div class="source-row">
          <input type="checkbox" id="src-${p.id}" data-src="${p.id}" ${settings.disabledSources.includes(p.id) ? '' : 'checked'} />
          <label for="src-${p.id}"><strong>${esc(p.displayName)}</strong>${badge}
            ${p.description ? `<p class="hint">${esc(p.description)}</p>` : ''}</label>
          ${k && !k.configured ? `
            <div class="source-key">
              <input type="password" data-key="${p.id}" placeholder="${hasKey ? '•••••• saved' : 'Paste API key'}" autocomplete="off" aria-label="${esc(p.displayName)} API key" />
              <a class="ghost-btn" href="${safeUrl(k.signupUrl)}" target="_blank" rel="noopener">Get key</a>
            </div>` : ''}
        </div>`;
    }).join('');
  }).join('');

  $('sourceList').querySelectorAll('[data-src]').forEach(cb => {
    cb.onchange = () => {
      const id = cb.dataset.src;
      settings.disabledSources = settings.disabledSources.filter(x => x !== id);
      if (!cb.checked) settings.disabledSources.push(id);
      saveSettings();
    };
  });
  $('sourceList').querySelectorAll('[data-key]').forEach(input => {
    input.onchange = () => {
      const id = input.dataset.key;
      const v = input.value.trim();
      if (v) settings.apiKeys[id] = v; else delete settings.apiKeys[id];
      saveSettings();
      renderSourceSettings();
      toast(v ? `${platformName(id)} key saved` : `${platformName(id)} key removed`);
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
}

async function loadAIStatus() {
  try {
    const s = await fetch('/api/analytics/status').then(r => r.json());
    const label = s.nvidia ? `NVIDIA · ${(s.nvidiaModel || '').split('/').pop()}`
      : s.available ? `Ollama · ${s.model}` : 'offline';
    $('aiPill').textContent = `AI: ${label}`;
    $('aiPill').classList.toggle('is-ok', Boolean(s.nvidia || s.available));
    $('aiInfo').innerHTML = s.nvidia
      ? `Using NVIDIA NIM (<code>${esc(s.nvidiaModel)}</code>)${s.available ? `, falling back to local Ollama (<code>${esc(s.model)}</code>)` : ''}.`
      : s.available
        ? `Using local Ollama (<code>${esc(s.model)}</code>). Set <code>NVIDIA_API_KEY</code> on the server for faster, better analysis.`
        : `No AI provider reachable. Set <code>NVIDIA_API_KEY</code> (free at build.nvidia.com) or start Ollama. Search still works; mood is then estimated from keywords.`;
  } catch {
    $('aiPill').textContent = 'AI: offline';
  }
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
    extra = { query: data.query, bundle: data.bundle, sources: data.sources, analysis: data.analysis };
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
  renderAll();
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
$('closeSettings').addEventListener('click', () => openSettings(false));
$('scrim').addEventListener('click', () => openSettings(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') openSettings(false); });

$('aiLanguage').value = settings.aiLanguage || 'en';
$('aiLanguage').addEventListener('change', () => {
  settings.aiLanguage = $('aiLanguage').value;
  saveSettings();
  // Re-run the analysis so the change is visible right away
  if (current?.results.length) { openSettings(false); runAI(); }
});

$('timeRange').value = settings.timeRange;
$('timeRange').addEventListener('change', () => { settings.timeRange = $('timeRange').value; saveSettings(); });
$('perSource').value = settings.perSource;
$('perSource').addEventListener('change', () => {
  settings.perSource = Math.min(50, Math.max(5, Number($('perSource').value) || 15));
  $('perSource').value = settings.perSource;
  saveSettings();
});

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
