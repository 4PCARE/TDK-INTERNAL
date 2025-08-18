import { Router } from 'express';
import type { Express } from 'express';

export function registerRoutes(app: Express): void {
  const router = Router();

  // Single test route
  router.get('/test', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(router);
}