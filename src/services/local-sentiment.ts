import path from 'path';
import { logger } from '../utils/logger';
import type { SentimentLabel } from './ai-service';

/**
 * Offline sentiment fallback: a small Hugging Face classifier run inside this
 * process (ONNX via @huggingface/transformers). Used to label posts when the
 * cloud LLMs (NVIDIA, Gemini) don't answer.
 *
 * Default: Cardiff NLP's multilingual twitter-xlm-roberta, quantized (q8, ~280 MB).
 * In eval/results/2026-10-13-hf-local.md it matched the cloud LLMs on tweets and
 * Finnish forum posts (70–74%) but trails them on news headlines (82% vs 98%).
 * It gives labels only — no reasons, summary or opinion.
 *
 * LOCAL_SENTIMENT_MODEL=<repo>[@dtype] picks another model; "off" disables it.
 * The model is downloaded once into LOCAL_MODEL_CACHE (default ./models-cache).
 */
const SPEC = (process.env.LOCAL_SENTIMENT_MODEL || 'onnx-community/twitter-xlm-roberta-base-sentiment-ONNX@q8').trim();
const CACHE_DIR = process.env.LOCAL_MODEL_CACHE || path.resolve(process.cwd(), 'models-cache');

let loading: Promise<any> | null = null;
let loadError: string | null = null;

export function localSentimentEnabled(): boolean {
  return SPEC.toLowerCase() !== 'off';
}

/** Short display name, e.g. "twitter-xlm-roberta-base-sentiment" */
export function localSentimentName(): string {
  return SPEC.split('@')[0].split('/').pop()!.replace(/-ONNX$/i, '');
}

export function localSentimentStatus(): { enabled: boolean; model: string; ready: boolean; error: string | null } {
  return { enabled: localSentimentEnabled(), model: SPEC, ready: Boolean(loading) && !loadError, error: loadError };
}

function getPipeline(): Promise<any> {
  if (!loading) {
    loading = (async () => {
      const t = Date.now();
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = CACHE_DIR;
      const [repo, dtype] = SPEC.split('@');
      const clf = await pipeline('text-classification', repo, dtype ? { dtype: dtype as any } : {});
      logger.info(`Local sentiment model ${SPEC} ready in ${Date.now() - t} ms`);
      return clf;
    })().catch(err => {
      loadError = err.message;
      loading = null; // allow a retry on the next request
      throw err;
    });
  }
  return loading;
}

/** Start downloading/loading in the background so the first fallback isn't slow. */
export function warmUpLocalSentiment(): void {
  if (!localSentimentEnabled()) return;
  getPipeline().catch(err => logger.warn(`Local sentiment model failed to load: ${err.message}`));
}

function mapLabel(label: string): SentimentLabel | null {
  const l = label.toLowerCase();
  if (l.includes('neg')) return 'neg';
  if (l.includes('neu')) return 'neu';
  if (l.includes('pos')) return 'pos';
  const m = l.match(/label_(\d)/); // cardiffnlp index order: 0 neg, 1 neu, 2 pos
  return m ? ((['neg', 'neu', 'pos'] as SentimentLabel[])[Number(m[1])] ?? null) : null;
}

/** Label texts locally. Throws if the model is disabled or can't be loaded. */
export async function labelLocally(texts: string[]): Promise<(SentimentLabel | null)[]> {
  if (!localSentimentEnabled()) throw new Error('Local sentiment model is disabled (LOCAL_SENTIMENT_MODEL=off)');
  const clf = await getPipeline();
  const out: (SentimentLabel | null)[] = [];
  for (let i = 0; i < texts.length; i += 32) {
    // The model takes at most 512 tokens; ~1,000 characters stays below that
    const res = await clf(texts.slice(i, i + 32).map(t => t.slice(0, 1000)));
    out.push(...(res as any[]).map(r => mapLabel((Array.isArray(r) ? r[0] : r).label)));
  }
  return out;
}
