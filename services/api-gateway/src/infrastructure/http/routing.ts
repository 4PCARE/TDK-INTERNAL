import { Express, Request, Response } from 'express';
import { proxyRequest } from './proxy.js';

export function setupRouting(app: Express): void {
  // Health check for the gateway itself
  app.get('/healthz', (req: Request, res: Response) => {
    res.json({ status: 'healthy', service: 'api-gateway' });
  });

  // Service health checks
  app.get('/health/auth', (req, res) => {
    proxyRequest(req, res, 'http://localhost:3001/healthz');
  });

  app.get('/health/doc-ingest', (req, res) => {
    proxyRequest(req, res, 'http://localhost:3002/healthz');
  });

  app.get('/health/agent', (req, res) => {
    proxyRequest(req, res, 'http://localhost:3005/healthz');
  });

  // Auth service routes
  app.get('/me', (req, res) => {
    proxyRequest(req, res, 'http://localhost:3001/me');
  });

  app.post('/login', (req, res) => {
    proxyRequest(req, res, 'http://localhost:3001/login');
  });

  // Agent service routes
  app.get('/api/agents', (req, res) => {
    proxyRequest(req, res, 'http://localhost:3005/api/agents');
  });

  // Document ingestion routes
  app.use('/api/documents', (req, res) => {
    const targetUrl = `http://localhost:3002${req.originalUrl.replace('/api/documents', '/documents')}`;
    proxyRequest(req, res, targetUrl);
  });

  // Search service routes
  app.use('/api/search', (req, res) => {
    const targetUrl = `http://localhost:3003${req.originalUrl.replace('/api/search', '/search')}`;
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