
import express from 'express';
import { registerRoutes } from './infrastructure/http/routes.js';

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(express.json());

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Register routes
registerRoutes(app);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔍 Search Service running on port ${PORT}`);
});
