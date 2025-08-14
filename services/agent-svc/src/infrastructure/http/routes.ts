/**
 * Health check routes for Agent Service
 */
export function registerRoutes(app: any): void {
  app.get('/healthz', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', service: 'agent-svc' });
  });

  app.get('/readyz', (_req: any, res: any) => {
    res.status(200).json({ 
      status: 'ready', 
      service: 'agent-svc',
      timestamp: new Date().toISOString()
    });
  });
}