
import { createApp } from './index.js';

const PORT = Number(process.env.AUTH_SVC_PORT) || 3001;

async function startServer() {
  try {
    const app = createApp();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🔐 Auth Service running on port ${PORT}`);
      console.log(`📋 Health check: http://0.0.0.0:${PORT}/healthz`);
    });
  } catch (error) {
    console.error('Failed to start auth service:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { startServer };
