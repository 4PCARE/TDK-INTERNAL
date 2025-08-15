import { Router } from 'express';
import type { Express } from 'express';

export function registerRoutes(app: Express): void {
  const router = Router();

  // Health check endpoint
  router.get('/healthz', (req, res) => {
    res.json({ 
      status: 'healthy', 
      service: 'search-svc',
      timestamp: new Date().toISOString() 
    });
  });

  // Basic search endpoints
  router.post('/api/search', (req, res) => {
    const { query, type = 'hybrid' } = req.body;

    // TODO: Implement actual search logic
    res.json({
      query,
      type,
      results: [],
      total: 0,
      timestamp: new Date().toISOString()
    });
  });

  router.get('/api/search/status', (req, res) => {
    res.json({
      status: 'operational',
      indexSize: 0,
      timestamp: new Date().toISOString()
    });
  });

  app.use(router);
}