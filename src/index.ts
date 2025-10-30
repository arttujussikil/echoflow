import express from 'express';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { setupRoutes } from './api/server';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Setup all routes
setupRoutes(app);

app.listen(PORT, () => {
  logger.info(`EchoFlow server running on port ${PORT}`);
  logger.info(`UI available at http://localhost:${PORT}/ui/`);
  logger.info(`API available at http://localhost:${PORT}/api`);
});