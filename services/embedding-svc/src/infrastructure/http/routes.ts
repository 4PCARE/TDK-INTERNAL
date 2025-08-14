/**
 * Health check routes for Embedding Service
 */
export function registerRoutes(app: any): void {
  app.get('/healthz', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', service: 'embedding-svc' });
  });

  app.get('/readyz', (_req: any, res: any) => {
    res.status(200).json({ 
      status: 'ready', 
      service: 'embedding-svc',
      timestamp: new Date().toISOString()
    });
  });
}