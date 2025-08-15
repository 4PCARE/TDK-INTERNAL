
import { createApp } from './index.js';

const PORT = process.env.API_GATEWAY_PORT || 8080;

async function startServer() {
  try {
    const app = createApp();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 API Gateway running on port ${PORT}`);
      console.log(`📋 Health check: http://0.0.0.0:${PORT}/healthz`);
      console.log(`🔀 Routing requests to microservices`);
    });
  } catch (error) {
    console.error('Failed to start API Gateway:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { startServer };
