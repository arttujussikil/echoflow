import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { analyzeWithAI, answerFromPosts, labelTowardTargets, checkOllamaStatus, providerConfigured, ProviderId } from '../../services/ai-service';
import { embed, cosine, clusterVectors, embeddingsEnabled, embeddingModelName } from '../../services/embeddings';
import { saveSnapshot } from '../../db/history';

export const analyticsRouter = Router();

/**
 * POST /api/analytics/analyze — run AI analysis on an array of posts.
 * With `topic` (the search text), the resulting mood is also saved to the mood
 * history so the UI can chart it over time. Comparison runs (`provider`) aren't saved.
 */
analyticsRouter.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { posts, keyword, language, provider, topic } = req.body;

    if (!Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ error: 'posts array is required and must not be empty' });
    }

    logger.info(`AI analyze request: ${posts.length} posts${keyword ? ` keyword="${keyword}"` : ''}`);
    // Optional: pin the analysis to one provider (side-by-side comparison in the UI)
    const only: ProviderId | undefined = ['nvidia', 'gemini'].includes(provider) ? provider : undefined;
    if (only && !providerConfigured(only)) {
      return res.status(400).json({ error: `${only === 'gemini' ? 'Gemini' : 'NVIDIA'} is not set up — add ${only === 'gemini' ? 'GEMINI_API_KEY' : 'NVIDIA_API_KEY'} to .env and restart` });
    }

    const analysis = await analyzeWithAI(posts, keyword, language === 'fi' ? 'fi' : 'en', only);
    if (topic && !only && analysis.labelledCount > 0) {
      const sources: Record<string, number> = {};
      for (const p of posts) sources[p.platform ?? 'unknown'] = (sources[p.platform ?? 'unknown'] ?? 0) + 1;
      // Fire and forget: a missing database must not slow down or fail the analysis
      void saveSnapshot({
        topic: String(topic).slice(0, 200), postCount: analysis.labelledCount, ...analysis.sentiment,
        mood: analysis.mood, provider: analysis.provider, labelProvider: analysis.labelProvider, sources,
      });
    }
    return res.json(analysis);
  } catch (error: any) {
    logger.error('AI analyze failed', { message: error.message });
    const isOllamaDown = error.message?.toLowerCase().includes('ollama');
    return res.status(isOllamaDown ? 503 : 500).json({ error: error.message });
  }
});

/**
 * POST /api/analytics/stories — group posts about the same story.
 * Body: { posts: [{ title }] }. Returns groups of post indexes (2+ posts), largest first.
 * Titles are embedded with a local multilingual model and clustered with average
 * linkage; the 0.88 cosine threshold was tuned on real search results (content text
 * made clusters noisier, so only titles are used).
 */
analyticsRouter.post('/stories', async (req: Request, res: Response) => {
  try {
    const posts = Array.isArray(req.body?.posts) ? req.body.posts.slice(0, 300) : [];
    if (!embeddingsEnabled()) return res.status(503).json({ error: 'Story grouping is disabled (EMBEDDING_MODEL=off)' });
    if (posts.length < 2) return res.json({ stories: [], model: embeddingModelName() });
    const threshold = Math.min(0.99, Math.max(0.5, Number(req.body.threshold) || 0.88));
    const t = Date.now();
    const vectors = await embed(posts.map((p: any) => String(p.title ?? '')));
    const stories = clusterVectors(vectors, threshold).filter(g => g.length > 1);
    logger.info(`stories: ${posts.length} posts → ${stories.length} stories in ${Date.now() - t} ms`);
    return res.json({ stories, threshold, model: embeddingModelName(), ms: Date.now() - t });
  } catch (error: any) {
    logger.error('Story grouping failed', { message: error.message });
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/analytics/ask — "Ask the results" (retrieval-augmented generation).
 * Body: { question, posts: [{ title, content?, source?, mood? }], language?, history? }
 *
 * 1. Retrieve: embed the question and every post, keep the ASK_TOP_K most similar
 *    posts (falls back to word overlap if embeddings are off).
 * 2. Generate: the LLM answers from those posts only and cites them as [n].
 * Returns the answer plus `sources`: indexes into the posts array, in citation order.
 */
const ASK_TOP_K = 15;

analyticsRouter.post('/ask', async (req: Request, res: Response) => {
  try {
    const question = String(req.body?.question ?? '').trim().slice(0, 500);
    const posts: any[] = Array.isArray(req.body?.posts) ? req.body.posts.slice(0, 300) : [];
    if (!question) return res.status(400).json({ error: 'Type a question' });
    if (!posts.length) return res.status(400).json({ error: 'Search for something first' });

    const t = Date.now();
    const docText = (p: any) => `${p.title ?? ''}${p.content && p.content !== p.title ? ` — ${String(p.content).slice(0, 300)}` : ''}`;
    let ranked: number[];
    let retrieval: string;
    if (embeddingsEnabled()) {
      const [q] = await embed([question], 'query');
      const vecs = await embed(posts.map(docText), 'passage');
      ranked = vecs.map((v, i) => ({ i, s: cosine(q, v) })).sort((a, b) => b.s - a.s).map(x => x.i);
      retrieval = `embeddings (${embeddingModelName()})`;
    } else {
      const words = new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
      const score = (p: any) => (docText(p).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(w => words.has(w)).length;
      ranked = posts.map((p, i) => ({ i, s: score(p) })).sort((a, b) => b.s - a.s).map(x => x.i);
      retrieval = 'word overlap';
    }
    const top = ranked.slice(0, ASK_TOP_K);

    const history = Array.isArray(req.body?.history) ? req.body.history.filter((h: any) => h?.q && h?.a) : [];
    const result = await answerFromPosts(question, top.map(i => posts[i]), req.body?.language === 'fi' ? 'fi' : 'en', history);

    // Map [n] in the answer back to indexes in the caller's posts array
    return res.json({
      answer: result.answer,
      citations: Object.fromEntries(result.cited.map(n => [n, top[n - 1]])),
      retrieved: top,
      retrieval,
      provider: result.provider,
      ms: Date.now() - t,
    });
  } catch (error: any) {
    logger.error('Ask failed', { message: error.message });
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/analytics/target — mood toward specific targets ("Google", "EU").
 * Body: { targets: string[] (max 3), posts: [{ title, content? }], language? }
 *
 * Per target: candidate posts = every post whose text contains the target, topped up
 * with the posts most similar to it by embedding (indirect references), max
 * TARGET_MAX_POSTS. The LLM labels each candidate pos / neu / neg toward the target,
 * or na when the post isn't about it.
 */
const TARGET_MAX_POSTS = 60;

analyticsRouter.post('/target', async (req: Request, res: Response) => {
  try {
    const targets: string[] = (Array.isArray(req.body?.targets) ? req.body.targets : [])
      .map((t: any) => String(t).trim().slice(0, 60)).filter(Boolean).slice(0, 3);
    const posts: any[] = Array.isArray(req.body?.posts) ? req.body.posts.slice(0, 300) : [];
    if (!targets.length) return res.status(400).json({ error: 'Type something to measure the mood toward, e.g. Google' });
    if (!posts.length) return res.status(400).json({ error: 'Search for something first' });
    const language = req.body?.language === 'fi' ? 'fi' : 'en';
    const text = (p: any) => `${p.title ?? ''}${p.content && p.content !== p.title ? ` — ${String(p.content).slice(0, 300)}` : ''}`;
    const t = Date.now();

    const results = await Promise.all(targets.map(async target => {
      // Match at a word start; long targets match on a stem because Finnish inflects
      // names (Google → Googlen), short ones (EU) must match whole so "Europe" doesn't count
      const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const low = target.toLowerCase();
      const notWord = '[^\\p{L}\\p{N}]';
      const re = low.length <= 3
        ? new RegExp(`(^|${notWord})${esc(low)}($|${notWord})`, 'u')
        : new RegExp(`(^|${notWord})${esc(low.slice(0, Math.max(4, low.length - 2)))}`, 'u');
      const direct = posts.map((p, i) => (re.test(text(p).toLowerCase()) ? i : -1)).filter(i => i >= 0);
      let candidates = direct.slice(0, TARGET_MAX_POSTS);
      if (candidates.length < TARGET_MAX_POSTS && embeddingsEnabled()) {
        const [q] = await embed([target], 'query');
        const vecs = await embed(posts.map(text), 'passage');
        const similar = vecs.map((v, i) => ({ i, s: cosine(q, v) })).sort((a, b) => b.s - a.s).map(x => x.i);
        for (const i of similar) {
          if (candidates.length >= Math.min(TARGET_MAX_POSTS, direct.length + 20)) break;
          if (!candidates.includes(i)) candidates.push(i);
        }
      }
      const { labels, reasons, provider } = await labelTowardTargets(candidates.map(i => ({ text: text(posts[i]), target })), language);
      const perPost: Record<number, { s: string; r: string | null }> = {};
      const counts = { pos: 0, neu: 0, neg: 0, na: 0 };
      candidates.forEach((i, k) => {
        const l = labels[k];
        if (!l) return;
        counts[l]++;
        perPost[i] = { s: l, r: reasons[k] };
      });
      return { target, considered: candidates.length, directMentions: direct.length, counts, posts: perPost, provider };
    }));
    logger.info(`target: ${targets.join(', ')} in ${Date.now() - t} ms`);
    return res.json({ results, ms: Date.now() - t });
  } catch (error: any) {
    logger.error('Target analysis failed', { message: error.message });
    return res.status(500).json({ error: error.message });
  }
});

/** GET /api/analytics/status — check if Ollama is reachable */
analyticsRouter.get('/status', async (_req: Request, res: Response) => {
  const status = await checkOllamaStatus();
  res.status(status.available ? 200 : 503).json(status);
});
