import express from 'express';
import { registerRoutes } from './infrastructure/http/routes.js';

/**
 * Bootstrap Auth Service
 * Only mounts routes - server startup handled externally
 */
export function createApp(): express.Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/healthz', (req, res) => {
    res.json({ status: 'healthy', service: 'auth-svc' });
  });

  // Basic auth endpoints
  app.get('/me', (req, res) => {
    res.json({ user: null, authenticated: false });
  });

  app.post('/login', (req, res) => {
    res.json({ success: true, token: 'mock-token' });
  });

  app.post('/refresh', (req, res) => {
    res.json({ success: true, token: 'mock-refreshed-token' });
  });

  // Register routes
  registerRoutes(app);

  return app;
}

// Export for external server startup
export { registerRoutes };