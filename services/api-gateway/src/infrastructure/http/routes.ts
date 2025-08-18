import { Router, Application } from 'express';

/**
 * Register health check routes for API Gateway
 * Business logic routes to be added in Phase 2+
 */
export function registerRoutes(app: Application): void {
  const router = Router();

  // Health check endpoint
  router.get('/healthz', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'api-gateway',
      timestamp: new Date().toISOString()
    });
  });

  // Mount router
  app.use('/', router);
}