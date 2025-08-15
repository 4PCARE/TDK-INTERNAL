import { Router } from 'express';
import type { Express } from 'express';

export function registerRoutes(app: Express): void {
  const router = Router();

  // Health check endpoint
  router.get('/healthz', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'agent-svc',
      timestamp: new Date().toISOString()
    });
  });

  // Basic agent endpoints
  router.get('/api/agents', (req, res) => {
    // TODO: Implement agent list
    res.json({
      agents: [],
      total: 0,
      timestamp: new Date().toISOString()
    });
  });

  router.post('/api/agents/chat', (req, res) => {
    const { message, agentId } = req.body;

    // TODO: Implement actual chat logic
    res.json({
      response: 'Agent service placeholder response',
      agentId,
      timestamp: new Date().toISOString()
    });
  });

  app.use(router);
}