/**
 * Sentiment benchmark: how well do models label posts as pos / neu / neg?
 *
 * Uses the exact labelling prompt the app uses (buildLabelPrompt in ai-service.ts),
 * in batches of 40 like the app, and compares models with:
 *   - the keyword method (public/sentiment-keywords.js) as a non-AI baseline
 *   - human annotators, where the dataset has several (FinnSentiment), or a
 *     teammate's labels (--human) for our own headlines
 *
 * Datasets:
 *   headlines  50 posts we labelled ourselves (eval/headlines.json)
 *   fpb        Financial PhraseBank, 300 news sentences by annotator-agreement level
 *   tweeteval  TweetEval sentiment, 300 tweets
 *   finsen     FinnSentiment, 300 Finnish sentences with 3 human labels each
 *   newsmtsc   NewsMTSC, 300 news sentences labelled toward a named person ("Mood toward…");
 *              LLMs run with the target prompt and, for comparison, the plain document prompt
 *   (fpb / tweeteval / finsen are downloaded with: npm run eval:data)
 *
 * Usage (needs NVIDIA_API_KEY and/or GEMINI_API_KEY in .env):
 *   npm run eval
 *   npm run eval -- --dataset all --out eval/results/my-run.md
 *   npm run eval -- --dataset finsen --models gemini-3.5-flash --limit 40
 *   npm run eval -- --prompt both              # also test the old "ordered list" prompt
 *   npm run eval -- --make-template            # writes eval/human/label.html, the labelling tool
 *   npm run eval -- --dataset headlines,finsen --human eval/human/niko.csv
 *   npm run eval -- --models hf:Xenova/twitter-roberta-base-sentiment-latest   # local Hugging Face model
 *
 * Options:
 *   --dataset D    headlines (default) | fpb | tweeteval | finsen | newsmtsc | all
 *   --models a,b   models to test (default: app's NVIDIA chain + Gemini if its key is set).
 *                  "hf:<repo>" runs a Hugging Face sentiment classifier locally (ONNX, via
 *                  @huggingface/transformers): free, no key, no rate limit; downloaded once
 *                  into eval/models-cache/
 *   --runs N       repeat each model N times (default 1)
 *   --limit N      only the first N items of each dataset (quick test)
 *   --prompt P     numbered (default) | array | both
 *   --human FILE   CSV from eval/human/label.html (id,...,label): a second human's labels,
 *                  compared with the reference labels, the original annotators and the models
 *   --out FILE     write the markdown report there (+ FILE.json with every prediction)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { buildLabelPrompt, readLabels, buildTargetPrompt, readTargetLabels, modelJSON, SentimentLabel } from '../src/services/ai-service';
import { Post } from '../src/models/post';
import type { Dataset, DatasetItem } from './datasets/fetch-datasets';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { keywordSentiment } = require('../public/sentiment-keywords.js');

type Label = SentimentLabel;
type Pred = Label | null;
const LABELS: Label[] = ['pos', 'neu', 'neg'];

// ── Args ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);

const DEFAULT_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  ...(process.env.GEMINI_API_KEY ? ['gemini-3.5-flash', 'gemini-3.8-flash'] : []),
];
const models = (arg('models') ?? DEFAULT_MODELS.join(',')).split(',').map(s => s.trim()).filter(Boolean);
const runs = Math.max(1, Number(arg('runs') ?? 1));
const limit = arg('limit') ? Number(arg('limit')) : undefined;
const promptMode = (arg('prompt') ?? 'numbered') as 'numbered' | 'array' | 'both';
const datasetArg = arg('dataset') ?? 'headlines';
const humanFile = arg('human');
const outFile = arg('out');

const BATCH = 40;
/** numbered = app's mood prompt, array = old ordered-list prompt, target = "Mood toward…" prompt */
type Mode = 'numbered' | 'array' | 'target';

// ── Datasets ───────────────────────────────────────────────────────────────────
function loadDataset(name: string): Dataset {
  if (name === 'headlines') {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'headlines.json'), 'utf8'));
    return {
      name: 'headlines',
      title: 'EchoFlow headlines (our labels)',
      description: d.description,
      source: 'eval/headlines.json',
      license: 'MIT (this repo)',
      citation: '',
      items: d.items.map((it: any, i: number) => ({ id: `h${i + 1}`, text: it.text, accept: it.accept })),
    };
  }
  const file = path.join(__dirname, 'datasets', 'data', `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`${file} not found — run: npm run eval:data`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ── Model calls ────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function buildArrayPrompt(list: Post[]): string {
  return `Classify the sentiment of each post (pos = good news / happy tone, neg = bad news / critical tone, neu = factual or unclear).

Posts:
${list.map((p, i) => `[${i + 1}] ${p.title}`).join('\n')}

Return ONLY this JSON: {"article_labels": ["pos","neu","neg", ...]}
article_labels must have exactly ${list.length} entries, one per post in order.`;
}

function readArray(parsed: any, n: number): Pred[] {
  const arr: any[] = Array.isArray(parsed?.article_labels) ? parsed.article_labels : Array.isArray(parsed?.labels) ? parsed.labels : [];
  return Array.from({ length: n }, (_, i) => (LABELS.includes(arr[i]) ? arr[i] : null));
}

const toPost = (it: DatasetItem): Post => ({
  id: it.id, platform: 'eval', title: it.text, content: it.text, author: '', url: '',
  createdAt: new Date(), engagement: { likes: 0, comments: 0, shares: 0, score: 0 },
});

/** One batch, retrying when a free endpoint is busy or rate-limited. */
async function labelBatch(model: string, items: DatasetItem[], mode: Mode): Promise<{ preds: Pred[]; error?: string }> {
  const posts = items.map(toPost);
  const prompt = mode === 'target'
    ? buildTargetPrompt(items.map(it => ({ text: it.text, target: it.target ?? '' })))
    : mode === 'numbered' ? buildLabelPrompt(posts) : buildArrayPrompt(posts);
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const parsed = await modelJSON(model, prompt, 3000);
      if (mode === 'target') {
        // 'na' ("not about the target") is always wrong here: every sentence names its target
        return { preds: readTargetLabels(parsed, posts.length).labels.map(l => (l === 'na' ? null : l)) };
      }
      return { preds: mode === 'numbered' ? readLabels(parsed, posts.length).labels : readArray(parsed, posts.length) };
    } catch (err: any) {
      const status = err.response?.status;
      lastErr = `${status ?? ''} ${err.message}`.trim();
      const retryable = !status || status === 429 || status >= 500;
      if (!retryable || attempt === 3) break;
      await sleep([5_000, 15_000, 30_000][attempt]);
    }
  }
  return { preds: items.map(() => null), error: lastErr };
}

// ── Local Hugging Face classifiers ("hf:<repo>") ────────────────────────────────
const hfPipelines = new Map<string, Promise<any>>();

/** spec = "<repo>" or "<repo>@<dtype>", e.g. "onnx-community/twitter-xlm-roberta-base-sentiment-ONNX@q8" */
function hfPipeline(spec: string): Promise<any> {
  const [repo, dtype] = spec.split('@');
  if (!hfPipelines.has(spec)) {
    hfPipelines.set(spec, (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(__dirname, 'models-cache');
      // A local folder (e.g. a model converted to ONNX yourself) works too
      if (fs.existsSync(repo)) { env.allowLocalModels = true; env.localModelPath = ''; }
      return pipeline('text-classification', repo, dtype ? { dtype: dtype as any } : {});
    })());
  }
  return hfPipelines.get(spec)!;
}

/** Map a classifier's label ("negative", "Very Positive", "LABEL_2", "1 star"…) to pos/neu/neg. */
function mapHfLabel(label: string): Pred {
  const l = label.toLowerCase();
  if (l.includes('neg')) return 'neg';
  if (l.includes('neu')) return 'neu';
  if (l.includes('pos')) return 'pos';
  const m = l.match(/label_(\d)/); // cardiffnlp-style index order: 0 neg, 1 neu, 2 pos
  if (m) return (['neg', 'neu', 'pos'] as Label[])[Number(m[1])] ?? null;
  const stars = l.match(/^(\d) star/);
  if (stars) return Number(stars[1]) <= 2 ? 'neg' : Number(stars[1]) === 3 ? 'neu' : 'pos';
  return null;
}

async function runLocalModel(model: string, items: DatasetItem[]) {
  const t = Date.now();
  const errors: string[] = [];
  let preds: Pred[] = items.map(() => null);
  try {
    const clf = await hfPipeline(model.slice(3));
    const loaded = Date.now();
    preds = [];
    for (let i = 0; i < items.length; i += 32) {
      // Most classifiers accept at most 512 tokens; ~1,000 characters stays safely below that
      const out = await clf(items.slice(i, i + 32).map(it => it.text.slice(0, 1000)));
      preds.push(...(out as any[]).map(o => mapHfLabel((Array.isArray(o) ? o[0] : o).label)));
      process.stdout.write('.');
    }
    // Report inference time only; the one-off download/load is not part of it
    return { preds, ms: Date.now() - loaded, errors };
  } catch (err: any) {
    errors.push(err.message);
    return { preds, ms: Date.now() - t, errors };
  }
}

async function runModel(model: string, items: DatasetItem[], mode: Mode) {
  if (model.startsWith('hf:')) return runLocalModel(model, items);
  const t = Date.now();
  const preds: Pred[] = [];
  const errors: string[] = [];
  // Batches one after another per model: free tiers limit requests per minute
  for (let i = 0; i < items.length; i += BATCH) {
    const r = await labelBatch(model, items.slice(i, i + BATCH), mode);
    preds.push(...r.preds);
    if (r.error) errors.push(r.error);
    process.stdout.write('.');
  }
  return { preds, ms: Date.now() - t, errors };
}

// ── Metrics ────────────────────────────────────────────────────────────────────
const isCorrect = (it: DatasetItem, p: Pred) => Boolean(p && it.accept.includes(p));
/** For multi-label items, a prediction that is accepted counts as the gold label. */
const goldFor = (it: DatasetItem, p: Pred): Label => (p && it.accept.includes(p) ? p : it.accept[0]);

function accuracy(items: DatasetItem[], preds: Pred[]) {
  return items.length ? items.filter((it, i) => isCorrect(it, preds[i])).length / items.length : 0;
}

function macroF1(items: DatasetItem[], preds: Pred[]) {
  const f1s = LABELS.map(l => {
    let tp = 0, fp = 0, fn = 0;
    items.forEach((it, i) => {
      const g = goldFor(it, preds[i]), p = preds[i];
      if (p === l && g === l) tp++;
      else if (p === l) fp++;
      else if (g === l) fn++;
    });
    return tp ? (2 * tp) / (2 * tp + fp + fn) : 0;
  });
  return f1s.reduce((a, b) => a + b, 0) / f1s.length;
}

/** 95% bootstrap interval for accuracy (1,000 resamples, seeded). */
function bootstrapCI(items: DatasetItem[], preds: Pred[]): [number, number] {
  const correct = items.map((it, i) => (isCorrect(it, preds[i]) ? 1 : 0));
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const accs: number[] = [];
  for (let b = 0; b < 1000; b++) {
    let s = 0;
    for (let k = 0; k < correct.length; k++) s += correct[Math.floor(rand() * correct.length)];
    accs.push(s / correct.length);
  }
  accs.sort((a, b) => a - b);
  return [accs[25], accs[974]];
}

/** Cohen's kappa: agreement corrected for chance. 1 = perfect, 0 = chance level. */
function kappa(a: Pred[], b: Pred[]) {
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x && y) as [Label, Label][];
  if (!pairs.length) return NaN;
  const po = pairs.filter(([x, y]) => x === y).length / pairs.length;
  const pe = LABELS.reduce((s, l) => s + (pairs.filter(([x]) => x === l).length / pairs.length) * (pairs.filter(([, y]) => y === l).length / pairs.length), 0);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

function agreementRate(a: Pred[], b: Pred[]) {
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x && y);
  return pairs.length ? pairs.filter(([x, y]) => x === y).length / pairs.length : NaN;
}

const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');
const num = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—');

function confusion(items: DatasetItem[], preds: Pred[]): string {
  const cols: (Label | 'none')[] = [...LABELS, 'none'];
  const rows = LABELS.map(g => {
    const cells = cols.map(c => items.filter((it, i) => goldFor(it, preds[i]) === g && (preds[i] ?? 'none') === c).length);
    return `| **${g}** | ${cells.join(' | ')} |`;
  });
  return `| gold \\ predicted | ${cols.join(' | ')} |\n|---|${cols.map(() => '---').join('|')}|\n${rows.join('\n')}`;
}

// ── Human labels (teammate) ────────────────────────────────────────────────────
function readHumanCsv(file: string): Map<string, Label> {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const sep = head.includes(';') ? ';' : ','; // Excel in Finnish locale saves with ;
  const cols = head.split(sep).map(c => c.trim().toLowerCase());
  if (cols[0] !== 'id' || cols[cols.length - 1] !== 'label') throw new Error(`${file}: first column must be "id" and last "label"`);
  const map: Record<string, Label> = { pos: 'pos', positive: 'pos', '+': 'pos', neu: 'neu', neutral: 'neu', '0': 'neu', neg: 'neg', negative: 'neg', '-': 'neg' };
  const out = new Map<string, Label>();
  for (const line of lines) {
    // id and label never contain the separator; the text column in between may
    const id = line.slice(0, line.indexOf(sep)).trim();
    const raw = line.slice(line.lastIndexOf(sep) + 1).trim().toLowerCase().replace(/"/g, '');
    if (id && map[raw]) out.set(id, map[raw]);
  }
  return out;
}

/** Name shown for the --human labels, from the file name (eval/human/niko.csv → "niko") */
const humanName = humanFile ? path.basename(humanFile).replace(/\.[^.]+$/, '') : '';
const HUMAN_LABEL = `Human: ${humanName}`;

const FINSEN_FOR_HUMANS = 100;

/**
 * Writes eval/human/label.html: a self-contained labelling page (no server, no
 * install). Part 1 = our 50 headlines, part 2 = the first FINSEN_FOR_HUMANS items of
 * the locked FinnSentiment sample (CC BY 4.0, so the texts may be shared with credit).
 * Labels are hidden; the order is shuffled within each part.
 */
function makeTemplate() {
  const shuffle = <T,>(xs: T[]) => xs.map((x, i) => ({ x, k: (i * 7919 + 17) % 1009 })).sort((p, q) => p.k - q.k).map(o => o.x);
  const items: { id: string; text: string; part: number }[] =
    shuffle(loadDataset('headlines').items).map(it => ({ id: it.id, text: it.text, part: 1 }));
  try {
    const finsen = loadDataset('finsen').items.slice(0, FINSEN_FOR_HUMANS);
    items.push(...shuffle(finsen).map(it => ({ id: it.id, text: it.text, part: 2 })));
  } catch {
    console.warn('FinnSentiment not downloaded (npm run eval:data), so the tool only has part 1.');
  }
  const tpl = fs.readFileSync(path.join(__dirname, 'human', 'label-tool.template.html'), 'utf8');
  const html = tpl.replace('/*__ITEMS__*/[]', JSON.stringify(items).replace(/</g, '\\u003c'));
  const file = path.join(__dirname, 'human', 'label.html');
  fs.writeFileSync(file, html);
  console.log(`Wrote ${path.relative(process.cwd(), file)}: ${items.length} texts (${items.filter(i => i.part === 1).length} headlines + ${items.filter(i => i.part === 2).length} FinnSentiment).`);
  console.log('Open it in a browser, label everything, download the CSV into eval/human/, then run:');
  console.log('  npm run eval -- --dataset headlines,finsen --human eval/human/<name>.csv --out eval/results/human-agreement.md');
}

// ── One dataset ────────────────────────────────────────────────────────────────
interface MethodResult { method: string; prompt: string; preds: Pred[]; ms: number; okRuns: number; errors: string[]; isModel: boolean }

async function benchmarkDataset(ds: Dataset) {
  const items = limit ? ds.items.slice(0, limit) : ds.items;
  // Target datasets: the target prompt, plus the plain prompt to show what knowing the target adds
  const modes: Mode[] = items.some(it => it.target) ? ['target', 'numbered'] : promptMode === 'both' ? ['numbered', 'array'] : [promptMode];
  process.stdout.write(`\n${ds.title}: ${items.length} items, ${models.length} model(s) × ${runs} run(s) `);

  const results: MethodResult[] = [];
  const toLabel: Record<string, Label> = { positive: 'pos', neutral: 'neu', negative: 'neg' };
  const kw = items.map(it => toLabel[keywordSentiment({ title: it.text, content: it.text })]);
  results.push({ method: 'Keyword list (no AI)', prompt: '—', preds: kw, ms: 0, okRuns: 1, errors: [], isModel: false });

  if (humanFile) {
    const h = readHumanCsv(humanFile);
    const preds = items.map(it => h.get(it.id) ?? null);
    if (preds.some(Boolean)) results.push({ method: HUMAN_LABEL, prompt: '—', preds, ms: 0, okRuns: 1, errors: [], isModel: false });
  }

  const haveKeys = Boolean(process.env.NVIDIA_API_KEY || process.env.GEMINI_API_KEY);
  const runnable = models.filter(m => m.startsWith('hf:') || haveKeys);
  if (runnable.length) {
    // Local classifiers have no prompt, so they run once whatever --prompt says
    const jobs = runnable.flatMap(model => (model.startsWith('hf:') ? ['numbered' as Mode] : modes).map(mode => ({ model, mode })));
    const done = await Promise.all(jobs.map(async ({ model, mode }) => {
      const all = [];
      for (let r = 0; r < runs; r++) all.push(await runModel(model, items, mode));
      // Report the run with the best coverage; keep the error notes of all runs
      const best = [...all].sort((a, b) => b.preds.filter(Boolean).length - a.preds.filter(Boolean).length)[0];
      const okRuns = all.filter(r => r.preds.some(Boolean)).length;
      return { method: model, prompt: model.startsWith('hf:') ? '—' : mode, preds: best.preds, ms: best.ms, okRuns, errors: all.flatMap(r => r.errors), isModel: true };
    }));
    results.push(...done);
  }
  console.log('');
  return { ds, items, results };
}

function reportDataset({ ds, items, results }: Awaited<ReturnType<typeof benchmarkDataset>>): string {
  const groups = ([...new Set(items.map(it => it.group).filter(Boolean))] as string[]).sort();
  const ok = results.filter(r => r.okRuns);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const lines: string[] = [];
  lines.push(`## ${ds.title}\n`);
  lines.push(`${ds.description}\n`);
  lines.push(`Source: ${ds.source} · Licence: ${ds.license}${ds.citation ? `\n\n*${ds.citation}*` : ''}\n`);
  const dist = LABELS.map(l => `${l} ${items.filter(it => it.accept[0] === l).length}`).join(', ');
  lines.push(`${items.length} items (${dist}).\n`);

  lines.push('| Method | Prompt | Accuracy | 95% interval | Macro-F1 | Labelled | Accuracy on labelled | Time |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    if (!r.okRuns) { lines.push(`| ${r.method} | ${r.prompt} | failed | — | — | 0% | — | — |`); continue; }
    const [lo, hi] = bootstrapCI(items, r.preds);
    const idx = r.preds.map((p, i) => (p ? i : -1)).filter(i => i >= 0);
    const labelled = idx.length / items.length;
    // Accuracy on the items the model actually answered (separates "wrong" from "blocked / timed out")
    const accLabelled = labelled < 1 ? pct(accuracy(idx.map(i => items[i]), idx.map(i => r.preds[i]))) : '=';
    lines.push(`| ${r.method} | ${r.prompt} | **${pct(accuracy(items, r.preds))}** | ${pct(lo)}–${pct(hi)} | ${num(macroF1(items, r.preds))} | ${pct(labelled)} | ${accLabelled} | ${r.isModel ? `${(r.ms / 1000).toFixed(0)} s` : '—'} |`);
  }
  const failedNotes = results.filter(r => r.errors.length).map(r => `- ${r.method}: ${r.errors.length} of ${Math.ceil(items.length / BATCH)} batches failed (${[...new Set(r.errors)].slice(0, 2).join('; ')})`);
  if (failedNotes.length) lines.push(`\nFailed batches (after 3 retries):\n${failedNotes.join('\n')}`);

  if (groups.length > 1) {
    lines.push(`\n**Accuracy by subgroup**\n`);
    lines.push(`| Method | ${groups.map(g => `${g} (n=${items.filter(it => it.group === g).length})`).join(' | ')} |`);
    lines.push(`|---|${groups.map(() => '---').join('|')}|`);
    for (const r of ok) {
      const cells = groups.map(g => {
        const idx = items.map((it, i) => (it.group === g ? i : -1)).filter(i => i >= 0);
        return pct(accuracy(idx.map(i => items[i]), idx.map(i => r.preds[i])));
      });
      lines.push(`| ${r.method} | ${cells.join(' | ')} |`);
    }
  }

  // Human agreement: datasets with several annotators per item
  if (items.length && items.every(it => it.annotators?.length)) {
    const nAnn = items[0].annotators!.length;
    const ann = Array.from({ length: nAnn }, (_, a) => items.map(it => it.annotators![a] as Pred));
    const pairs: [number, number][] = [];
    for (let a = 0; a < nAnn; a++) for (let b = a + 1; b < nAnn; b++) pairs.push([a, b]);
    lines.push(`\n**Agreement with individual human annotators**\n`);
    lines.push(`Each text was labelled by ${nAnn} people. "Human vs human" averages the ${pairs.length} pairs of annotators; a method row averages its agreement with each annotator. Kappa corrects for agreement expected by chance (0 = chance, 1 = perfect).\n`);
    lines.push('| Comparison | Agreement | Cohen\'s kappa |');
    lines.push('|---|---|---|');
    lines.push(`| Human vs human | ${pct(mean(pairs.map(([a, b]) => agreementRate(ann[a], ann[b]))))} | ${num(mean(pairs.map(([a, b]) => kappa(ann[a], ann[b]))))} |`);
    for (const r of ok) {
      lines.push(`| ${r.method} vs human | ${pct(mean(ann.map(a => agreementRate(r.preds, a))))} | ${num(mean(ann.map(a => kappa(r.preds, a))))} |`);
    }
  }

  // Second human (--human): compared on the items they labelled
  const mate = results.find(r => r.method === HUMAN_LABEL);
  if (mate) {
    const idx = items.map((_, i) => i).filter(i => mate.preds[i]);
    const sub = idx.map(i => items[i]);
    const pick = (xs: Pred[]) => idx.map(i => xs[i]);
    const human = pick(mate.preds);
    const ref = sub.map(it => it.accept[0] as Pred);
    const hasAnn = sub.every(it => it.annotators?.length);
    lines.push(`\n**A second human: ${humanName}** (${sub.length} items)\n`);
    lines.push(`"Reference" = the dataset's label${ds.name === 'headlines' ? ' (ours; accuracy counts any accepted label, kappa uses the first)' : ''}. Kappa: 0 = chance, 1 = perfect agreement.\n`);
    lines.push('| Pair | Agreement | Cohen\'s kappa |');
    lines.push('|---|---|---|');
    lines.push(`| ${humanName} vs reference | ${pct(accuracy(sub, human))} | ${num(kappa(human, ref))} |`);
    if (hasAnn) {
      const nAnn = sub[0].annotators!.length;
      const ann = Array.from({ length: nAnn }, (_, a) => sub.map(it => it.annotators![a] as Pred));
      const pairs: number[][] = [];
      for (let a = 0; a < nAnn; a++) for (let b = a + 1; b < nAnn; b++) pairs.push([a, b]);
      lines.push(`| Original annotators vs each other | ${pct(mean(pairs.map(([a, b]) => agreementRate(ann[a], ann[b]))))} | ${num(mean(pairs.map(([a, b]) => kappa(ann[a], ann[b]))))} |`);
      lines.push(`| ${humanName} vs original annotators | ${pct(mean(ann.map(a => agreementRate(human, a))))} | ${num(mean(ann.map(a => kappa(human, a))))} |`);
    }
    for (const r of ok.filter(r => r.isModel)) {
      const preds = pick(r.preds);
      lines.push(`| ${r.method}${r.prompt !== '—' && r.prompt !== 'numbered' ? ` (${r.prompt})` : ''} vs ${humanName} | ${pct(agreementRate(preds, human))} | ${num(kappa(preds, human))} |`);
    }
  }

  lines.push(`\n<details><summary>Confusion matrices and mistakes</summary>\n`);
  for (const r of ok) {
    lines.push(`\n#### ${r.method}${r.prompt !== '—' ? ` (${r.prompt} prompt)` : ''}\n`);
    lines.push(confusion(items, r.preds));
    const wrong = items.map((it, i) => ({ it, p: r.preds[i] })).filter(x => !isCorrect(x.it, x.p));
    lines.push(`\n${wrong.length} mistakes${wrong.length > 15 ? ' (first 15)' : ''}:\n`);
    for (const { it, p } of wrong.slice(0, 15)) {
      lines.push(`- ${p ?? 'none'} (want ${it.accept.join('/')})${it.group ? ` [${it.group}]` : ''}${it.target ? ` [target: ${it.target}]` : ''}: ${it.text.replace(/\s+/g, ' ').slice(0, 110)}`);
    }
    if (r.errors.length) lines.push(`\nErrors (${r.errors.length} batches): ${[...new Set(r.errors)].slice(0, 3).join('; ')}`);
  }
  lines.push('\n</details>\n');
  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  if (flag('make-template')) { makeTemplate(); return; }
  if (!process.env.NVIDIA_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error('No NVIDIA_API_KEY or GEMINI_API_KEY in .env — only the keyword baseline will run.');
  }

  const names = datasetArg === 'all' ? ['headlines', 'fpb', 'tweeteval', 'finsen', 'newsmtsc'] : datasetArg.split(',');
  const sections: string[] = [];
  const raw: any[] = [];
  for (const name of names) {
    const res = await benchmarkDataset(loadDataset(name));
    sections.push(reportDataset(res));
    raw.push({ dataset: name, items: res.items.map(it => it.id), results: res.results.map(r => ({ method: r.method, prompt: r.prompt, ms: r.ms, preds: r.preds, errors: r.errors })) });
  }

  const report = `# Sentiment benchmark — ${new Date().toISOString().slice(0, 10)}

Models label each text as pos / neu / neg with the app's own prompt (\`buildLabelPrompt\`), 40 texts per request. Accuracy counts unlabelled items as wrong. The 95% interval is a bootstrap over the items: when two intervals overlap a lot, the difference may be noise. Macro-F1 averages F1 over the three labels, so a model can't score well by over-using one label.

${sections.join('\n---\n\n')}`;
  console.log('\n' + report);
  if (outFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, report);
    fs.writeFileSync(outFile.replace(/\.md$/, '') + '.json', JSON.stringify(raw));
    console.log(`Report written to ${outFile}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
