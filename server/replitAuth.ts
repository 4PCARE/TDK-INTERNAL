import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import crypto from "crypto";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true, // Allow table creation for robustness
    ttl: Math.floor(sessionTtl / 1000), // Convert to seconds for postgres store
    tableName: "sessions",
    pruneSessionInterval: 60 * 60, // Prune expired sessions every hour
  });
  
  // Handle store errors gracefully
  sessionStore.on('error', (err) => {
    console.error('Session store error:', err);
  });
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't save uninitialized sessions
    rolling: true, // Reset expiration on activity
    name: 'replit.sid', // Custom session name
    genid: function(req) {
      // Generate unique session IDs that include device fingerprinting
      const userAgent = req.headers['user-agent'] || '';
      const forwarded = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
      const deviceFingerprint = crypto
        .createHash('md5')
        .update(userAgent + forwarded + Date.now().toString())
        .digest('hex')
        .substring(0, 8);
      return crypto.randomBytes(16).toString('hex') + '_' + deviceFingerprint;
    },
    cookie: {
      httpOnly: true,
      secure: false, // Always false for Replit environment
      maxAge: sessionTtl,
      sameSite: 'lax'
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  const userInfo = {
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    loginMethod: "replit",
  };

  try {
    const upsertResult = await storage.upsertUser(userInfo);
    
    // If the upserted user has a different ID than what we expected,
    // update the claims to use the existing user's ID
    if (upsertResult.id !== userInfo.id) {
      console.log(`Replit auth: Using existing user ID ${upsertResult.id} instead of ${userInfo.id} for email ${userInfo.email}`);
      claims["sub"] = upsertResult.id; // Update claims for session consistency
    }
  } catch (error) {
    console.error("Error upserting Replit user:", error);
    throw error;
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => {
    // Store minimal user info in session to avoid conflicts
    const sessionUser = {
      ...(user as any),
      sessionId: Math.random().toString(36).substring(2, 15) // Unique session identifier
    };
    cb(null, sessionUser);
  });
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, async (err: any) => {
      // Log successful login for audit
      if (!err && req.user) {
        try {
          const user = req.user as any;
          const userId = user.claims?.sub;
          if (userId) {
            const { storage } = await import('./storage');
            await storage.createAuditLog({
              userId,
              action: 'login',
              resourceType: 'auth',
              ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
              userAgent: req.headers['user-agent'] || 'unknown',
              success: true,
              details: {
                email: user.claims?.email,
                loginMethod: 'replit-oauth'
              }
            });
          }
        } catch (auditError) {
          console.error("Failed to create audit log for login:", auditError);
        }
      }
      next(err);
    });
  });

  app.get("/api/logout", async (req, res) => {
    // Log logout for audit before session destruction
    if (req.user) {
      try {
        const user = req.user as any;
        const userId = user.claims?.sub;
        if (userId) {
          const { storage } = await import('./storage');
          await storage.createAuditLog({
            userId,
            action: 'logout',
            resourceType: 'auth',
            ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            success: true,
            details: {
              email: user.claims?.email,
              sessionDuration: Date.now() - (user.claims?.iat * 1000)
            }
          });
        }
      } catch (auditError) {
        console.error("Failed to create audit log for logout:", auditError);
      }
    }

    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  const sessionUser = (req.session as any)?.passport?.user;

  // Check both passport user and session fallback
  if (!req.isAuthenticated() && !sessionUser) {
    console.log("Replit auth failed - no authentication");
    return res.status(401).json({ message: "Unauthorized" });
  }

  const currentUser = user || sessionUser;
  if (!currentUser || !currentUser.expires_at) {
    console.log("Replit auth failed - no user or expiration");
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  
  // If token is still valid, proceed
  if (now <= currentUser.expires_at) {
    // Update session activity with device-specific touch
    if (req.session) {
      req.session.touch();
      // Store device info for session management
      (req.session as any).deviceInfo = {
        userAgent: req.headers['user-agent'],
        lastAccess: Date.now(),
        userId: currentUser.claims?.sub
      };
    }
    return next();
  }

  // Token expired - try to refresh
  const refreshToken = currentUser.refresh_token;
  if (!refreshToken) {
    console.log("Replit auth failed - token expired, no refresh token");
    // Clear invalid session
    if (req.session) {
      req.session.destroy(() => {});
    }
    return res.status(401).json({ message: "Token expired" });
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(currentUser, tokenResponse);
    
    // Update both req.user and session with device-specific data
    req.user = currentUser;
    if (req.session) {
      (req.session as any).passport = { user: currentUser };
      (req.session as any).deviceInfo = {
        userAgent: req.headers['user-agent'],
        lastAccess: Date.now(),
        userId: currentUser.claims?.sub,
        refreshed: true
      };
      req.session.save((err) => {
        if (err) {
          console.error("Failed to save refreshed session:", err);
        }
      });
    }
    
    console.log("Token refreshed successfully for user:", currentUser.claims?.email, "on device:", req.headers['user-agent']?.substring(0, 50));
    return next();
  } catch (error) {
    console.log("Replit auth failed - token refresh failed:", error);
    
    // Clear invalid session and force re-authentication
    if (req.session) {
      req.session.destroy(() => {});
    }
    
    // If it's an invalid_grant error, the refresh token is no longer valid
    if (error.error === 'invalid_grant') {
      console.log("Invalid grant - refresh token expired, forcing re-authentication");
      return res.status(401).json({ 
        message: "Session expired", 
        redirectToLogin: true 
      });
    }
    
    return res.status(401).json({ message: "Token refresh failed" });
  }
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { storage } = await import('./storage');
    const user = await storage.getUser(userId);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied. Admin role required." });
    }

    return next();
  } catch (error) {
    console.error("Error checking admin role:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
