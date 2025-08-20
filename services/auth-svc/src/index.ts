import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { router as authRoutes } from './infrastructure/http/routes.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Default CSP that allows Replit Auth (can be overridden per route)
app.use((req, res, next) => {
  if (!res.get('Content-Security-Policy')) {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://auth.util.repl.co; " +
      "connect-src 'self' https://auth.util.repl.co wss://auth.util.repl.co; " +
      "frame-src 'self' https://auth.util.repl.co; " +
      "style-src 'self' 'unsafe-inline';"
    );
  }
  next();
});

// Use auth routes
app.use('/', authRoutes);

export function createApp() {
  return app;
}