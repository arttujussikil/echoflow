/**
 * Downloads public, human-labelled sentiment datasets and draws a fixed sample
 * from each for the benchmark (npm run eval:data).
 *
 * The texts are NOT committed (their licences don't allow re-licensing them under
 * this repo's MIT licence). Only samples.lock.json, which lists the IDs of the
 * sampled rows, is committed, so everyone gets exactly the same test sets.
 *
 * Output: eval/datasets/data/<name>.json  (git-ignored)
 * Delete samples.lock.json to draw a new sample.
 */
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

type Label = 'pos' | 'neu' | 'neg';

export interface DatasetItem {
  id: string;
  text: string;
  /** Accepted labels (one for public datasets) */
  accept: Label[];
  /** Subgroup for per-group accuracy, e.g. annotator agreement level */
  group?: string;
  /** Individual human annotations, when the dataset has them */
  annotators?: Label[];
}

export interface Dataset {
  name: string;
  title: string;
  description: string;
  source: string;
  license: string;
  citation: string;
  items: DatasetItem[];
}

const DIR = path.join(__dirname, 'data');
const LOCK = path.join(__dirname, 'samples.lock.json');
const lock: Record<string, string[]> = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : {};

// ── Seeded sampling (same sample every time) ───────────────────────────────────
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  const r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Take `perGroup` items from each group (by keyFn), seeded. Uses the lock file when present. */
function sample(name: string, items: DatasetItem[], keyFn: (it: DatasetItem) => string, perGroup: number): DatasetItem[] {
  if (lock[name]) {
    const byId = new Map(items.map(it => [it.id, it]));
    const picked = lock[name].map(id => byId.get(id)).filter(Boolean) as DatasetItem[];
    if (picked.length !== lock[name].length) {
      console.warn(`  ${name}: ${lock[name].length - picked.length} locked IDs not found in the source (dataset changed?)`);
    }
    return picked;
  }
  const groups = new Map<string, DatasetItem[]>();
  for (const it of items) {
    const k = keyFn(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  const picked: DatasetItem[] = [];
  for (const [k, list] of [...groups.entries()].sort()) {
    const take = shuffle(list, 42).slice(0, perGroup);
    if (take.length < perGroup) console.warn(`  ${name}: only ${take.length} items in group "${k}"`);
    picked.push(...take);
  }
  const result = shuffle(picked, 7);
  lock[name] = result.map(it => it.id);
  return result;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Financial PhraseBank ───────────────────────────────────────────────────────
// 4,846 sentences from English financial news, labelled by 16 people with finance
// background. Released in four files by how many annotators agreed; we tag each
// sentence with its agreement band so accuracy can be shown per ambiguity level.
async function financialPhraseBank(): Promise<Dataset> {
  const zip = new AdmZip(await download('https://huggingface.co/datasets/takala/financial_phrasebank/resolve/main/data/FinancialPhraseBank-v1.0.zip'));
  const read = (f: string) => zip.getEntry(`FinancialPhraseBank-v1.0/${f}`)!.getData().toString('latin1');
  const parse = (txt: string) => txt.split(/\r?\n/).filter(Boolean).map(line => {
    const i = line.lastIndexOf('@');
    return { text: line.slice(0, i).trim(), label: line.slice(i + 1).trim() };
  });
  const all = parse(read('Sentences_50Agree.txt'));
  const sets = {
    100: new Set(parse(read('Sentences_AllAgree.txt')).map(r => r.text)),
    75: new Set(parse(read('Sentences_75Agree.txt')).map(r => r.text)),
    66: new Set(parse(read('Sentences_66Agree.txt')).map(r => r.text)),
  };
  const map: Record<string, Label> = { positive: 'pos', neutral: 'neu', negative: 'neg' };
  const items: DatasetItem[] = all.map((r, i) => ({
    id: `fpb-${i}`,
    text: r.text.replace(/ ([,.;:%)])/g, '$1').replace(/\( /g, '('),
    accept: [map[r.label]],
    group: sets[100].has(r.text) ? '100% agree' : sets[75].has(r.text) ? '75–99% agree' : sets[66].has(r.text) ? '66–74% agree' : '50–65% agree',
  }));
  return {
    name: 'fpb',
    title: 'Financial PhraseBank',
    description: 'Sentences from English financial news, labelled from an investor\'s point of view by 16 annotators. Sampled evenly from four annotator-agreement bands (75 each) to show how accuracy drops as humans disagree more.',
    source: 'https://huggingface.co/datasets/takala/financial_phrasebank (Aalto University)',
    license: 'CC BY-NC-SA 3.0',
    citation: 'Malo, P., Sinha, A., Korhonen, P., Wallenius, J., Takala, P. (2014). Good debt or bad debt: Detecting semantic orientations in economic texts. JASIST 65(4).',
    items: sample('fpb', items, it => it.group!, 75),
  };
}

// ── TweetEval (sentiment) ──────────────────────────────────────────────────────
// SemEval-2017 Task 4 tweets as packaged by Cardiff NLP. Short, informal, often
// sarcastic — close to what EchoFlow collects from Bluesky and Reddit.
async function tweetEval(): Promise<Dataset> {
  const total = 12284; // test split size
  const pages = 30;
  const rows: { id: string; text: string; label: number }[] = [];
  for (let k = 0; k < pages; k++) {
    const offset = Math.floor((k * total) / pages);
    const url = `https://datasets-server.huggingface.co/rows?dataset=cardiffnlp/tweet_eval&config=sentiment&split=test&offset=${offset}&length=100`;
    const data = JSON.parse((await download(url)).toString('utf8'));
    for (const r of data.rows) rows.push({ id: `tweet-${r.row_idx}`, text: r.row.text, label: r.row.label });
  }
  const labels: Label[] = ['neg', 'neu', 'pos'];
  const items: DatasetItem[] = rows.map(r => ({ id: r.id, text: r.text, accept: [labels[r.label]] }));
  return {
    name: 'tweeteval',
    title: 'TweetEval (sentiment)',
    description: 'English tweets from the SemEval-2017 Task 4 test set. 100 per label, sampled from 3,000 tweets spread across the test split.',
    source: 'https://huggingface.co/datasets/cardiffnlp/tweet_eval',
    license: 'Research use (SemEval-2017; tweet texts are not redistributed here)',
    citation: 'Barbieri, F., Camacho-Collados, J., Espinosa-Anke, L., Neves, L. (2020). TweetEval: Unified Benchmark and Comparative Evaluation for Tweet Classification. Findings of EMNLP.',
    items: sample('tweeteval', items, it => it.accept[0], 100),
  };
}

// ── FinnSentiment ──────────────────────────────────────────────────────────────
// 27,000 Finnish social-media sentences, each labelled by three native speakers.
// Keeping the three individual labels lets us compare model–human agreement with
// human–human agreement.
async function finnSentiment(): Promise<Dataset> {
  const zip = new AdmZip(await download('https://www.kielipankki.fi/download/finsen/src/finsen-v1-1-src.zip'));
  const entry = zip.getEntries().find(e => e.entryName.endsWith('.tsv'))!;
  const lines = entry.getData().toString('utf8').split(/\r?\n/).filter(Boolean);
  const toLabel = (v: string): Label | null => (v === '1' ? 'pos' : v === '0' ? 'neu' : v === '-1' ? 'neg' : null);
  const items: DatasetItem[] = [];
  for (const line of lines) {
    const c = line.split('\t');
    if (c.length < 20) continue;
    const ann = [toLabel(c[0]), toLabel(c[1]), toLabel(c[2])];
    const majority = toLabel(c[3]);
    const text = c[19]?.trim();
    if (!majority || ann.some(a => !a) || !text) continue; // skips the header row too
    const distinct = new Set(ann).size;
    items.push({
      id: `finsen-${c[18]}`,
      text,
      accept: [majority],
      annotators: ann as Label[],
      group: distinct === 1 ? 'all 3 agree' : distinct === 2 ? '2 of 3 agree' : 'all 3 differ',
    });
  }
  return {
    name: 'finsen',
    title: 'FinnSentiment',
    description: 'Finnish social-media sentences (Suomi24 forum), each labelled by three native speakers. 100 per majority label. The three individual labels are kept for the human-agreement comparison.',
    source: 'https://www.kielipankki.fi/corpora/finsen/ (Language Bank of Finland, University of Helsinki)',
    license: 'CC BY 4.0',
    citation: 'Lindén, K., Jauhiainen, T., Hardwick, S. (2023). FinnSentiment: a Finnish social media corpus for sentiment polarity annotation. Language Resources and Evaluation.',
    items: sample('finsen', items, it => it.accept[0], 100),
  };
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  for (const [name, load] of [['fpb', financialPhraseBank], ['tweeteval', tweetEval], ['finsen', finnSentiment]] as const) {
    process.stdout.write(`${name}: downloading… `);
    try {
      const ds = await load();
      fs.writeFileSync(path.join(DIR, `${name}.json`), JSON.stringify(ds, null, 1));
      const counts = ds.items.reduce<Record<string, number>>((m, it) => ((m[it.group ?? it.accept[0]] = (m[it.group ?? it.accept[0]] ?? 0) + 1), m), {});
      console.log(`${ds.items.length} items ${JSON.stringify(counts)}`);
    } catch (err: any) {
      console.log(`FAILED: ${err.message}`);
    }
  }
  fs.writeFileSync(LOCK, JSON.stringify(lock, null, 1) + '\n');
  console.log(`\nSaved to ${path.relative(process.cwd(), DIR)}; sample IDs in ${path.relative(process.cwd(), LOCK)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
