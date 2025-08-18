
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { router } from './infrastructure/http/routes.js';

export function createApp() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: ['http://localhost:3003', 'http://localhost:5000', 'http://localhost:8080'],
    credentials: true
  }));

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });

  // Routes
  app.use('/', router);

  // Error handling
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Auth service error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
