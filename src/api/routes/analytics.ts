import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { AnalyticsExporter } from '../../exporters/analytics-exporter';
import { analyzeWithAI, checkOllamaStatus } from '../../services/ai-service';

export const analyticsRouter = Router();

/** POST /api/analytics/analyze — run AI analysis on an array of posts */
analyticsRouter.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { posts, keyword } = req.body;

    if (!Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ error: 'posts array is required and must not be empty' });
    }

    logger.info(`AI analyze request: ${posts.length} posts${keyword ? ` keyword="${keyword}"` : ''}`);
    const analysis = await analyzeWithAI(posts, keyword);
    return res.json(analysis);
  } catch (error: any) {
    logger.error('AI analyze failed', { message: error.message });
    const isOllamaDown = error.message?.toLowerCase().includes('ollama');
    return res.status(isOllamaDown ? 503 : 500).json({ error: error.message });
  }
});

/** GET /api/analytics/status — check if Ollama is reachable */
analyticsRouter.get('/status', async (_req: Request, res: Response) => {
  const status = await checkOllamaStatus();
  res.status(status.available ? 200 : 503).json(status);
});

analyticsRouter.post('/summary', async (req: Request, res: Response) => {
  try {
    const { searchId } = req.body;
    if (!searchId) return res.status(400).json({ error: 'searchId is required' });
    logger.info(`Generating summary for search: ${searchId}`);
    res.json({
      searchId,
      summary: 'AI-generated summary will appear here',
      sentiment: { positive: 0, neutral: 0, negative: 0 },
      trends: [],
      keyTopics: [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to generate analytics' });
  }
});

analyticsRouter.get('/sentiment/:searchId', async (req: Request, res: Response) => {
  try {
    const { searchId } = req.params;
    res.json({
      searchId,
      overall: 'neutral',
      breakdown: { positive: 33, neutral: 34, negative: 33 }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sentiment' });
  }
});

analyticsRouter.get('/trends/:searchId', async (req: Request, res: Response) => {
  try {
    const { searchId } = req.params;
    res.json({ searchId, trends: [], peakTimes: [], growthRate: 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

analyticsRouter.post('/export', async (req: Request, res: Response) => {
  try {
    const { data, format = 'csv' } = req.body;
    if (!data) return res.status(400).json({ error: 'Analytics data required' });

    if (format === 'csv') {
      const csv = AnalyticsExporter.toCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-${Date.now()}.csv"`);
      return res.send(csv);
    }
    if (format === 'json') {
      const json = AnalyticsExporter.toJSON(data, true);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-${Date.now()}.json"`);
      return res.send(json);
    }
    return res.status(400).json({ error: 'Invalid format. Use csv or json' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
