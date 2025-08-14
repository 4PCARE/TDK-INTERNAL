import express from 'express';
import { registerRoutes } from './infrastructure/http/routes.js';

/**
 * Bootstrap API Gateway service
 * Only mounts routes - server startup handled externally
 */
export function createApp(): express.Express {
  const app = express();
  
  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Register routes
  registerRoutes(app);
  
  return app;
}

// Minimal gateway bootstrap (no listen here)
export function createGatewayApp(express: any) {
  const app = express();
  // Optional body parsing; keep defensive and inline to avoid deps
  try { app.use(express.json ? express.json() : (_: any, __: any, next: any) => next()); } catch {}
  registerRoutes(app);
  return app;
}

// Dev-only hint (no side effects, no listen):
export const DEV_DEFAULTS = {
  LEGACY_BASE_URL: process?.env?.LEGACY_BASE_URL ?? "http://localhost:5000",
};

// Export for external server startup
export { registerRoutes };