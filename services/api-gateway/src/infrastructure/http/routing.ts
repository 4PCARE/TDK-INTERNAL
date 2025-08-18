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

  // Agent service routes - manual proxy
  app.use('/api/agents', (req, res) => {
    const serviceUrl = getServiceUrl('agent');
    if (!serviceUrl) {
      return res.status(503).json({ error: 'Agent service unavailable' });
    }
    
    // Rewrite the path from /api/agents to /agents
    let targetPath = req.url; // Use req.url instead of req.originalUrl
    if (targetPath === '/') {
      targetPath = '/agents'; // Root of /api/agents should map to /agents
    } else {
      targetPath = `/agents${targetPath}`; // Sub-paths should be /agents/...
    }
    
    console.log(`🔀 Manual proxy: ${req.method} ${req.originalUrl} -> ${serviceUrl}${targetPath}`);
    
    // Create a modified request handler that uses the correct target path
    const proxyHandler = createProxyHandler(serviceUrl);
    
    // Temporarily modify req.path for the proxy
    const originalPath = req.path;
    req.path = targetPath;
    
    proxyHandler(req, res);
    
    // Restore original path
    req.path = originalPath;
  });

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