import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { analyzeWithAI, checkOllamaStatus, providerConfigured, ProviderId } from '../../services/ai-service';

export const analyticsRouter = Router();

/** POST /api/analytics/analyze — run AI analysis on an array of posts */
analyticsRouter.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { posts, keyword, language, provider } = req.body;

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
