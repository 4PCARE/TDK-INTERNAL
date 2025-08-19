import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const PORT = 4000;
const GATEWAY_PORT = 8080; // Assuming GATEWAY_PORT is the port for the API Gateway

// Basic middleware
app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/healthz', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'modern-server',
    timestamp: new Date().toISOString()
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'AI-KMS Modern Server',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Proxy API routes to the API Gateway
app.use('/api', createProxyMiddleware({
  target: `http://0.0.0.0:${GATEWAY_PORT}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api', // Keep /api prefix when forwarding to gateway
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'API Gateway connection failed',
        timestamp: new Date().toISOString()
      });
    }
  },
  onProxyReq: (proxyReq, req, res) => {
    // Forward original headers including auth
    Object.keys(req.headers).forEach(key => {
      if (req.headers[key]) {
        proxyReq.setHeader(key, req.headers[key]);
      }
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    // Log API responses in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔄 API ${req.method} ${req.path} → ${proxyRes.statusCode}`);
    }
  }
}));

// Proxy to frontend for all other routes
app.use('*', createProxyMiddleware({
  target: 'http://localhost:5001',
  changeOrigin: true
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Modern Server running on port ${PORT}`);
  console.log(`📋 Health check: http://0.0.0.0:${PORT}/healthz`);
  console.log(`🔀 Proxying /api/* to API Gateway (${GATEWAY_PORT})`);
  console.log(`🔀 Proxying everything else to Frontend (5001)`);
});