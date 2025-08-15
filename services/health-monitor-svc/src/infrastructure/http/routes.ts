import { Router } from 'express';
import type { Express } from 'express';

export function registerRoutes(app: Express): void {
  const router = Router();

  // Health check endpoint
  router.get('/healthz', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'health-monitor-svc',
      timestamp: new Date().toISOString()
    });
  });

  // System health monitoring endpoints
  router.get('/api/health', (req, res) => {
    // TODO: Implement actual health checks for all services
    const services = [
      { name: 'api-gateway', status: 'healthy', port: 8080 },
      { name: 'auth-svc', status: 'healthy', port: 3001 },
      { name: 'doc-ingest-svc', status: 'healthy', port: 3002 },
      { name: 'search-svc', status: 'healthy', port: 3004 },
      { name: 'embedding-svc', status: 'healthy', port: 3005 },
      { name: 'csat-svc', status: 'healthy', port: 3006 },
      { name: 'legacy-server', status: 'healthy', port: 5000 }
    ];

    res.json({
      overall: 'healthy',
      services,
      timestamp: new Date().toISOString()
    });
  });

  router.get('/api/health/:serviceName', (req, res) => {
    const { serviceName } = req.params;

    // TODO: Implement specific service health check
    res.json({
      service: serviceName,
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });

  app.use(router);
}