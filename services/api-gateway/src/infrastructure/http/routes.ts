import { Express } from 'express';

/**
 * Register health check routes for API Gateway
 * Business logic routes to be added in Phase 2+
 */
export function registerRoutes(app: Express): void {
  // Health check endpoints
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'api-gateway' });
  });

  app.get('/readyz', (_req, res) => {
    res.status(200).json({ 
      status: 'ready', 
      service: 'api-gateway',
      timestamp: new Date().toISOString()
    });
  });
}