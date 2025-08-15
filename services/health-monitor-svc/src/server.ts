
import express from 'express';
import { registerRoutes } from './infrastructure/http/routes.js';

const app = express();
app.use(express.json());

// Register routes
registerRoutes(app);

const PORT = process.env.PORT || 3007;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏥 Health Monitor service running on port ${PORT}`);
  console.log(`📋 System health: http://0.0.0.0:${PORT}/api/health`);
});
