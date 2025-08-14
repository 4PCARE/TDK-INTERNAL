/**
 * Health check routes for LINE Bridge Service
 */
export function registerRoutes(app: any): void {
  app.get('/healthz', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', service: 'line-bridge-svc' });
  });

  app.get('/readyz', (_req: any, res: any) => {
    res.status(200).json({ 
      status: 'ready', 
      service: 'line-bridge-svc',
      timestamp: new Date().toISOString()
    });
  });
}