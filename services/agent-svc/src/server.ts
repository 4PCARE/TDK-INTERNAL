import express from 'express';
import { registerRoutes } from './infrastructure/http/routes.js';

const app = express();
app.use(express.json());

// Basic middleware
app.use((req, res, next) => {
  // Mock user for development
  if (!req.user && req.headers.authorization) {
    req.user = { id: 'dev-user', email: 'dev@example.com' };
  }
  next();
});

// Register routes
registerRoutes(app);

const PORT = process.env.PORT || 3005;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Agent service running on port ${PORT}`);
});