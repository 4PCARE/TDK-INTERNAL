import type { Request, Response } from 'express';
import { Express } from 'express';
import { validateHealth, validateReady } from './validate';
import { registerLegacyRoutes, proxyToService, proxyToLegacy } from './routing';

/**
 * Register health check routes for API Gateway
 * Business logic routes to be added in Phase 2+
 */
export function registerRoutes(app: Express): void {
  // Health check endpoints
  app.get('/healthz', (_req: Request, res: Response) => {
    const payload = { ok: true };
    if (!validateHealth(payload)) {
      return res.status(500).json({ message: 'Contract violation' });
    }
    return res.status(200).json(payload);
  });

  app.get('/readyz', (_req: Request, res: Response) => {
    const payload = { ready: true };
    if (!validateReady(payload)) {
      return res.status(500).json({ message: 'Contract violation' });
    }
    return res.status(200).json(payload);
  });

  // API routes
  app.use('/api/auth', proxyToService('auth-svc', 3001));
  app.use('/api/documents', proxyToService('doc-ingest-svc', 3002));
  app.use('/api/search', proxyToService('search-svc', 3003));
  app.use('/api/agents', proxyToService('agent-svc', 3004));
  app.use('/api/embeddings', proxyToService('embedding-svc', 3005));
  app.use('/api/csat', proxyToService('csat-svc', 3006));

  // Legacy proxy - catch all other routes
  app.use('/', proxyToLegacy);
}