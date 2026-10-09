import express, { Express } from 'express';
import cors from 'cors';
import { discoverRouter } from './routes/discover';
import { searchRouter } from './routes/search';
import { analyticsRouter } from './routes/analytics';
import { redditRouter } from './routes/reddit';
import { recsRouter } from './routes/recs';
import { logger } from '../utils/logger';
import { registry } from '../collectors';
import path from 'path';

export function setupRoutes(app: Express): void {
  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging (body is not logged — it can contain user API keys)
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`, { query: req.query, ip: req.ip });
    next();
  });

  // Routes
  app.use('/api/discover', discoverRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/reddit', redditRouter);
  app.use('/api/recs', recsRouter);

  // List all registered sources, their capabilities and whether they need a key
  app.get('/api/platforms', (_req, res) => {
    res.json({ platforms: registry.getSupportedPlatforms() });
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'echoflow', timestamp: new Date().toISOString() });
  });

  // ── UI: a single page ───────────────────────────────────────────────────────
  const publicDir = path.resolve(__dirname, '../../public');
  const sendIndex = (_req: express.Request, res: express.Response) =>
    res.sendFile(path.join(publicDir, 'index.html'));

  // Old multi-page URLs → the one page
  const legacyPages = ['reddit', 'news', 'analytics', 'recs', 'docs'];
  app.get([...legacyPages.map(p => `/ui/${p}`), ...legacyPages.map(p => `/ui/${p}.html`)], (_req, res) => res.redirect('/'));

  app.get(['/', '/ui', '/ui/'], sendIndex);
  app.use('/ui', express.static(publicDir));
  app.use(express.static(publicDir));

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Error occurred:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  });
}
