import express, { Express } from 'express';
import cors from 'cors';
import { searchRouter } from './routes/search';
import { analyticsRouter } from './routes/analytics';
import { exportRouter } from './routes/export';
import { redditRouter } from './routes/reddit';
import { logger } from '../utils/logger';
import path from 'path';

export function setupRoutes(app: Express): void {
  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      query: req.query,
      ip: req.ip
    });
    next();
  });

  // Routes
  app.use('/api/search', searchRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/reddit', redditRouter);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'echoflow', timestamp: new Date().toISOString() });
  });

  // Serve static files
  const publicDir = path.resolve(__dirname, '../../public');
  app.use('/ui', express.static(publicDir));

  // Redirect /ui to landing page
  app.get('/ui', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Reddit search page
  app.get('/ui/reddit', (_req, res) => {
    res.sendFile(path.join(publicDir, 'reddit.html'));
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Error occurred:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  });
}