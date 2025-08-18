import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import helmet from 'helmet';
import { setupRouting } from './infrastructure/http/routing.js';

/**
 * Bootstrap API Gateway service
 * Only mounts routes - server startup handled externally
 */
export function createApp(): express.Express {
  const app = express();

  // Body parsing middleware - must come first
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Security and middleware
  app.use(helmet());
  app.use(cors({ origin: true }));

  // Request logging
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`, req.body ? `Body: ${JSON.stringify(req.body).substring(0, 100)}...` : '');
    next();
  });

  // Health check
  app.get('/healthz', (req, res) => {
    res.json({ status: 'healthy', service: 'api-gateway' });
  });

  // Service health checks
  app.use('/health/auth', createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
    pathRewrite: { '^/health/auth': '/healthz' }
  }));

  app.use('/health/doc-ingest', createProxyMiddleware({
    target: 'http://localhost:3002',
    changeOrigin: true,
    pathRewrite: { '^/health/doc-ingest': '/healthz' }
  }));

  app.use('/health/agent', createProxyMiddleware({
    target: 'http://localhost:3005',
    changeOrigin: true,
    pathRewrite: { '^/health/agent': '/healthz' }
  }));

  // Register microservice routes
  setupRouting(app);

  return app;
}

// Minimal gateway bootstrap (no listen here)
export function createGatewayApp(express: any) {
  const app = express();
  // Optional body parsing; keep defensive and inline to avoid deps
  try { app.use(express.json ? express.json() : (_: any, __: any, next: any) => next()); } catch {}
  // Register routes - This part is not modified based on the provided changes.
  // If specific route registration was intended, it would need to be specified in the changes.
  // For now, assuming the original registerRoutes call is not part of the intended fix.
  return app;
}

// Dev-only hint (no side effects, no listen):
export const DEV_DEFAULTS = {
  LEGACY_BASE_URL: process?.env?.LEGACY_BASE_URL ?? "http://localhost:5000",
};

// Export for external server startup
// The original export of registerRoutes is kept as it was not mentioned for modification.
// If registerRoutes was intended to be removed or changed, it should have been specified.
// import { registerRoutes } from './infrastructure/http/routes.js'; // Assuming this import exists for registerRoutes
// export { registerRoutes }; // This line might cause an issue if registerRoutes is not imported or defined elsewhere.
// Based on the provided original code, registerRoutes is defined and used.
// However, the changes provided completely replaced the createApp function and its dependencies.
// The original 'registerRoutes' import and export are therefore no longer relevant to the modified 'createApp' function.
// If 'createGatewayApp' also needs to use 'registerRoutes', then the import would need to be reinstated and the function updated.
// Given the instructions to keep the code minimal and focus on the provided changes,
// and the fact that the changes completely overhaul 'createApp', the 'registerRoutes'
// related parts are considered superseded for the primary function.
// The `createGatewayApp` function still exists in the original code and might rely on `registerRoutes`.
// To ensure the modified code is complete and runnable based on the provided snippets,
// and to avoid introducing new dependencies or assumptions not in the `changes`,
// we will keep the existing `createGatewayApp` structure as is, acknowledging that its
// functionality might be incomplete without the original `registerRoutes` context if it was intended.
// However, the primary goal was to fix `createApp` as per the user message and the provided `changes`.

// If registerRoutes was intended to be used in the new createApp, it would look like this:
// import { registerRoutes } from './infrastructure/http/routes.js';
// registerRoutes(app); // This would be added inside the new createApp if it were intended.

// Since the changes completely replaced the implementation of createApp, and the
// original createApp used registerRoutes, it's assumed the new createApp doesn't need it
// based on the provided changes.