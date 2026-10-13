import path from 'path';
import { logger } from '../utils/logger';

/**
 * Text embeddings from a small multilingual model run inside this process
 * (ONNX via @huggingface/transformers). Used to group posts about the same story
 * and to find the posts that answer a question ("Ask the results").
 *
 * Default: intfloat's multilingual-e5-small (Finnish and ~100 other languages,
 * 384 dimensions, ~120 MB at q8). EMBEDDING_MODEL=<repo>[@dtype] picks another,
 * "off" disables both features.
 */
const SPEC = (process.env.EMBEDDING_MODEL || 'Xenova/multilingual-e5-small@q8').trim();
const CACHE_DIR = process.env.LOCAL_MODEL_CACHE || path.resolve(process.cwd(), 'models-cache');
// e5 models were trained with these prefixes; other models get the text as is
const IS_E5 = /e5/i.test(SPEC);

let loading: Promise<any> | null = null;
const cache = new Map<string, Float32Array>(); // text → vector, so repeat calls are free
const CACHE_MAX = 5000;

export function embeddingsEnabled(): boolean {
  return SPEC.toLowerCase() !== 'off';
}

export function embeddingModelName(): string {
  return SPEC.split('@')[0].split('/').pop()!;
}

function getPipeline(): Promise<any> {
  if (!loading) {
    loading = (async () => {
      const t = Date.now();
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = CACHE_DIR;
      const [repo, dtype] = SPEC.split('@');
      const extractor = await pipeline('feature-extraction', repo, dtype ? { dtype: dtype as any } : {});
      logger.info(`Embedding model ${SPEC} ready in ${Date.now() - t} ms`);
      return extractor;
    })().catch(err => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

export function warmUpEmbeddings(): void {
  if (embeddingsEnabled()) getPipeline().catch(err => logger.warn(`Embedding model failed to load: ${err.message}`));
}

/**
 * Normalized vectors (cosine similarity = dot product).
 * kind = 'passage' for posts, 'query' for a question (matters for e5 models).
 */
export async function embed(texts: string[], kind: 'passage' | 'query' = 'passage'): Promise<Float32Array[]> {
  if (!embeddingsEnabled()) throw new Error('Embeddings are disabled (EMBEDDING_MODEL=off)');
  const prep = texts.map(t => `${IS_E5 ? `${kind}: ` : ''}${t.replace(/\s+/g, ' ').trim().slice(0, 600)}`);
  const missing = [...new Set(prep.filter(t => !cache.has(t)))];
  if (missing.length) {
    const extractor = await getPipeline();
    for (let i = 0; i < missing.length; i += 32) {
      const chunk = missing.slice(i, i + 32);
      const out = await extractor(chunk, { pooling: 'mean', normalize: true });
      const dim = out.dims[out.dims.length - 1];
      chunk.forEach((t, j) => cache.set(t, Float32Array.from(out.data.slice(j * dim, (j + 1) * dim))));
    }
    // Simple size cap: drop the oldest entries
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  }
  return prep.map(t => cache.get(t)!);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Average-linkage agglomerative clustering: keep merging the two most similar
 * groups while their average similarity is above `threshold`. Average linkage
 * avoids the "chaining" of single linkage, where A~B and B~C pulls in an unrelated C.
 * Returns groups of indexes, largest first.
 */
export function clusterVectors(vectors: Float32Array[], threshold: number): number[][] {
  const n = vectors.length;
  const sim: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : cosine(vectors[i], vectors[j]))));
  let groups: number[][] = vectors.map((_, i) => [i]);
  const avg = (a: number[], b: number[]) => {
    let s = 0;
    for (const i of a) for (const j of b) s += sim[i][j];
    return s / (a.length * b.length);
  };
  for (;;) {
    let best = -1, bi = -1, bj = -1;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const s = avg(groups[i], groups[j]);
        if (s > best) { best = s; bi = i; bj = j; }
      }
    }
    if (best < threshold || bi < 0) break;
    groups[bi] = [...groups[bi], ...groups[bj]];
    groups = groups.filter((_, k) => k !== bj);
  }
  return groups.sort((a, b) => b.length - a.length);
}
