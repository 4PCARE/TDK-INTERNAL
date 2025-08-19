
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const PORT = 5000;

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

// Proxy to API Gateway for all /api routes
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:8080',
  changeOrigin: true
}));

// Proxy to frontend for all other routes  
app.use('*', createProxyMiddleware({
  target: 'http://localhost:5000',
  changeOrigin: true
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Modern Server running on port ${PORT}`);
  console.log(`📋 Health check: http://0.0.0.0:${PORT}/healthz`);
  console.log(`🔀 Proxying /api/* to API Gateway (8080)`);
  console.log(`🔀 Proxying everything else to Frontend (3000)`);
});
