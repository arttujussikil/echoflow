// Must be the first import: other modules read process.env when they load
import 'dotenv/config';
import express from 'express';
import { logger } from './utils/logger';
import { setupRoutes } from './api/server';

const app = express();
const PORT = process.env.PORT || 3000;

// Setup all routes
setupRoutes(app);

app.listen(PORT, () => {
  logger.info(`EchoFlow server running on port ${PORT}`);
  logger.info(`UI available at http://localhost:${PORT}/`);
  logger.info(`API available at http://localhost:${PORT}/api`);
});