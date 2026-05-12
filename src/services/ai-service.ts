import axios from 'axios';
import { Post } from '../models/post';
import { logger } from '../utils/logger';

export interface AIAnalysis {
  sentiment: { positive: number; neutral: number; negative: number };
  themes: string[];
  summary: string;
  mood: string;
  insights: string[];
  postCount: number;
  analyzedAt: string;
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

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

function buildPrompt(posts: Post[], keyword?: string): string {
  const lines = posts.slice(0, 25).map((p, i) => {
    const topComment = (p.comments ?? [])[0];
    const commentLine = topComment ? `  top comment: ${(topComment.body ?? '').substring(0, 100)}` : '';
    const body = (p.content ?? p.title ?? '').substring(0, 150);
    return `[${i + 1}] score:${p.engagement.score} | ${p.title}\n${body !== p.title ? body : ''}${commentLine}`;
  });

  const topic = keyword ? `about "${keyword}"` : 'from social media';

  return `Analyze ${posts.length} posts ${topic}. Reply with ONLY a JSON object, no other text.

Posts:
${lines.join('\n')}

Return this exact JSON (replace the example values with real analysis):
{
  "sentiment": {"positive": 35, "neutral": 45, "negative": 20},
  "themes": ["theme one", "theme two", "theme three", "theme four"],
  "summary": "Write 2-3 sentences describing what people discuss and the overall tone.",
  "mood": "mixed",
  "insights": ["First interesting observation.", "Second interesting observation.", "Third observation."]
}

Rules: positive+neutral+negative must equal 100. mood must be one of: excited, curious, frustrated, critical, positive, negative, mixed.`;
}

export async function analyzeWithAI(posts: Post[], keyword?: string): Promise<AIAnalysis> {
  await ensureModel();

  const prompt = buildPrompt(posts, keyword);

  logger.info(`Sending ${posts.length} posts to Ollama (${OLLAMA_MODEL}) for analysis`);

  const { data } = await axios.post(
    `${OLLAMA_HOST}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      format: 'json',   // forces valid JSON output
      stream: false,
      options: { temperature: 0.2 }
    },
    { timeout: 120_000 }
  );

  let parsed: any;
  try {
    parsed = typeof data.response === 'string' ? JSON.parse(data.response) : data.response;
  } catch {
    throw new Error('Ollama returned invalid JSON. Try a larger model via OLLAMA_MODEL env var (e.g. llama3.2:3b).');
  }

  // Normalise sentiment — ensure it's a proper object and sums to 100
  let s = parsed.sentiment;
  if (!s || typeof s !== 'object' || Array.isArray(s)) {
    s = { positive: 33, neutral: 34, negative: 33 };
  }
  const pos = Math.max(0, Number(s.positive) || 0);
  const neu = Math.max(0, Number(s.neutral)  || 0);
  const neg = Math.max(0, Number(s.negative) || 0);
  const total = pos + neu + neg;
  if (total === 0) {
    s = { positive: 33, neutral: 34, negative: 33 };
  } else if (total !== 100) {
    const f = 100 / total;
    const np = Math.round(pos * f);
    const nn = Math.round(neg * f);
    s = { positive: np, neutral: 100 - np - nn, negative: nn };
  } else {
    s = { positive: pos, neutral: neu, negative: neg };
  }

  const validMoods = new Set(['excited', 'curious', 'frustrated', 'critical', 'positive', 'negative', 'mixed']);
  const mood = validMoods.has(parsed.mood) ? parsed.mood : 'mixed';

  const themes = Array.isArray(parsed.themes)
    ? parsed.themes.filter((t: any) => typeof t === 'string' && t.trim()).slice(0, 8)
    : [];
  const insights = Array.isArray(parsed.insights)
    ? parsed.insights.filter((i: any) => typeof i === 'string' && i.trim()).slice(0, 4)
    : [];

  return {
    sentiment: s,
    themes,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    mood,
    insights,
    postCount: posts.length,
    analyzedAt: new Date().toISOString()
  };
}

export async function checkOllamaStatus(): Promise<{ available: boolean; model: string; host: string }> {
  try {
    await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 3000 });
    return { available: true, model: OLLAMA_MODEL, host: OLLAMA_HOST };
  } catch {
    return { available: false, model: OLLAMA_MODEL, host: OLLAMA_HOST };
  }
}
