
import { pool } from './db';

export function startDatabaseKeepAlive() {
  // Ping database every 4 minutes to prevent sleep
  const keepAliveInterval = setInterval(async () => {
    try {
      await pool.query('SELECT 1');
      console.log('Database keep-alive ping successful');
    } catch (error) {
      console.warn('Database keep-alive ping failed:', error.message);
    }
  }, 4 * 60 * 1000); // 4 minutes

  // Clean up on process exit
  process.on('SIGINT', () => {
    clearInterval(keepAliveInterval);
  });

  process.on('SIGTERM', () => {
    clearInterval(keepAliveInterval);
  });

  console.log('Database keep-alive service started');
}
