import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
    authenticated: boolean;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userId = req.headers['x-replit-user-id'] as string;
  const userName = req.headers['x-replit-user-name'] as string;
  const userEmail = req.headers['x-replit-user-email'] as string;

  if (!userId || !userName) {
    return res.status(401).json({ 
      message: "Authentication required",
      authenticated: false 
    });
  }

  req.user = {
    id: userId,
    name: userName,
    email: userEmail || `${userName}@replit.com`,
    authenticated: true
  };

  next();
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userId = req.headers['x-replit-user-id'] as string;
  const userName = req.headers['x-replit-user-name'] as string;
  const userEmail = req.headers['x-replit-user-email'] as string;

  if (userId && userName) {
    req.user = {
      id: userId,
      name: userName,
      email: userEmail || `${userName}@replit.com`,
      authenticated: true
    };
  }

  next();
}