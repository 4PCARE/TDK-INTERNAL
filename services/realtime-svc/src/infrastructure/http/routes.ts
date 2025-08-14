/**
 * Health check routes for Realtime Service
 */
export function registerRoutes(app: any): void {
  app.get('/healthz', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', service: 'realtime-svc' });
  });

  app.get('/readyz', (_req: any, res: any) => {
    res.status(200).json({ 
      status: 'ready', 
      service: 'realtime-svc',
      timestamp: new Date().toISOString()
    });
  });
}