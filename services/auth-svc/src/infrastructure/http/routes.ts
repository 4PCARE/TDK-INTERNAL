import { Express } from 'express';

/**
 * Register health check routes for Auth Service
 * Authentication routes to be added in Phase 2+
 */
export function registerRoutes(app: Express): void {
  // Health check endpoints
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'auth-svc' });
  });

  app.get('/readyz', (_req, res) => {
    res.status(200).json({ 
      status: 'ready', 
      service: 'auth-svc',
      timestamp: new Date().toISOString()
    });
  });
}