import { discover } from '../api/routes/discover';
import { analyzeWithAI } from './ai-service';
import { saveSnapshot } from '../db/history';
import { logger } from '../utils/logger';

/**
 * Background topic tracker: every TRACK_EVERY_HOURS, search each topic in
 * TRACK_TOPICS (past day, default sources), analyse it and save the mood to the
 * history, so "Mood over time" fills in without anyone searching.
 *
 *   TRACK_TOPICS="Finland, AI"   → tracks "Finland" and "AI" (comma-separated; use | to
 *                                  track a multi-keyword search, e.g. "News|Finland")
 *   TRACK_EVERY_HOURS=6          (minimum 1)
 *
 * Off unless TRACK_TOPICS is set: each run uses free AI quota (one analysis ≈ 3–6 requests).
 */
const TOPICS = (process.env.TRACK_TOPICS ?? '').split(',').map(t => t.trim().replace(/\|/g, ', ')).filter(Boolean);
const EVERY_HOURS = Math.max(1, Number(process.env.TRACK_EVERY_HOURS) || 6);

async function trackOnce(): Promise<void> {
  for (const topic of TOPICS) {
    try {
      const { status, body } = await discover({ query: topic, timeRange: 'day', limit: 10 });
      if (status !== 200 || !body.results?.length) {
        logger.warn(`tracker: "${topic}" returned no results`);
        continue;
      }
      const analysis = await analyzeWithAI(body.results.slice(0, 200), topic);
      const sources: Record<string, number> = {};
      for (const p of body.results) sources[p.platform] = (sources[p.platform] ?? 0) + 1;
      const saved = await saveSnapshot({
        topic, postCount: analysis.labelledCount, ...analysis.sentiment, mood: analysis.mood,
        provider: analysis.provider, labelProvider: analysis.labelProvider, sources, origin: 'tracker',
      });
      logger.info(`tracker: "${topic}" ${body.results.length} posts, mood ${JSON.stringify(analysis.sentiment)}${saved ? '' : ' (not saved)'}`);
    } catch (err: any) {
      logger.warn(`tracker: "${topic}" failed: ${err.message}`);
    }
  }
}

export function startTracker(): void {
  if (!TOPICS.length) return;
  logger.info(`Topic tracker: ${TOPICS.map(t => `"${t}"`).join(', ')} every ${EVERY_HOURS} h`);
  // First run shortly after start, once the local models have loaded
  setTimeout(() => {
    void trackOnce();
    setInterval(() => void trackOnce(), EVERY_HOURS * 3600_000);
  }, 60_000);
}
