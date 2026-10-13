import { query } from './pool';
import { logger } from '../utils/logger';

/**
 * Mood history: one row per AI analysis, so the UI can show how the mood about a
 * topic changes over time. Optional — if PostgreSQL isn't reachable, saving is
 * skipped and the history endpoints return an empty list with a note.
 */
export interface MoodSnapshot {
  topic: string;
  postCount: number;
  positive: number;   // percentages, sum 100
  neutral: number;
  negative: number;
  mood?: string;
  provider?: string;
  labelProvider?: string;
  sources?: Record<string, number>;   // posts per source
  origin?: 'search' | 'tracker';
}

let schemaReady: Promise<void> | null = null;

/** The init SQL only runs on a fresh database volume, so create the table here too. */
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = query(`
      CREATE TABLE IF NOT EXISTS mood_history (
        id BIGSERIAL PRIMARY KEY,
        topic TEXT NOT NULL,
        topic_key TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        post_count INT NOT NULL,
        positive INT NOT NULL,
        neutral INT NOT NULL,
        negative INT NOT NULL,
        mood TEXT,
        provider TEXT,
        label_provider TEXT,
        sources JSONB,
        origin TEXT NOT NULL DEFAULT 'search'
      );
      CREATE INDEX IF NOT EXISTS idx_mood_history_topic ON mood_history (topic_key, created_at DESC);
    `).then(() => undefined).catch(err => {
      schemaReady = null; // try again next time (database may come up later)
      throw err;
    });
  }
  return schemaReady;
}

/** "Finland, news" and "news,  FINLAND" are the same topic. */
export function topicKey(topic: string): string {
  return topic.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).sort().join(', ');
}

export async function saveSnapshot(s: MoodSnapshot): Promise<boolean> {
  const key = topicKey(s.topic);
  if (!key) return false;
  try {
    await ensureSchema();
    await query(
      `INSERT INTO mood_history (topic, topic_key, post_count, positive, neutral, negative, mood, provider, label_provider, sources, origin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [s.topic, key, s.postCount, s.positive, s.neutral, s.negative, s.mood ?? null, s.provider ?? null,
       s.labelProvider ?? null, s.sources ? JSON.stringify(s.sources) : null, s.origin ?? 'search']
    );
    return true;
  } catch (err: any) {
    logger.warn(`Mood history not saved (database unavailable?): ${err.message}`);
    return false;
  }
}

export async function getHistory(topic: string, days = 90): Promise<{ available: boolean; points: any[] }> {
  try {
    await ensureSchema();
    const res = await query(
      `SELECT created_at, post_count, positive, neutral, negative, mood, provider, label_provider, origin
         FROM mood_history
        WHERE topic_key = $1 AND created_at > NOW() - ($2 || ' days')::interval
        ORDER BY created_at ASC
        LIMIT 500`,
      [topicKey(topic), String(days)]
    );
    return {
      available: true,
      points: res.rows.map(r => ({
        at: r.created_at, n: r.post_count, positive: r.positive, neutral: r.neutral, negative: r.negative,
        mood: r.mood, provider: r.provider, labelProvider: r.label_provider, origin: r.origin,
      })),
    };
  } catch (err: any) {
    logger.warn(`Mood history unavailable: ${err.message}`);
    return { available: false, points: [] };
  }
}

/** Topics with saved history, most recent first (for the UI's topic list). */
export async function listTopics(): Promise<{ topic: string; count: number; last: string }[]> {
  try {
    await ensureSchema();
    const res = await query(
      `SELECT MAX(topic) AS topic, COUNT(*) AS count, MAX(created_at) AS last
         FROM mood_history GROUP BY topic_key ORDER BY MAX(created_at) DESC LIMIT 50`
    );
    return res.rows.map(r => ({ topic: r.topic, count: Number(r.count), last: r.last }));
  } catch {
    return [];
  }
}
