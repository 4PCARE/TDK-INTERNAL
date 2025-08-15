import express from 'express';
import { registerRoutes } from './infrastructure/http/routes.js';

/**
 * Bootstrap Document Ingestion Service
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