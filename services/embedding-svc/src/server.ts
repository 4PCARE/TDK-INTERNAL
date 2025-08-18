import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { registerRoutes } from './infrastructure/http/routes.js';

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add request logging
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

// Routes
registerRoutes(app);

// Error handling
app.use((error: any, req: any, res: any, next: any) => {
  console.error('🚨 Embedding Service Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    service: 'embedding-svc',
    message: error.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    service: 'embedding-svc',
    path: req.path
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔮 Embedding Service running on port ${PORT}`);
  console.log(`📋 Health check: http://0.0.0.0:${PORT}/healthz`);
  console.log(`🧠 Embedding endpoints available`);
  console.log(`🌐 Available routes:`);
  console.log(`   GET  /healthz - Health check`);
  console.log(`   GET  /providers - Available providers`);
  console.log(`   POST /embed - Generate embeddings`);
  console.log(`   POST /index - Index document`);
  console.log(`   POST /search - Vector similarity search`);
});