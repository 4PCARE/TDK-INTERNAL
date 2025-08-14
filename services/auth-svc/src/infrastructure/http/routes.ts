import { Express } from 'express';
import type { Request, Response } from "express";
import { validateUser } from "./validate";

/**
 * Register health check routes for Auth Service
 * Authentication routes to be added in Phase 2+
 */
export function registerRoutes(app: Express): void {
  // Health check endpoints
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'auth-svc' });
  });

  app.get('/readyz', (_req, res) => {
    res.status(200).json({ 
      status: 'ready', 
      service: 'auth-svc',
      timestamp: new Date().toISOString()
    });
  });

  // User profile endpoint - stubbed for contract compliance
  app.get("/me", (_req: Request, res: Response) => {
    const payload = {
      id: "00000000-0000-4000-8000-000000000000",
      email: "dev@example.com",
      roles: ["admin"]
    };

    if (!validateUser(payload)) {
      return res.status(500).json({ message: "Contract violation" });
    }

    return res.status(200).json(payload);
  });
}