import { Router, Request, Response } from 'express';
import { getHistory, listTopics } from '../../db/history';

export const historyRouter = Router();

/** GET /api/history?topic=Finland&days=90 — saved mood snapshots for a topic, oldest first */
historyRouter.get('/', async (req: Request, res: Response) => {
  const topic = String(req.query.topic ?? '').trim();
  if (!topic) return res.status(400).json({ error: 'topic is required' });
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 90));
  const { available, points } = await getHistory(topic, days);
  return res.json({ topic, days, available, points });
});

/** GET /api/history/topics — topics that have saved history */
historyRouter.get('/topics', async (_req: Request, res: Response) => {
  res.json({ topics: await listTopics() });
});
