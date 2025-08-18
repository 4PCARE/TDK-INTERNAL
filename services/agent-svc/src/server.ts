import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { router } from './infrastructure/http/routes.js';

const PORT = process.env.AGENT_SVC_PORT || 3003;

async function startServer() {
  try {
    const app = express();

    // Security middleware
    app.use(helmet());
    app.use(cors());

    // Body parsing
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Request logging
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });

    // Routes
    app.use('/', router);

    // Error handling
    app.use((err: any, req: any, res: any, next: any) => {
      console.error('Agent service error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🤖 Agent Service running on port ${PORT}`);
      console.log(`📋 Health check: http://0.0.0.0:${PORT}/healthz`);
    });
  } catch (error) {
    console.error('Failed to start agent service:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { startServer };