// Must be the first import: other modules read process.env when they load
import 'dotenv/config';
import express from 'express';
import { logger } from './utils/logger';
import { setupRoutes } from './api/server';
import { warmUpLocalSentiment } from './services/local-sentiment';
import { warmUpEmbeddings } from './services/embeddings';
import { startTracker } from './services/tracker';

const app = express();
const PORT = process.env.PORT || 3000;

// Setup all routes
setupRoutes(app);

app.listen(PORT, () => {
  logger.info(`EchoFlow server running on port ${PORT}`);
  logger.info(`UI available at http://localhost:${PORT}/`);
  logger.info(`API available at http://localhost:${PORT}/api`);
});

// Download/load the local models in the background: offline sentiment fallback + embeddings (stories, Ask)
warmUpLocalSentiment();
warmUpEmbeddings();

// Optional: analyse TRACK_TOPICS every few hours for the mood-over-time chart
startTracker();
