// ── Feed catalogue ─────────────────────────────────────────────────────────────
const FEEDS = {
  us: [
    { name: 'AP News',          url: 'https://feeds.apnews.com/rss/topnews' },
    { name: 'NPR',              url: 'https://feeds.npr.org/1001/rss.xml' },
    { name: 'Reuters',          url: 'https://feeds.reuters.com/reuters/topNews' },
    { name: 'CNN Top Stories',  url: 'http://rss.cnn.com/rss/cnn_topstories.rss' },
    { name: 'NYT',              url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
    { name: 'Washington Post',  url: 'https://feeds.washingtonpost.com/rss/national' },
    { name: 'HuffPost',         url: 'https://www.huffpost.com/section/front-page/feed' },
    { name: 'Politico',         url: 'https://rss.politico.com/politics-news.xml' },
    { name: 'CNBC',             url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
    { name: 'Yahoo News',       url: 'https://news.yahoo.com/rss/' },
  ],
  tech: [
    { name: 'Hacker News',      url: 'https://hnrss.org/frontpage' },
    { name: 'Ars Technica',     url: 'https://feeds.arstechnica.com/arstechnica/index' },
    { name: 'The Verge',        url: 'https://www.theverge.com/rss/index.xml' },
    { name: 'TechCrunch',       url: 'https://techcrunch.com/feed/' },
    { name: 'Wired',            url: 'https://www.wired.com/feed/rss' },
    { name: 'MIT Tech Review',  url: 'https://www.technologyreview.com/topnews.rss' },
    { name: 'Engadget',         url: 'https://www.engadget.com/rss.xml' },
    { name: 'Gizmodo',          url: 'https://gizmodo.com/rss' },
    { name: 'VentureBeat',      url: 'https://venturebeat.com/feed/' },
    { name: 'The Next Web',     url: 'https://thenextweb.com/feed/' },
    { name: 'CNET',             url: 'https://www.cnet.com/rss/news/' },
    { name: 'Slashdot',         url: 'http://rss.slashdot.org/Slashdot/slashdotMain' },
  ],
  gaming: [
    { name: 'IGN',              url: 'https://feeds.feedburner.com/ign/games-all' },
    { name: 'Gamespot',         url: 'https://www.gamespot.com/feeds/mashup/' },
    { name: 'Polygon',          url: 'https://www.polygon.com/rss/index.xml' },
    { name: 'Kotaku',           url: 'https://kotaku.com/rss' },
    { name: 'Eurogamer',        url: 'https://www.eurogamer.net/feed' },
    { name: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed' },
    { name: 'PC Gamer',         url: 'https://www.pcgamer.com/rss/' },
    { name: 'PlayStation Blog', url: 'https://blog.playstation.com/feed/' },
    { name: 'Xbox Wire',        url: 'https://news.xbox.com/en-US/feed/' },
    { name: 'Nintendo Life',    url: 'https://www.nintendolife.com/feeds/news' },
    { name: 'GamesRadar',       url: 'https://www.gamesradar.com/rss/' },
  ],
  esports: [
    { name: 'HLTV (CS News)',   url: 'https://www.hltv.org/rss/news' },
    { name: 'Dot Esports',      url: 'https://dotesports.com/feed' },
    { name: 'TheGamer',         url: 'https://www.thegamer.com/feed/' },
    { name: 'Esports Insider',  url: 'https://esportsinsider.com/feed' },
    { name: 'Dexerto',          url: 'https://www.dexerto.com/feed/' },
    { name: 'ONE Esports',      url: 'https://www.oneesports.gg/feed/' },
  ],
  finland: [
    { name: 'Yle Uutiset',       url: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET' },
    { name: 'Yle News (EN)',     url: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_NEWS' },
    { name: 'Helsingin Sanomat', url: 'https://www.hs.fi/rss/tuoreimmat.xml' },
    { name: 'Ilta-Sanomat',      url: 'https://www.is.fi/rss/tuoreimmat.xml' },
    { name: 'Iltalehti',         url: 'https://www.iltalehti.fi/rss/uutiset.xml' },
    { name: 'MTV Uutiset',       url: 'https://www.mtvuutiset.fi/rss/uutiset.rss' },
    { name: 'Kauppalehti',       url: 'https://feeds.kauppalehti.fi/rss/main' },
    { name: 'Taloussanomat',     url: 'https://www.is.fi/taloussanomat/rss/tuoreimmat.xml' },
    { name: 'Aamulehti',         url: 'https://www.aamulehti.fi/rss/tuoreimmat.xml' },
    { name: 'Turun Sanomat',     url: 'https://www.ts.fi/rss/uutiset.xml' },
  ],
};

// ── Sentiment word lists ───────────────────────────────────────────────────────
const POS_WORDS = new Set([
  // outcomes / events
  'win','wins','won','victory','victories','champion','champions','championship',
  'record','records','breakthrough','breakthroughs','launch','launches','launched',
  'deal','deals','agreement','agreements','approved','approve','approves',
  'peace','ceasefire','rescue','rescued','survive','survived','survivor','survivors',
  'recover','recovery','recovered','returns','returned','restore','restored',
  // growth / improvement
  'growth','grow','grows','grew','improve','improved','improvement','improvements',
  'boost','boosted','boosts','rise','rises','rising','rose','gain','gains','gained',
  'increase','increased','increases','expand','expanded','expansion','accelerate',
  'upgrade','upgrades','upgraded','advance','advances','advancing','advanced',
  'progress','progressing','strengthen','strengthened','strengthens',
  // positive descriptors
  'best','top','leading','historic','historic','landmark','major','successful',
  'success','celebrate','celebration','celebrated','positive','promising',
  'innovative','innovation','revolutionary','groundbreaking','remarkable',
  // finance / business
  'profit','profits','profitable','revenue','revenues','surplus','dividend',
  'invest','invests','invested','investment','funding','funded','fund',
  'partnership','partnerships','merger','acquisition','hire','hiring','hired',
  'jobs','job','employ','employment','employed','raise','raised',
  // help / support
  'help','helps','helped','support','supports','supported','aid','aided',
  'save','saves','saved','protect','protects','protected','benefit','benefits',
  'achieve','achieved','achievement','achievements','solve','solved','solution',
  'create','created','creates','build','builds','built','open','opened','opens',
  // science / health positive
  'cure','cured','vaccine','vaccinated','treatment','effective','safe','approved',
  'discover','discovered','discovery','found','breakthrough',
  // Finnish positive
  'voitti','voitto','kasvu','paranee','parani','sopimus','pelasti','menestys',
  'uusi','avaa','investoi','kehitys','edistys','hyväksyttiin','pelastui',
]);

const NEG_WORDS = new Set([
  // death / violence
  'dead','death','deaths','die','dies','died','dying','kill','kills','killed',
  'murder','murders','murdered','shooting','shot','shootings','stabbing','stabbed',
  'attack','attacks','attacked','attacker','assault','assaulted','assaults',
  'explosion','exploded','bomb','bombing','bombed','terror','terrorist','terrorism',
  'war','wars','conflict','conflicts','battle','battles','fighting','fought',
  'riot','riots','violence','violent','protest','protests','protesting',
  // disaster / crisis
  'crash','crashes','crashed','disaster','disasters','catastrophe','catastrophic',
  'crisis','crises','emergency','emergencies','evacuate','evacuated','evacuation',
  'flood','floods','flooded','flooding','earthquake','hurricane','tornado','wildfire',
  'drought','famine','epidemic','pandemic','outbreak','disease','infection',
  'fire','fires','burning','burned','burnt','collapse','collapsed','collapses',
  // crime / legal
  'arrest','arrests','arrested','charged','charges','indicted','indictment',
  'convicted','conviction','sentenced','prison','imprisoned','jail','jailed',
  'lawsuit','sued','sues','scandal','corruption','fraud','bribery','bribed',
  'hack','hacked','breach','breached','stolen','steal','theft','rob','robbed',
  'robbery','abuse','abused','abuser','rape','raped','trafficking',
  // failure / decline
  'fail','fails','failed','failure','failures','bankrupt','bankruptcy',
  'collapse','crisis','recession','depression','downturn','decline','declined',
  'declines','declining','drop','drops','dropped','fall','falls','fell','fallen',
  'loss','losses','lose','lost','cut','cuts','cutting','layoff','layoffs','fired',
  'resign','resigns','resigned','resignation','dismiss','dismissed','shutdown',
  'ban','banned','bans','sanction','sanctions','sanctioned','restrict','restricted',
  'recall','recalled','fine','fined','penalty','penalized','suspend','suspended',
  // threat / warning
  'threat','threats','threaten','threatened','warning','warnings','warn','warned',
  'danger','dangerous','risk','risks','risky','hazard','hazardous','toxic',
  'harmful','harm','harms','harmed','damage','damages','damaged','injury','injuries',
  'injured','hurt','hurts','wounded','wound','suffer','suffering','suffered',
  // Finnish negative
  'kuoli','kuollut','kuolema','hyökkäys','sota','kriisi','onnettomuus','tapaturma',
  'pidätettiin','tuomittiin','katastrofi','tulva','tulipalo','räjähdys','iski',
  'menetys','konkurssi','irtisanottiin','uhka','varoitus','vaarallinen',
]);

function scoreSentiment(article) {
  // Weight the title 3x — it's the most signal-dense part
  const title = (article.title || '').toLowerCase();
  const body  = (article.content || '').substring(0, 400).toLowerCase();
  const titleWords = title.match(/\b\w+\b/g) || [];
  const bodyWords  = body.match(/\b\w+\b/g)  || [];

  let pos = 0, neg = 0;
  for (const w of titleWords) {
    if (POS_WORDS.has(w)) pos += 3;
    if (NEG_WORDS.has(w)) neg += 3;
  }
  for (const w of bodyWords) {
    if (POS_WORDS.has(w)) pos++;
    if (NEG_WORDS.has(w)) neg++;
  }

  if (pos === 0 && neg === 0) return 'neutral';
  // Require at least a 2-point lead to avoid noise from one ambiguous word
  if (pos - neg >= 2) return 'positive';
  if (neg - pos >= 2) return 'negative';
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

function classifyArticles() {
  for (const a of lastArticles) {
    a._sentiment = scoreSentiment(a);
  }
}

// ── State ──────────────────────────────────────────────────────────────────────
let currentCat = 'us';
let lastArticles = [];
let activeFilter = null;

const catTabs   = document.getElementById('catTabs');
const feedGrid  = document.getElementById('feedGrid');
const feedCount = document.getElementById('feedCount');
const loadBtn   = document.getElementById('loadBtn');
const analyzeBtn= document.getElementById('analyzeBtn');
const statusEl  = document.getElementById('status');
const resultsEl = document.getElementById('results');
const aiPanel   = document.getElementById('aiPanel');
const aiContent = document.getElementById('aiContent');
const limitInput= document.getElementById('limitInput');

// ── Category tabs ──────────────────────────────────────────────────────────────
catTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.cat-tab');
  if (!tab) return;
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  currentCat = tab.dataset.cat;
  renderFeedGrid();
});

function renderFeedGrid() {
  const feeds = FEEDS[currentCat] || [];
  feedGrid.innerHTML = feeds.map((f, i) => `
    <label class="feed-item" data-idx="${i}">
      <input type="checkbox" />
      <span class="feed-dot"></span>
      ${escapeHtml(f.name)}
    </label>`).join('');

  feedGrid.querySelectorAll('.feed-item').forEach(item => {
    item.addEventListener('click', () => {
      const cb = item.querySelector('input');
      cb.checked = !cb.checked;
      item.classList.toggle('checked', cb.checked);
      updateCount();
    });
  });
  updateCount();
}

function updateCount() {
  const total   = feedGrid.querySelectorAll('.feed-item').length;
  const checked = feedGrid.querySelectorAll('.feed-item.checked').length;
  feedCount.textContent = `${checked} / ${total} feeds selected`;
}

document.getElementById('selectAll').addEventListener('click', () => {
  feedGrid.querySelectorAll('.feed-item').forEach(item => {
    item.querySelector('input').checked = true;
    item.classList.add('checked');
  });
  updateCount();
});

document.getElementById('selectNone').addEventListener('click', () => {
  feedGrid.querySelectorAll('.feed-item').forEach(item => {
    item.querySelector('input').checked = false;
    item.classList.remove('checked');
  });
  updateCount();
});

// ── Load news ──────────────────────────────────────────────────────────────────
loadBtn.addEventListener('click', loadNews);

async function loadNews() {
  const feeds = FEEDS[currentCat] || [];
  const selected = [...feedGrid.querySelectorAll('.feed-item.checked')]
    .map(el => feeds[Number(el.dataset.idx)]?.url)
    .filter(Boolean);

  if (!selected.length) {
    setStatus('Select at least one feed.', 'error');
    return;
  }

  const limit = Number(limitInput.value) || 10;

  setStatus('Loading news…');
  resultsEl.innerHTML = '';
  hideAI();
  lastArticles = [];
  activeFilter = null;
  loadBtn.disabled = true;
  loadBtn.textContent = 'Loading…';

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platforms: ['rss'],
        mode: 'latest',
        channels: selected,
        limit,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load feeds');

    lastArticles = data.results || [];

    let msg = `${lastArticles.length} article${lastArticles.length !== 1 ? 's' : ''} loaded`;
    if (data.platformErrors?.rss) msg += ` (some feeds failed)`;
    setStatus(msg);

    renderArticles(lastArticles);
    if (lastArticles.length > 0) analyzeBtn.classList.add('visible');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    loadBtn.disabled = false;
    loadBtn.textContent = 'Load News';
  }
}

// ── Render articles ────────────────────────────────────────────────────────────
const SENTIMENT_DOT = { positive: '#10b981', neutral: '#6366f1', negative: '#ef4444' };

function renderArticles(articles) {
  if (!articles.length) {
    resultsEl.innerHTML = '<p style="color:var(--muted)">No articles found. Some feeds may be temporarily unavailable.</p>';
    return;
  }

  const filtered = activeFilter ? articles.filter(a => a._sentiment === activeFilter) : articles;

  const filterBar = activeFilter ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:13px;color:var(--muted)">
      <span>Showing <strong style="color:${SENTIMENT_DOT[activeFilter]}">${activeFilter}</strong> articles (${filtered.length})</span>
      <button id="clearFilter" style="padding:3px 10px;font-size:12px;background:transparent;border:1px solid var(--line);color:var(--muted);border-radius:6px;cursor:pointer">Show all</button>
    </div>` : '';

  resultsEl.innerHTML = filterBar + filtered.map(a => {
    const title   = escapeHtml(a.title || '(no title)');
    const source  = escapeHtml(a.metadata?.feedTitle || a.author || a.platform || '');
    const snippet = escapeHtml((a.content || '').substring(0, 200));
    const url     = a.url || '#';
    const date    = a.createdAt ? new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const dotColor = a._sentiment ? SENTIMENT_DOT[a._sentiment] : null;

    return `
      <div class="news-card">
        <div class="news-card-h">
          <span class="news-source">${source}</span>
          <a href="${url}" target="_blank" rel="noopener" class="news-title">${title}</a>
          ${dotColor ? `<span title="${a._sentiment}" style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-left:auto;margin-top:4px"></span>` : ''}
        </div>
        ${date ? `<div class="news-meta"><span>${date}</span></div>` : ''}
        ${snippet ? `<div class="news-snippet">${snippet}</div>` : ''}
      </div>`;
  }).join('');

  if (activeFilter) {
    document.getElementById('clearFilter')?.addEventListener('click', () => {
      activeFilter = null;
      clearSentimentHighlight();
      renderArticles(lastArticles);
    });
  }
}

// ── AI Analysis ────────────────────────────────────────────────────────────────
analyzeBtn.addEventListener('click', async () => {
  if (!lastArticles.length) return;
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing…';
  showAILoading();

  try {
    const res = await fetch('/api/analytics/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: lastArticles }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Analysis failed');
    classifyArticles();
    renderAI(data);
    renderArticles(lastArticles);
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
      <span>Running AI analysis — may take 30–60 s on first run…</span>
    </div>`;
}

function showAIError(msg) {
  aiPanel.classList.add('visible');
  const isDown = msg.toLowerCase().includes('ollama') || msg.toLowerCase().includes('503');
  aiContent.innerHTML = `<div class="ai-error">
    ${isDown
      ? `<strong>Ollama is not ready.</strong><br>
         The model may still be loading. Wait 30 seconds and try again.<br>
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

function clearSentimentHighlight() {
  document.querySelectorAll('.s-row').forEach(r => r.classList.remove('s-active'));
}

function renderAI(a) {
  const moodColor = {
    excited: '#34d399', curious: '#60a5fa', positive: '#34d399',
    negative: '#f87171', frustrated: '#f87171', critical: '#fb923c',
    mixed: '#a78bfa', neutral: '#94a3b8'
  }[a.mood] || '#a78bfa';

  const sentimentRows = [
    { label: 'Positive', cls: 'pos', key: 'positive', pct: a.sentiment.positive },
    { label: 'Neutral',  cls: 'neu', key: 'neutral',  pct: a.sentiment.neutral  },
    { label: 'Negative', cls: 'neg', key: 'negative', pct: a.sentiment.negative  },
  ].map(r => `
    <div class="s-row s-clickable" data-s="${r.key}" title="Click to filter ${r.label.toLowerCase()} articles">
      <span class="s-label">${r.label}</span>
      <div class="s-track"><div class="s-fill ${r.cls}" style="width:${r.pct}%"></div></div>
      <span class="s-pct">${r.pct}%</span>
    </div>`).join('');

  const themes   = (a.themes   || []).map(t => `<span class="theme-chip">${escapeHtml(t)}</span>`).join('');
  const insights = (a.insights || []).map(i => `<li>${escapeHtml(i)}</li>`).join('');

  const providerLabel = a.provider
    ? (a.provider.startsWith('nvidia') ? '⚡ NVIDIA NIM' : '🖥 Ollama')
    : '';

  aiContent.innerHTML = `
    <div class="ai-status-row">
      <span>${escapeHtml(String(a.postCount))} articles analysed</span>
      <span style="color:var(--line)">·</span>
      <span class="mood-badge" style="background:${moodColor}22;color:${moodColor}">${escapeHtml(a.mood)}</span>
      ${providerLabel ? `<span style="margin-left:auto;font-size:11px;color:var(--muted);opacity:0.7">${providerLabel}</span>` : ''}
    </div>
    <div class="ai-section">
      <div class="ai-section-title">Sentiment — <span style="font-weight:400;text-transform:none;letter-spacing:0">click a bar to filter articles</span></div>
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

  // Wire up sentiment filter clicks
  aiContent.querySelectorAll('.s-row.s-clickable').forEach(row => {
    row.addEventListener('click', () => {
      const s = row.dataset.s;
      if (activeFilter === s) {
        activeFilter = null;
        clearSentimentHighlight();
      } else {
        activeFilter = s;
        clearSentimentHighlight();
        row.classList.add('s-active');
      }
      renderArticles(lastArticles);
    });
  });
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

// ── Init ───────────────────────────────────────────────────────────────────────
renderFeedGrid();
