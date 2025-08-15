

import { createApp } from './index.js';

const PORT = process.env.DOC_INGEST_SVC_PORT || 3002;

async function startServer() {
  try {
    const app = createApp();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`📄 Document Ingestion Service running on port ${PORT}`);
      console.log(`📋 Health check: http://0.0.0.0:${PORT}/healthz`);
      console.log(`📤 Upload endpoint: http://0.0.0.0:${PORT}/documents`);
    });
  } catch (error) {
    console.error('Failed to start doc-ingest service:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { startServer };
