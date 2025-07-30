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
  // Configure session serialization for Microsoft auth
  passport.serializeUser((user: any, done: any) => {
    console.log("Serializing user for session:", user.claims?.email);
    done(null, user);
  });

  passport.deserializeUser((user: any, done: any) => {
    console.log("Deserializing user from session:", user.claims?.email);
    done(null, user);
  });

  // Configure Microsoft OIDC Strategy
  passport.use('microsoft', new OIDCStrategy({
    identityMetadata: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientID: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    responseType: 'code',
    responseMode: 'query',
    redirectUrl: 'https://placeholder.com/auth/microsoft/callback', // Will be set dynamically
    allowHttpForRedirectUrl: false,
    validateIssuer: false, // Disable issuer validation for common endpoint
    passReqToCallback: false,
    scope: ['openid', 'profile', 'email'],
    loggingLevel: 'info'
  }, async function(iss: string, sub: string, profile: any, accessToken: string, refreshToken: string, done: any) {
    try {
      // Extract user information from Microsoft profile
      const fullName = typeof profile.name === 'string' ? profile.name : '';
      const nameParts = fullName.split(' ');

      // Extract email from multiple possible sources
      const email = profile.upn || 
                   profile.preferred_username || 
                   profile.unique_name || 
                   profile.email ||
                   profile._json?.upn ||
                   profile._json?.preferred_username ||
                   profile._json?.email;

      const userInfo = {
        id: profile.oid || profile.sub, // Use oid (object ID) as unique identifier
        email: email,
        firstName: profile.given_name || nameParts[0] || '',
        lastName: profile.family_name || nameParts.slice(1).join(' ') || '',
        profileImageUrl: null // Microsoft Graph API would be needed for profile picture
      };

      console.log("Microsoft profile data:", {
        oid: profile.oid,
        sub: profile.sub,
        email: profile.email,
        preferred_username: profile.preferred_username,
        upn: profile.upn,
        given_name: profile.given_name,
        family_name: profile.family_name,
        name: profile.name,
        _json: profile._json ? {
          upn: profile._json.upn,
          email: profile._json.email,
          preferred_username: profile._json.preferred_username,
          name: profile._json.name
        } : null
      });

      console.log("Extracted userInfo for database:", userInfo);

      // Upsert user in database
      try {
        const upsertResult = await storage.upsertUser(userInfo);
        console.log("User upsert result:", upsertResult);
      } catch (error) {
        console.error("Error upserting Microsoft user:", error);
        throw error;
      }

      // Create user session object
      const user = {
        claims: {
          sub: userInfo.id,
          email: userInfo.email,
          upn: profile.upn || profile._json?.upn || userInfo.email,
          preferred_username: profile.preferred_username || profile._json?.preferred_username || userInfo.email,
          unique_name: profile.unique_name || profile._json?.unique_name || userInfo.email,
          given_name: userInfo.firstName,
          family_name: userInfo.lastName,
          name: profile.name || profile._json?.name || `${userInfo.firstName} ${userInfo.lastName}`.trim(),
          first_name: userInfo.firstName,
          last_name: userInfo.lastName,
          profile_image_url: userInfo.profileImageUrl,
          display_name: profile.name || profile._json?.name || `${userInfo.firstName} ${userInfo.lastName}`.trim(),
          role: 'user', // Default role, can be enhanced later with Azure AD roles
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
    const redirectUrl = `${baseUrl}/api/auth/microsoft/callback`;

    // Create a new strategy instance with the correct redirect URL
    const strategyConfig = {
      identityMetadata: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/v2.0/.well-known/openid-configuration`,
      clientID: MICROSOFT_CLIENT_ID,
      clientSecret: MICROSOFT_CLIENT_SECRET,
      responseType: 'code',
      responseMode: 'query',
      redirectUrl: redirectUrl,
      allowHttpForRedirectUrl: false,
      validateIssuer: false,
      passReqToCallback: false,
      scope: ['openid', 'profile', 'email'],
      loggingLevel: 'info'
    };

    // Remove existing strategy and add new one with correct redirect URL
    passport.unuse('microsoft');
    passport.use('microsoft', new OIDCStrategy(strategyConfig, async function(iss: string, sub: string, profile: any, accessToken: string, refreshToken: string, done: any) {
      try {
        // Extract user information from Microsoft profile
        const fullName = typeof profile.name === 'string' ? profile.name : '';
        const nameParts = fullName.split(' ');

        // Extract email from multiple possible sources
        const email = profile.upn || 
                     profile.preferred_username || 
                     profile.unique_name || 
                     profile.email ||
                     profile._json?.upn ||
                     profile._json?.preferred_username ||
                     profile._json?.email;

        const userInfo = {
          id: profile.oid || profile.sub,
          email: email,
          firstName: profile.given_name || nameParts[0] || '',
          lastName: profile.family_name || nameParts.slice(1).join(' ') || '',
          profileImageUrl: null
        };

        console.log("Microsoft profile data (dynamic):", {
          oid: profile.oid,
          sub: profile.sub,
          email: profile.email,
          preferred_username: profile.preferred_username,
          upn: profile.upn,
          given_name: profile.given_name,
          family_name: profile.family_name,
          name: profile.name,
          _json: profile._json ? {
            upn: profile._json.upn,
            email: profile._json.email,
            preferred_username: profile._json.preferred_username,
            name: profile._json.name
          } : null
        });

        console.log("Extracted userInfo for database (dynamic):", userInfo);

        // Upsert user in database
        try {
          const upsertResult = await storage.upsertUser(userInfo);
          console.log("User upsert result (dynamic):", upsertResult);
        } catch (error) {
          console.error("Error upserting Microsoft user (dynamic):", error);
          throw error;
        }

        // Create user session object
        const user = {
          claims: {
            sub: userInfo.id,
            email: userInfo.email,
            upn: profile.upn || profile._json?.upn || userInfo.email,
            preferred_username: profile.preferred_username || profile._json?.preferred_username || userInfo.email,
            unique_name: profile.unique_name || profile._json?.unique_name || userInfo.email,
            given_name: userInfo.firstName,
            family_name: userInfo.lastName,
            name: profile.name || profile._json?.name || `${userInfo.firstName} ${userInfo.lastName}`.trim(),
            first_name: userInfo.firstName,
            last_name: userInfo.lastName,
            profile_image_url: userInfo.profileImageUrl,
            display_name: profile.name || profile._json?.name || `${userInfo.firstName} ${userInfo.lastName}`.trim(),
            role: 'user', // Default role, can be enhanced later with Azure AD roles
            exp: Math.floor(Date.now() / 1000) + 3600
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

    passport.authenticate('microsoft', {
      prompt: 'select_account'
    })(req, res, next);
  });

  // Microsoft callback route
  app.get("/api/auth/microsoft/callback", (req, res, next) => {
    passport.authenticate('microsoft', (err: any, user: any, info: any) => {
      if (err) {
        console.error("Microsoft auth error:", err);
        return res.redirect("/api/auth/microsoft?error=auth_failed");
      }

      if (!user) {
        console.error("No user returned from Microsoft auth");
        return res.redirect("/api/auth/microsoft?error=no_user");
      }

      // Log in the user
      req.logIn(user, async (loginErr: any) => {
        if (loginErr) {
          console.error("Login error:", loginErr);
          return res.redirect("/api/auth/microsoft?error=login_failed");
        }

        console.log("Microsoft login successful for user:", user.claims?.email);

        // Log successful login for audit
        try {
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

        // Save session before redirecting
        req.session.save((err: any) => {
          if (err) {
            console.error("Session save error:", err);
            return res.redirect("/api/auth/microsoft?error=session_failed");
          }

          console.log("Session saved successfully, redirecting to dashboard");
          // Redirect to dashboard after successful login
          res.redirect("/");
        });
      });
    })(req, res, next);
  });
}

export const isMicrosoftAuthenticated: RequestHandler = async (req, res, next) => {
  console.log("Microsoft auth check - isAuthenticated:", req.isAuthenticated());
  console.log("Microsoft auth check - user:", req.user ? "exists" : "null");
  console.log("Microsoft auth check - session:", req.session);

  if (!req.isAuthenticated() || !req.user) {
    console.log("Microsoft auth failed - not authenticated or no user");
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;
  if (!user.claims?.sub) {
    console.log("Microsoft auth failed - no user claims or sub");
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Check if token is still valid
  const now = Math.floor(Date.now() / 1000);
  if (user.claims.exp && now > user.claims.exp) {
    console.log("Microsoft auth failed - token expired");
    return res.status(401).json({ message: "Token expired" });
  }

  console.log("Microsoft auth successful for:", user.claims.email);
  return next();
};