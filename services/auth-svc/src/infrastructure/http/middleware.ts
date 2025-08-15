
import type { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
  };
}

/**
 * Middleware to extract and validate Replit authentication headers
 */
export function replitAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.headers['x-replit-user-id'] as string;
    const userEmail = req.headers['x-replit-user-name'] as string;
    const userRoles = req.headers['x-replit-user-roles'] as string;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Parse roles, default to 'user' if none provided
    const roles = userRoles ? userRoles.split(',').map(r => r.trim()) : ['user'];

    // Attach user info to request
    req.user = {
      id: userId,
      email: userEmail || `${userId}@replit.user`,
      roles: roles
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ message: "Authentication error" });
  }
}

/**
 * Middleware to check if user has required role
 */
export function requireRole(role: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!req.user.roles.includes(role) && !req.user.roles.includes('admin')) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  };
}

/**
 * Middleware to check if user is admin
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return requireRole('admin')(req, res, next);
}
