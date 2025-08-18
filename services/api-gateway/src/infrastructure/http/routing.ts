import { Express, Request, Response } from 'express';
import { proxyRequest } from './proxy.js';

// Helper function to get service URLs
function getServiceUrl(service: string): string | null {
  const serviceMap: Record<string, string> = {
    'auth': 'http://localhost:3001',
    'doc-ingest': 'http://localhost:3002',
    'agent': 'http://localhost:3003', // Corrected port for agent service
    'embedding': 'http://localhost:3004',
    'search': 'http://localhost:3005', // Corrected port for search service
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
  app.get('/health/:service', async (req, res) => {
    const { service } = req.params;
    const serviceUrl = getServiceUrl(service);

    if (!serviceUrl) {
      return res.status(404).json({ error: `Service ${service} not found` });
    }

    try {
      // Assuming proxyRequest can handle a URL string directly or an options object
      const response = await proxyRequest({
        method: 'GET',
        url: `${serviceUrl}/healthz`,
        headers: req.headers as Record<string, string>
      });

      res.status(response.status).json(response.data);
    } catch (error) {
      console.error(`Health check failed for ${service}:`, error);
      res.status(503).json({ error: `Service ${service} unavailable` });
    }
  });

  // Auth service routes
  app.get('/me', async (req, res) => {
    try {
      const response = await proxyRequest({
        method: 'GET',
        url: `${getServiceUrl('auth')}/me`,
        headers: req.headers as Record<string, string>
      });
      res.status(response.status).json(response.data);
    } catch (error) {
      console.error('Auth /me proxy error:', error);
      res.status(503).json({ error: 'Auth service unavailable' });
    }
  });

  app.post('/login', async (req, res) => {
    try {
      const response = await proxyRequest({
        method: 'POST',
        url: `${getServiceUrl('auth')}/login`,
        headers: req.headers as Record<string, string>,
        data: req.body
      });
      res.status(response.status).json(response.data);
    } catch (error) {
      console.error('Auth /login proxy error:', error);
      res.status(503).json({ error: 'Auth service unavailable' });
    }
  });

  // Agent service routes
  app.get('/api/agents', async (req, res) => {
    try {
      const response = await proxyRequest({
        method: 'GET',
        url: `${getServiceUrl('agent')}/agents`, // Proxy to /agents endpoint of agent service
        headers: req.headers as Record<string, string>
      });
      res.status(response.status).json(response.data);
    } catch (error) {
      console.error('Agent /agents proxy error:', error);
      res.status(503).json({ error: 'Agent service unavailable' });
    }
  });

  // Document ingestion routes
  app.use('/api/documents', (req, res) => {
    const targetUrl = `http://localhost:3002${req.originalUrl.replace('/api/documents', '/documents')}`;
    proxyRequest(req, res, targetUrl);
  });

  // Search service routes
  app.use('/api/search', (req, res) => {
    const targetUrl = `http://localhost:3005${req.originalUrl.replace('/api/search', '/search')}`; // Corrected port for search service
    proxyRequest(req, res, targetUrl);
  });

  // Embedding service routes
  app.use('/api/embeddings', (req, res) => {
    const targetUrl = `http://localhost:3004${req.originalUrl.replace('/api/embeddings', '/embeddings')}`;
    proxyRequest(req, res, targetUrl);
  });

  // CSAT service routes
  app.use('/api/csat', (req, res) => {
    const targetUrl = `http://localhost:3006${req.originalUrl.replace('/api/csat', '/csat')}`;
    proxyRequest(req, res, targetUrl);
  });

  // Health monitor routes
  app.use('/api/health', (req, res) => {
    const targetUrl = `http://localhost:3007${req.originalUrl.replace('/api/health', '/health')}`;
    proxyRequest(req, res, targetUrl);
  });

  // Fallback for unmatched routes
  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found', path: req.path });
  });
}