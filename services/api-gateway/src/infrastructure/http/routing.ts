import { Express, Request, Response } from 'express';
import { createProxyHandler } from './proxy.js';

// Helper function to get service URLs
function getServiceUrl(service: string): string | null {
  const serviceMap: Record<string, string> = {
    'auth': 'http://localhost:3001',
    'doc-ingest': 'http://localhost:3002',
    'agent': 'http://localhost:3005', // Corrected port for agent service
    'embedding': 'http://localhost:3004',
    'search': 'http://localhost:3003', // Corrected port for search service
    'csat': 'http://localhost:3006'
  };

  return serviceMap[service] || null;
}

export function setupRouting(app: Express): void {
  // Health check for the gateway itself
  app.get('/healthz', (req: Request, res: Response) => {
    res.json({ status: 'healthy', service: 'api-gateway' });
  });

  // Health routes for individual services
  app.get('/health/:service', (req, res) => {
    const { service } = req.params;
    const serviceUrl = getServiceUrl(service);

    if (!serviceUrl) {
      return res.status(404).json({ error: `Service ${service} not found` });
    }

    const proxyHandler = createProxyHandler(`${serviceUrl}/healthz`);
    proxyHandler(req, res);
  });

  // Auth service routes
  app.get('/me', (req, res) => {
    const serviceUrl = getServiceUrl('auth');
    if (!serviceUrl) {
      return res.status(503).json({ error: 'Auth service unavailable' });
    }
    const proxyHandler = createProxyHandler(`${serviceUrl}/me`);
    proxyHandler(req, res);
  });

  app.post('/login', (req, res) => {
    const serviceUrl = getServiceUrl('auth');
    if (!serviceUrl) {
      return res.status(503).json({ error: 'Auth service unavailable' });
    }
    const proxyHandler = createProxyHandler(`${serviceUrl}/login`);
    proxyHandler(req, res);
  });

  // Agent service routes
  app.use('/api/agents', (req, res) => {
    const serviceUrl = getServiceUrl('agent');
    if (!serviceUrl) {
      return res.status(503).json({ error: 'Agent service unavailable' });
    }
    const targetUrl = `${serviceUrl}${req.originalUrl.replace('/api/agents', '/agents')}`;
    const proxyHandler = createProxyHandler(targetUrl);
    proxyHandler(req, res);
  });

  // Document ingestion routes
  app.use('/api/documents', (req, res) => {
    const serviceUrl = getServiceUrl('doc-ingest');
    if (!serviceUrl) {
      return res.status(503).json({ error: 'Document ingestion service unavailable' });
    }
    const targetUrl = `${serviceUrl}${req.originalUrl.replace('/api/documents', '')}`;
    const proxyHandler = createProxyHandler(targetUrl);
    proxyHandler(req, res);
  });

  // Search service routes
  app.use('/api/search', (req, res) => {
    const serviceUrl = getServiceUrl('search');
    if (!serviceUrl) {
      return res.status(503).json({ error: 'Search service unavailable' });
    }
    const targetUrl = `${serviceUrl}${req.originalUrl.replace('/api/search', '')}`;
    const proxyHandler = createProxyHandler(targetUrl);
    proxyHandler(req, res);
  });

  // Embedding service routes
  app.use('/api/embeddings', (req, res) => {
    const serviceUrl = getServiceUrl('embedding');
    if (!serviceUrl) {
      return res.status(503).json({ error: 'Embedding service unavailable' });
    }
    const targetUrl = `${serviceUrl}${req.originalUrl.replace('/api/embeddings', '')}`;
    const proxyHandler = createProxyHandler(targetUrl);
    proxyHandler(req, res);
  });

  // CSAT service routes
  app.use('/api/csat', (req, res) => {
    const serviceUrl = getServiceUrl('csat');
    if (!serviceUrl) {
      return res.status(503).json({ error: 'CSAT service unavailable' });
    }
    const targetUrl = `${serviceUrl}${req.originalUrl.replace('/api/csat', '')}`;
    const proxyHandler = createProxyHandler(targetUrl);
    proxyHandler(req, res);
  });

  // Fallback for unmatched routes
  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found', path: req.path });
  });
}