import type { Request, Response } from 'express';
import { Express } from 'express';
import { validateHealth, validateReady } from './validate';

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
}