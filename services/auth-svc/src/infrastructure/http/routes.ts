import { Express } from 'express';
import type { Request, Response } from "express";
import { validateUser, validateLoginReq, validateLoginRes, validateRefreshReq, validateRefreshRes, validateRolesRes, validatePolicyCheckReq, validatePolicyCheckRes } from "./validate";
import { replitAuthMiddleware, requireAdmin, type AuthenticatedRequest } from "./middleware";

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

  // User profile endpoint - get current authenticated user
  app.get("/me", (req: Request, res: Response) => {
    try {
      // Check for Replit headers
      const userId = req.headers['x-replit-user-id'] as string;
      const userEmail = req.headers['x-replit-user-name'] as string;
      const userRoles = req.headers['x-replit-user-roles'] as string;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const roles = userRoles ? userRoles.split(',').map(r => r.trim()) : ['user'];

      const payload = {
        id: userId,
        email: userEmail || `${userId}@replit.user`,
        roles: roles
      };

      if (!validateUser(payload)) {
        return res.status(500).json({ message: "Contract violation" });
      }

      return res.status(200).json(payload);
    } catch (error) {
      console.error("Error in /me endpoint:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Login endpoint - redirect to Replit Auth
  app.post("/login", (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!validateLoginReq(body)) {
      return res.status(400).json({ message: "Invalid credentials payload" });
    }

    // For Replit Auth, we return a redirect URL
    const payload = {
      accessToken: "replit-auth-required",
      refreshToken: "replit-auth-required",
      redirectUrl: "https://replit.com/auth/authenticate"
    };

    if (!validateLoginRes(payload)) {
      return res.status(500).json({ message: "Contract violation" });
    }
    return res.status(200).json(payload);
  });

  // Refresh endpoint - validate existing session
  app.post("/refresh", (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!validateRefreshReq(body)) {
      return res.status(400).json({ message: "Invalid refresh payload" });
    }

    // Check if user is still authenticated via Replit headers
    const userId = req.headers['x-replit-user-id'] as string;

    if (!userId) {
      return res.status(401).json({ message: "Session expired" });
    }

    const payload = { 
      accessToken: `replit-session-${userId}-${Date.now()}`
    };

    if (!validateRefreshRes(payload)) {
      return res.status(500).json({ message: "Contract violation" });
    }
    return res.status(200).json(payload);
  });

  // Roles endpoint - stubbed for contract compliance
  app.get("/roles", (_req: Request, res: Response) => {
    const payload = ["admin", "editor", "viewer"];
    if (!validateRolesRes(payload)) {
      return res.status(500).json({ message: "Contract violation" });
    }
    return res.status(200).json(payload);
  });

  // Policy check endpoint - check user permissions
  app.post("/policies/:id/check", replitAuthMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const body = req.body ?? {};
    if (!validatePolicyCheckReq(body)) {
      return res.status(400).json({ message: "Invalid policy check payload" });
    }

    const policyId = req.params.id;
    const { resource, action } = body;
    const user = req.user!;

    // Simple RBAC logic
    let allow = false;

    switch (policyId) {
      case 'admin-only':
        allow = user.roles.includes('admin');
        break;
      case 'user-read':
        allow = user.roles.includes('user') || user.roles.includes('admin');
        break;
      case 'user-write':
        allow = user.roles.includes('admin');
        break;
      case 'document-access':
        // Users can read their own documents, admins can read all
        if (action === 'read') {
          allow = user.roles.includes('user') || user.roles.includes('admin');
        } else if (action === 'write' || action === 'delete') {
          allow = user.roles.includes('admin');
        }
        break;
      default:
        allow = false;
    }

    const payload = { allow };
    if (!validatePolicyCheckRes(payload)) {
      return res.status(500).json({ message: "Contract violation" });
    }
    return res.status(200).json(payload);
  });
}