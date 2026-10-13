import { Pool } from 'pg';
import { logger } from '../utils/logger';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: +(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'echoflow',
  password: process.env.DB_PASSWORD || 'echoflow',
  database: process.env.DB_NAME || 'echoflow',
  max: 10,
  idleTimeoutMillis: 30000,
  // Fail fast when the database isn't there; the app works without it
  connectionTimeoutMillis: 3000,
});

// An idle client losing its connection (e.g. the database restarting) must not
// take the whole app down: the database only stores optional history.
pool.on('error', err => {
  logger.warn(`PostgreSQL connection error: ${err.message}`);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export { pool };