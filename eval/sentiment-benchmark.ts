/**
 * Sentiment benchmark: how well do different models label posts as pos / neu / neg?
 *
 * Scores each model against hand-labelled posts (eval/headlines.json) using the
 * exact labelling prompt the app uses (buildLabelPrompt in ai-service.ts), plus:
 *   - the keyword method (public/sentiment-keywords.js) as a non-AI baseline
 *   - optionally the old "array" prompt, to show why the app uses numbered keys
 *
 * Usage (needs NVIDIA_API_KEY in .env):
 *   npm run eval
 *   npm run eval -- --models nvidia/nemotron-3-super-120b-a12b --runs 3
 *   npm run eval -- --prompt both --out eval/results/2026-10-09.md
 *
 * Options:
 *   --models a,b   models to test (default: the app's chain + nemotron-3.5-lightning)
 *   --runs N       repeat each model N times (default 2); results vary run to run
 *   --prompt P     numbered (default) | array | both
 *   --out FILE     also write the markdown report to FILE
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { buildLabelPrompt, readLabels, nvidiaJSON, SentimentLabel } from '../src/services/ai-service';
import { Post } from '../src/models/post';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { keywordSentiment } = require('../public/sentiment-keywords.js');

interface Item { text: string; accept: SentimentLabel[] }
interface RunResult { correct: number; labelled: number; ms: number; wrong: string[]; error?: string }

const DEFAULT_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
];

// ── Args ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const models = (arg('models') ?? DEFAULT_MODELS.join(',')).split(',').map(s => s.trim()).filter(Boolean);
const runs = Math.max(1, Number(arg('runs') ?? 2));
const promptMode = (arg('prompt') ?? 'numbered') as 'numbered' | 'array' | 'both';
const outFile = arg('out');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'headlines.json'), 'utf8'));
const items: Item[] = data.items;
const posts: Post[] = items.map((it, i) => ({
  id: String(i + 1), platform: 'eval', title: it.text, content: it.text, author: '', url: '',
  createdAt: new Date(), engagement: { likes: 0, comments: 0, shares: 0, score: 0 },
}));

// ── The old prompt style: one ordered array. Models tend to lose count and pad the end. ──
function buildArrayPrompt(list: Post[]): string {
  return `Classify the sentiment of each post (pos = good news / happy tone, neg = bad news / critical tone, neu = factual or unclear).

Posts:
${list.map((p, i) => `[${i + 1}] ${p.title}`).join('\n')}

Return ONLY this JSON: {"article_labels": ["pos","neu","neg", ...]}
article_labels must have exactly ${list.length} entries, one per post in order.`;
}

function readArray(parsed: any): (SentimentLabel | null)[] {
  const arr: any[] = Array.isArray(parsed?.article_labels) ? parsed.article_labels : Array.isArray(parsed?.labels) ? parsed.labels : [];
  return items.map((_, i) => (['pos', 'neu', 'neg'].includes(arr[i]) ? arr[i] : null));
}

// ── Scoring ────────────────────────────────────────────────────────────────────
function score(labels: (SentimentLabel | null)[]): Omit<RunResult, 'ms'> {
  let correct = 0, labelled = 0;
  const wrong: string[] = [];
  labels.forEach((l, i) => {
    if (l) labelled++;
    if (l && items[i].accept.includes(l)) correct++;
    else wrong.push(`#${i + 1} ${l ?? 'none'} (want ${items[i].accept.join('/')}): ${items[i].text.slice(0, 60)}`);
  });
  return { correct, labelled, wrong };
}

async function runModel(model: string, mode: 'numbered' | 'array'): Promise<RunResult> {
  const t = Date.now();
  try {
    const prompt = mode === 'numbered' ? buildLabelPrompt(posts) : buildArrayPrompt(posts);
    const parsed = await nvidiaJSON(model, prompt, 3000);
    const labels = mode === 'numbered' ? readLabels(parsed, posts.length).labels : readArray(parsed);
    return { ...score(labels), ms: Date.now() - t };
  } catch (err: any) {
    return { correct: 0, labelled: 0, wrong: [], ms: Date.now() - t, error: `${err.response?.status ?? ''} ${err.message}`.trim() };
  }
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');

async function main() {
  if (!process.env.NVIDIA_API_KEY) {
    console.error('NVIDIA_API_KEY is not set (put it in .env). Only the keyword baseline can run.');
  }
  const n = items.length;
  const modes: ('numbered' | 'array')[] = promptMode === 'both' ? ['numbered', 'array'] : [promptMode];
  console.log(`Sentiment benchmark: ${n} hand-labelled posts, ${models.length} model(s) × ${runs} run(s), prompt: ${modes.join(' + ')}\n`);

  const rows: string[] = [];
  const details: string[] = [];

  // Keyword baseline (deterministic, one run)
  const kw = score(posts.map(p => ({ positive: 'pos', neutral: 'neu', negative: 'neg' } as const)[keywordSentiment(p) as 'positive'] as SentimentLabel));
  rows.push(`| Keyword baseline (no AI) | — | ${pct(kw.correct, n)} | 100% | 0 s | 1 |`);
  details.push(`### Keyword baseline\n${kw.wrong.map(w => `- ${w}`).join('\n')}`);

  if (process.env.NVIDIA_API_KEY) {
    // Models run in parallel; each model's runs one after another
    const jobs = models.flatMap(model => modes.map(mode => ({ model, mode })));
    const results = await Promise.all(jobs.map(async ({ model, mode }) => {
      const r: RunResult[] = [];
      for (let i = 0; i < runs; i++) {
        r.push(await runModel(model, mode));
        process.stdout.write('.');
      }
      return { model, mode, r };
    }));
    console.log('\n');

    for (const { model, mode, r } of results) {
      const ok = r.filter(x => !x.error);
      const errors = r.filter(x => x.error).map(x => x.error);
      if (!ok.length) {
        rows.push(`| ${model} | ${mode} | error | — | — | 0/${runs} |`);
        details.push(`### ${model} (${mode})\nAll runs failed: ${errors.join('; ')}`);
        continue;
      }
      const acc = ok.map(x => x.correct / n);
      const avg = acc.reduce((a, b) => a + b, 0) / acc.length;
      const range = ok.length > 1 ? ` (${Math.round(Math.min(...acc) * 100)}–${Math.round(Math.max(...acc) * 100)})` : '';
      const coverage = ok.reduce((a, x) => a + x.labelled, 0) / (ok.length * n);
      const secs = ok.reduce((a, x) => a + x.ms, 0) / ok.length / 1000;
      rows.push(`| ${model} | ${mode} | ${Math.round(avg * 100)}%${range} | ${Math.round(coverage * 100)}% | ${secs.toFixed(1)} s | ${ok.length}/${runs} |`);
      details.push(`### ${model} (${mode}), mistakes in run 1\n${ok[0].wrong.map(w => `- ${w}`).join('\n') || '- none'}${errors.length ? `\n\nFailed runs: ${errors.join('; ')}` : ''}`);
    }
  }

  const report = `# Sentiment benchmark — ${new Date().toISOString().slice(0, 10)}

${n} hand-labelled posts (eval/headlines.json). Accuracy = label is one of the accepted labels; posts the model skipped count as wrong. Coverage = share of posts that got a label.

| Method | Prompt | Accuracy (min–max) | Coverage | Avg time | Successful runs |
|---|---|---|---|---|---|
${rows.join('\n')}

## Mistakes

${details.join('\n\n')}
`;
  console.log(report);
  if (outFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, report);
    console.log(`Report written to ${outFile}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
