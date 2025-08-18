import { Express, Request, Response } from 'express';
import { createProxyHandler } from './proxy.js';
import { createProxyMiddleware } from 'http-proxy-middleware'; // Import createProxyMiddleware

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

// Dummy function to simulate logging request body
function logRequestBody(proxyReq: any, req: any) {
  // In a real scenario, you would inspect req.body or the stream
  // console.log('Request Body:', req.body);
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

  // Agent service routes - proxy to agent-svc
  app.use('/api/agents', createProxyMiddleware({
    target: 'http://localhost:3005',
    changeOrigin: true,
    pathRewrite: {
      '^/api/agents$': '/agents',
      '^/api/agents/(.*)': '/agents/$1'
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`🔀 Proxying ${req.method} ${req.originalUrl} to http://localhost:3005${proxyReq.path}`);
      console.log(`📍 Original URL: ${req.originalUrl}, Target path: ${proxyReq.path}`);
      logRequestBody(proxyReq, req);
    },
    onError: (err, req, res) => {
      console.error('🚨 Agent service proxy error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Agent service unavailable', details: err.message });
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      // Log the response for debugging
      console.log(`📥 Agent service response: ${proxyRes.statusCode} for ${req.method} ${req.url}`);

      // If we get HTML response, convert to JSON error
      if (proxyRes.headers['content-type']?.includes('text/html') && proxyRes.statusCode >= 400) {
        res.status(proxyRes.statusCode).json({
          error: `Agent service error: ${proxyRes.statusCode}`,
          message: 'Service returned HTML error page instead of JSON'
        });
      }
    }
  }));

  // Add other service routes here as needed
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