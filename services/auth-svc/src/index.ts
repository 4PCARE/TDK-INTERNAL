import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { router } from './infrastructure/http/routes.js';

export function createApp() {
  const app = express();

  // Body parsing middleware - must come before routes
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Security middleware with CSP configuration for Replit auth
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://auth.util.repl.co"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://auth.util.repl.co"],
        frameSrc: ["'self'", "https://auth.util.repl.co"],
      },
    },
  }));
  app.use(cors({
    origin: ['http://localhost:3003', 'http://localhost:5000', 'http://localhost:8080'],
    credentials: true
  }));

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