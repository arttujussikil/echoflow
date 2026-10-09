import axios from 'axios';
import { Post } from '../models/post';
import { logger } from '../utils/logger';

export type SentimentLabel = 'pos' | 'neu' | 'neg';

export interface AIAnalysis {
  /** Percentages computed from the per-post labels (so the bar matches the list) */
  sentiment: { positive: number; neutral: number; negative: number };
  /** One label per post sent, in order; null where the model gave no label */
  articleLabels?: (SentimentLabel | null)[];
  /** Short reason for each label (same order), shown when hovering a post's mood */
  articleReasons?: (string | null)[];
  themes: string[];
  summary: string;
  /** The model's own take on the results (shown as "AI's opinion") */
  opinion: string;
  mood: string;
  insights: string[];
  postCount: number;
  /** How many posts got an AI label */
  labelledCount: number;
  analyzedAt: string;
  provider?: string;
  language: AILanguage;
}

/** Language of the AI's written output (summary, opinion, reasons). Labels stay pos/neu/neg. */
export type AILanguage = 'en' | 'fi';
const LANGUAGE_RULE: Record<AILanguage, string> = {
  en: 'Write all text values in English.',
  fi: 'Write all text values in Finnish (suomeksi), even if the posts are in English.',
};

// ── Config ─────────────────────────────────────────────────────────────────────
const OLLAMA_HOST  = process.env.OLLAMA_HOST  || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
/**
 * Comma-separated, tried in order. Picked with eval/sentiment-benchmark.ts
 * (see docs/ai-design.md): with the labelling prompt below, nemotron-3-super got
 * 98% and nemotron-3-ultra 97% on 50 hand-labelled posts; super is ~2x faster and
 * ultra's free endpoint is often busy (503), so ultra is the backup.
 */
const NVIDIA_MODELS = (process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b,nvidia/nemotron-3-ultra-550b-a55b')
  .split(',').map(m => m.trim()).filter(Boolean);
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';

/** Posts per labelling request — small enough that models don't lose count. */
const LABEL_BATCH = 40;
/** Upper bound on posts labelled per analysis */
const MAX_LABELLED = 200;
/** Posts shown to the model for the summary / opinion */
const SUMMARY_POSTS = 25;

// ── LLM plumbing ───────────────────────────────────────────────────────────────
function extractJSON(raw: string): any {
  let s = (raw || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) s = fence[1].trim();
  // Some models wrap the object in prose; take the outermost {...}
  if (!s.startsWith('{')) {
    const obj = s.match(/\{[\s\S]*\}/);
    if (obj) s = obj[0];
  }
  return JSON.parse(s);
}

const JSON_SYSTEM = 'You are a JSON-only response API. Always respond with valid JSON and absolutely nothing else. No markdown, no code blocks, no explanations.';

/** One NVIDIA NIM call that must return JSON. Exported for eval/sentiment-benchmark.ts. */
export async function nvidiaJSON(model: string, prompt: string, maxTokens: number): Promise<any> {
  const { data } = await axios.post(
    `${NVIDIA_BASE}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: JSON_SYSTEM },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      top_p: 0.7,
      max_tokens: maxTokens,
      // Nemotron 3 models "think" before answering by default, which is slow and
      // not needed for JSON classification — switch it off for them.
      ...(/nemotron-3/.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    },
    {
      headers: { Authorization: `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60_000,
    }
  );
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error(`${model} returned an empty response`);
  try {
    return extractJSON(raw);
  } catch {
    throw new Error(`${model} returned invalid JSON`);
  }
}

async function ensureModel(): Promise<void> {
  try {
    const { data } = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 5000 });
    const names: string[] = (data.models ?? []).map((m: any) => m.name as string);
    const loaded = names.some(n => n.startsWith(OLLAMA_MODEL.split(':')[0]));
    if (!loaded) {
      logger.info(`Pulling Ollama model ${OLLAMA_MODEL} — this only happens once…`);
      await axios.post(`${OLLAMA_HOST}/api/pull`, { name: OLLAMA_MODEL }, { timeout: 600_000 });
      logger.info(`Model ${OLLAMA_MODEL} ready`);
    }
  } catch (err: any) {
    throw new Error(`Ollama is not reachable at ${OLLAMA_HOST}: ${err.message}`);
  }
}

async function ollamaJSON(prompt: string): Promise<any> {
  await ensureModel();
  const { data } = await axios.post(
    `${OLLAMA_HOST}/api/generate`,
    { model: OLLAMA_MODEL, prompt, format: 'json', stream: false, options: { temperature: 0.1 } },
    { timeout: 120_000 }
  );
  try {
    return typeof data.response === 'string' ? JSON.parse(data.response) : data.response;
  } catch {
    throw new Error('Ollama returned invalid JSON. Try a larger model via OLLAMA_MODEL (e.g. llama3.1:8b).');
  }
}

/**
 * Ask for JSON: each NVIDIA model in turn, then local Ollama.
 * `accept` lets the caller reject a structurally useless answer so the next model is tried.
 */
async function askJSON(
  prompt: string,
  task: string,
  maxTokens: number,
  accept: (parsed: any) => boolean = () => true
): Promise<{ parsed: any; provider: string }> {
  if (NVIDIA_API_KEY) {
    for (const model of NVIDIA_MODELS) {
      try {
        const t = Date.now();
        const parsed = await nvidiaJSON(model, prompt, maxTokens);
        if (!accept(parsed)) throw new Error('answer did not have the expected shape');
        logger.info(`${task}: ${model} answered in ${Date.now() - t} ms`);
        return { parsed, provider: `nvidia:${model}` };
      } catch (err: any) {
        logger.warn(`${task}: NVIDIA ${model} failed, trying next: ${err.response?.status ?? ''} ${err.message}`);
      }
    }
  }
  const parsed = await ollamaJSON(prompt);
  return { parsed, provider: `ollama:${OLLAMA_MODEL}` };
}

// ── Per-post sentiment labels ──────────────────────────────────────────────────
// Each post gets its own numbered key in the answer. A plain array ("one label per
// post, in order") made models drift after ~10 items and fill the rest with "pos".
export function buildLabelPrompt(posts: Post[], language: AILanguage = 'en'): string {
  const lines = posts.map((p, i) => {
    const title = (p.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const body = (p.content ?? '').replace(/\s+/g, ' ').trim();
    const extra = body && !body.startsWith(title.slice(0, 40)) ? ` — ${body.slice(0, 160)}` : '';
    return `${i + 1}. ${title}${extra}`;
  });

  return `Classify the sentiment of each numbered post.

pos = good news or a happy/approving tone (success, achievement, growth, praise, joy)
neg = bad news or an unhappy/critical tone (harm, conflict, loss, accusations, bans, cuts, complaints, outrage)
neu = factual, informational, a question, mixed or unclear
Judge what the post actually reports or expresses, not single words: "factory closes, 300 lose jobs" is neg even though "jobs" sounds positive; "top 10 picks for this weekend" is neu; a match report is neu unless it clearly celebrates or laments.
Posts may be in Finnish or other languages.

Posts:
${lines.join('\n')}

Reply with ONLY a JSON object with one key per post number. Each value has "s" (the label: "pos", "neu" or "neg") and "r" (the reason, max 8 words), e.g.
{"1":{"s":"neg","r":"factory closing, jobs lost"},"2":{"s":"neu","r":"listing picks, no opinion"}}
Include all ${posts.length} numbers. ${LANGUAGE_RULE[language]}`;
}

const VALID_LABELS = new Set<SentimentLabel>(['pos', 'neu', 'neg']);

export interface LabelResult {
  labels: (SentimentLabel | null)[];
  reasons: (string | null)[];
}

/** Accepts {"1":{"s":"neg","r":"..."}} and the plain {"1":"neg"} form. */
export function readLabels(parsed: any, count: number): LabelResult {
  const src = parsed?.labels && typeof parsed.labels === 'object' ? parsed.labels : parsed;
  const labels: (SentimentLabel | null)[] = [];
  const reasons: (string | null)[] = [];
  for (let i = 0; i < count; i++) {
    const entry = src?.[String(i + 1)];
    const isObj = typeof entry === 'object' && entry !== null;
    const raw = isObj ? entry.s ?? entry.label ?? entry.sentiment : entry;
    const v = String(raw ?? '').toLowerCase().slice(0, 3) as SentimentLabel;
    labels.push(VALID_LABELS.has(v) ? v : null);
    const r = isObj ? entry.r ?? entry.reason : null;
    reasons.push(typeof r === 'string' && r.trim() ? r.trim().slice(0, 120) : null);
  }
  return { labels, reasons };
}

async function labelBatch(posts: Post[], language: AILanguage): Promise<LabelResult & { provider: string }> {
  // Reject answers that cover less than 80% of the batch so the next model gets a go
  const enough = (parsed: any) => readLabels(parsed, posts.length).labels.filter(Boolean).length >= posts.length * 0.8;
  // A short reason per post makes the answer ~1-2k tokens for a batch of 40
  const { parsed, provider } = await askJSON(buildLabelPrompt(posts, language), `label ${posts.length} posts`, 3000, enough);
  return { ...readLabels(parsed, posts.length), provider };
}

export async function labelSentiment(posts: Post[], language: AILanguage = 'en'): Promise<LabelResult & { provider?: string }> {
  const batches: Post[][] = [];
  for (let i = 0; i < Math.min(posts.length, MAX_LABELLED); i += LABEL_BATCH) {
    batches.push(posts.slice(i, Math.min(i + LABEL_BATCH, MAX_LABELLED)));
  }
  const results = await Promise.allSettled(batches.map(b => labelBatch(b, language)));
  const labels: (SentimentLabel | null)[] = [];
  const reasons: (string | null)[] = [];
  let provider: string | undefined;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      labels.push(...r.value.labels);
      reasons.push(...r.value.reasons);
      provider ??= r.value.provider;
    } else {
      logger.warn(`Labelling batch ${i + 1} failed: ${r.reason?.message}`);
      labels.push(...batches[i].map(() => null));
      reasons.push(...batches[i].map(() => null));
    }
  });
  while (labels.length < posts.length) { labels.push(null); reasons.push(null); }
  return { labels, reasons, provider };
}

// ── Summary / opinion ──────────────────────────────────────────────────────────
function buildSummaryPrompt(posts: Post[], keyword: string | undefined, language: AILanguage): string {
  const lines = posts.slice(0, SUMMARY_POSTS).map((p, i) => {
    const topComment = (p.comments ?? [])[0];
    const commentLine = topComment ? `\n  top comment: ${(topComment.body ?? '').substring(0, 100)}` : '';
    const body = (p.content ?? '').replace(/\s+/g, ' ').substring(0, 150);
    return `[${i + 1}] (${p.platform}, score ${p.engagement?.score ?? 0}) ${p.title}${body && body !== p.title ? `\n  ${body}` : ''}${commentLine}`;
  });
  const topic = keyword ? `about "${keyword}"` : 'from social media and news';

  return `Here are ${lines.length} posts ${topic}. Reply with ONLY a JSON object, no other text.

Posts:
${lines.join('\n')}

Return this JSON (replace the example values):
{
  "sentiment": {"positive": 35, "neutral": 45, "negative": 20},
  "themes": ["theme one", "theme two", "theme three", "theme four"],
  "summary": "2-3 sentences: what people discuss and the overall tone.",
  "opinion": "Your own direct take in 2-3 sentences: what this coverage means, what stands out, and whether the reaction seems justified. Take a stance.",
  "mood": "mixed",
  "insights": ["First interesting observation.", "Second observation.", "Third observation."]
}

Rules:
- sentiment percentages add up to 100 (bad news and criticism count as negative)
- mood is one of: excited, curious, frustrated, critical, positive, negative, mixed, neutral
- Posts may be in Finnish or other languages; analyse their meaning regardless of language
- ${LANGUAGE_RULE[language]} Keep the JSON keys and the mood value in English.`;
}

const VALID_MOODS = new Set(['excited', 'curious', 'frustrated', 'critical', 'positive', 'negative', 'mixed', 'neutral']);

function percentages(pos: number, neu: number, neg: number): AIAnalysis['sentiment'] {
  const total = pos + neu + neg;
  if (total <= 0) return { positive: 33, neutral: 34, negative: 33 };
  const p = Math.round((pos / total) * 100);
  const n = Math.round((neg / total) * 100);
  return { positive: p, neutral: 100 - p - n, negative: n };
}

function strings(v: any, max: number): string[] {
  return Array.isArray(v) ? v.filter((x: any) => typeof x === 'string' && x.trim()).slice(0, max) : [];
}

// ── Public API ─────────────────────────────────────────────────────────────────
/**
 * Two independent requests in parallel:
 *  - summary / opinion / themes from the first SUMMARY_POSTS posts
 *  - a sentiment label for every post (batched)
 * The sentiment bar is computed from the labels so it always matches the coloured list.
 */
export async function analyzeWithAI(posts: Post[], keyword?: string, language: AILanguage = 'en'): Promise<AIAnalysis> {
  logger.info(`AI analysis of ${posts.length} posts${keyword ? ` about "${keyword}"` : ''}`);
  const [summaryRes, labelRes] = await Promise.allSettled([
    askJSON(buildSummaryPrompt(posts, keyword, language), 'summary', 2048, p => typeof p?.summary === 'string'),
    labelSentiment(posts, language),
  ]);

  if (summaryRes.status === 'rejected' && (labelRes.status === 'rejected' || !labelRes.value.labels.some(Boolean))) {
    throw summaryRes.reason;
  }

  const summary = summaryRes.status === 'fulfilled' ? summaryRes.value.parsed : {};
  const labels = labelRes.status === 'fulfilled' ? labelRes.value.labels : posts.map(() => null);
  const reasons = labelRes.status === 'fulfilled' ? labelRes.value.reasons : posts.map(() => null);
  const labelled = labels.filter(Boolean) as SentimentLabel[];

  let sentiment: AIAnalysis['sentiment'];
  if (labelled.length > 0) {
    sentiment = percentages(
      labelled.filter(l => l === 'pos').length,
      labelled.filter(l => l === 'neu').length,
      labelled.filter(l => l === 'neg').length
    );
  } else {
    const s = summary.sentiment ?? {};
    sentiment = percentages(Number(s.positive) || 0, Number(s.neutral) || 0, Number(s.negative) || 0);
  }

  return {
    sentiment,
    articleLabels: labels,
    articleReasons: reasons,
    labelledCount: labelled.length,
    themes: strings(summary.themes, 8),
    summary: typeof summary.summary === 'string' ? summary.summary : '',
    opinion: typeof summary.opinion === 'string' ? summary.opinion : '',
    mood: VALID_MOODS.has(summary.mood) ? summary.mood : 'mixed',
    insights: strings(summary.insights, 4),
    postCount: posts.length,
    analyzedAt: new Date().toISOString(),
    language,
    provider: summaryRes.status === 'fulfilled'
      ? summaryRes.value.provider
      : labelRes.status === 'fulfilled' ? labelRes.value.provider : undefined,
  };
}

// ── Recommendations ────────────────────────────────────────────────────────────
export interface RecommendationResult {
  recommendations: Array<{ name: string; mentions: number; context: string }>;
  query: string;
  postCount: number;
  analyzedAt: string;
  provider?: string;
}

function buildRecsPrompt(posts: Post[], query: string): string {
  const lines = posts.slice(0, 20).map((p, i) => {
    const comments = (p.comments ?? []).slice(0, 3)
      .map(c => `  - ${(c.body ?? '').substring(0, 120)}`).join('\n');
    const body = (p.content ?? p.title ?? '').substring(0, 150);
    return `[${i + 1}] ${p.title}\n${body !== p.title ? body + '\n' : ''}${comments}`;
  });

  return `Extract specific recommendations from these ${posts.length} posts about "${query}".

Posts:
${lines.join('\n\n')}

Return ONLY this JSON (no other text):
{
  "recommendations": [
    { "name": "Item Name", "mentions": 3, "context": "Brief reason why recommended, max 100 chars" },
    { "name": "Another Item", "mentions": 2, "context": "Why people like it" }
  ]
}

Rules:
- Extract only concrete named items (specific products, tools, books, movies, apps, games, etc.)
- mentions = how many times this item appears across all posts and comments combined
- context = the most common reason people give for recommending it, max 100 chars
- Sort by mentions descending, include up to 20 items
- Skip vague or generic answers (e.g. "Google it", "depends on your needs")
- Return empty array if no clear named items are found`;
}

export async function extractRecommendations(posts: Post[], query: string): Promise<RecommendationResult> {
  const { parsed, provider } = await askJSON(buildRecsPrompt(posts, query), `recs "${query}"`, 2048,
    p => Array.isArray(p?.recommendations));
  const recommendations = (Array.isArray(parsed?.recommendations) ? parsed.recommendations : [])
    .filter((r: any) => r && typeof r.name === 'string' && r.name.trim())
    .map((r: any) => ({
      name: String(r.name).trim(),
      mentions: Math.max(1, Number(r.mentions) || 1),
      context: typeof r.context === 'string' ? r.context.trim().substring(0, 120) : '',
    }))
    .slice(0, 20);
  return { recommendations, query, postCount: posts.length, analyzedAt: new Date().toISOString(), provider };
}

export async function checkOllamaStatus(): Promise<{ available: boolean; model: string; nvidiaModel: string; nvidiaModels: string[]; host: string; nvidia: boolean }> {
  const base = { model: OLLAMA_MODEL, nvidiaModel: NVIDIA_MODELS[0] ?? '', nvidiaModels: NVIDIA_MODELS, host: OLLAMA_HOST, nvidia: Boolean(NVIDIA_API_KEY) };
  try {
    await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 3000 });
    return { available: true, ...base };
  } catch {
    return { available: false, ...base };
  }
}
