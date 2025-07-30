import { OIDCStrategy } from "passport-azure-ad";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";

// Microsoft Azure AD configuration
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "05639017-c64a-4729-92a9-39270c910e2a";
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || "common";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || "Iai8Q~UmjjFo6Nm1C.uQa86GcoJL8qmI76Fg0dwm";

// Get the base URL for redirect
function getBaseUrl(req: any): string {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-replit-domain'] || req.headers['host'];
  return `${protocol}://${host}`;
}

export async function setupMicrosoftAuth(app: Express) {
  // Configure Microsoft OIDC Strategy
  passport.use('microsoft', new OIDCStrategy({
    identityMetadata: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientID: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    responseType: 'code',
    responseMode: 'query',
    redirectUrl: 'https://placeholder.com/auth/microsoft/callback', // Will be set dynamically
    allowHttpForRedirectUrl: false,
    validateIssuer: true,
    scope: ['openid', 'profile', 'email'],
    loggingLevel: 'info'
  }, async function(iss: string, sub: string, profile: any, accessToken: string, refreshToken: string, done: any) {
    try {
      // Extract user information from Microsoft profile
      const userInfo = {
        id: profile.oid || profile.sub, // Use oid (object ID) as unique identifier
        email: profile.preferred_username || profile.upn || profile.email,
        firstName: profile.given_name || profile.name?.split(' ')[0] || '',
        lastName: profile.family_name || profile.name?.split(' ').slice(1).join(' ') || '',
        profileImageUrl: null // Microsoft Graph API would be needed for profile picture
      };

      // Upsert user in database
      await storage.upsertUser(userInfo);

      // Create user session object
      const user = {
        claims: {
          sub: userInfo.id,
          email: userInfo.email,
          first_name: userInfo.firstName,
          last_name: userInfo.lastName,
          profile_image_url: userInfo.profileImageUrl,
          exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
        },
        access_token: accessToken,
        refresh_token: refreshToken
      };

      return done(null, user);
    } catch (error) {
      console.error("Microsoft auth error:", error);
      return done(error, null);
    }
  }));

  // Microsoft login route
  app.get("/api/auth/microsoft", (req, res, next) => {
    const baseUrl = getBaseUrl(req);

    // Dynamically set redirect URL
    const strategy = passport._strategy('microsoft') as any;
    if (strategy && strategy._options) {
      strategy._options.redirectUrl = `${baseUrl}/api/auth/microsoft/callback`;
    }

    passport.authenticate('microsoft', {
      prompt: 'select_account'
    })(req, res, next);
  });

  // Microsoft callback route
  app.get("/api/auth/microsoft/callback", (req, res, next) => {
    passport.authenticate('microsoft', {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/auth/microsoft?error=auth_failed",
    })(req, res, async (err: any) => {
      // Log successful login for audit
      if (!err && req.user) {
        try {
          const user = req.user as any;
          const userId = user.claims?.sub;
          if (userId) {
            await storage.createAuditLog({
              userId,
              action: 'login',
              resourceType: 'auth',
              ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
              userAgent: req.headers['user-agent'] || 'unknown',
              success: true,
              details: {
                email: user.claims?.email,
                loginMethod: 'microsoft-azure-ad'
              }
            });
          }
        } catch (auditError) {
          console.error("Failed to create audit log for Microsoft login:", auditError);
        }
      }
      next(err);
    });
  });
}

export const isMicrosoftAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Check if token is still valid
  const now = Math.floor(Date.now() / 1000);
  if (user.claims.exp && now > user.claims.exp) {
    return res.status(401).json({ message: "Token expired" });
  }

  return next();
};