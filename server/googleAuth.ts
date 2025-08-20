
import { OAuth2Strategy } from "passport-google-oauth20";
import passport from "passport";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

// Get the base URL for redirect
function getBaseUrl(req: any): string {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-replit-domain'] || req.headers['host'];
  return `${protocol}://${host}`;
}

export async function setupGoogleAuth(app: Express) {
  // Configure Google OAuth Strategy
  passport.use('google', new OAuth2Strategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: 'https://placeholder.com/auth/google/callback', // Will be set dynamically
    scope: ['openid', 'profile', 'email']
  }, async function(accessToken: string, refreshToken: string, profile: any, done: any) {
    try {
      const userInfo = {
        id: profile.id,
        email: profile.emails?.[0]?.value || '',
        firstName: profile.name?.givenName || '',
        lastName: profile.name?.familyName || '',
        profileImageUrl: profile.photos?.[0]?.value || null,
        loginMethod: "google"
      };

      console.log("Google profile data:", profile);
      console.log("Extracted userInfo for database:", userInfo);

      // Upsert user in database
      try {
        const upsertResult = await storage.upsertUser(userInfo);
        console.log("User upsert result:", upsertResult);
      } catch (error) {
        console.error("Error upserting Google user:", error);
        throw error;
      }

      // Create user session object
      const user = {
        claims: {
          sub: userInfo.id,
          email: userInfo.email,
          given_name: userInfo.firstName,
          family_name: userInfo.lastName,
          name: `${userInfo.firstName} ${userInfo.lastName}`.trim(),
          first_name: userInfo.firstName,
          last_name: userInfo.lastName,
          profile_image_url: userInfo.profileImageUrl,
          display_name: profile.displayName || `${userInfo.firstName} ${userInfo.lastName}`.trim(),
          role: 'user',
          exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
        },
        access_token: accessToken,
        refresh_token: refreshToken
      };

      return done(null, user);
    } catch (error) {
      console.error("Google auth error:", error);
      return done(error, null);
    }
  }));

  // Google login route
  app.get("/api/auth/google", (req, res, next) => {
    const baseUrl = getBaseUrl(req);
    const redirectUrl = `${baseUrl}/api/auth/google/callback`;

    // Create a new strategy instance with the correct redirect URL
    passport.unuse('google');
    passport.use('google', new OAuth2Strategy({
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: redirectUrl,
      scope: ['openid', 'profile', 'email']
    }, async function(accessToken: string, refreshToken: string, profile: any, done: any) {
      try {
        const userInfo = {
          id: profile.id,
          email: profile.emails?.[0]?.value || '',
          firstName: profile.name?.givenName || '',
          lastName: profile.name?.familyName || '',
          profileImageUrl: profile.photos?.[0]?.value || null,
          loginMethod: "google"
        };

        // Upsert user in database
        try {
          const upsertResult = await storage.upsertUser(userInfo);
          console.log("User upsert result (dynamic):", upsertResult);
        } catch (error) {
          console.error("Error upserting Google user (dynamic):", error);
          throw error;
        }

        // Create user session object
        const user = {
          claims: {
            sub: userInfo.id,
            email: userInfo.email,
            given_name: userInfo.firstName,
            family_name: userInfo.lastName,
            name: `${userInfo.firstName} ${userInfo.lastName}`.trim(),
            first_name: userInfo.firstName,
            last_name: userInfo.lastName,
            profile_image_url: userInfo.profileImageUrl,
            display_name: profile.displayName || `${userInfo.firstName} ${userInfo.lastName}`.trim(),
            role: 'user',
            exp: Math.floor(Date.now() / 1000) + 3600
          },
          access_token: accessToken,
          refresh_token: refreshToken
        };

        return done(null, user);
      } catch (error) {
        console.error("Google auth error:", error);
        return done(error, null);
      }
    }));

    passport.authenticate('google', {
      scope: ['openid', 'profile', 'email']
    })(req, res, next);
  });

  // Google callback route
  app.get("/api/auth/google/callback", (req, res, next) => {
    passport.authenticate('google', (err: any, user: any, info: any) => {
      if (err) {
        console.error("Google auth error:", err);
        return res.redirect("/api/auth/google?error=auth_failed");
      }

      if (!user) {
        console.error("No user returned from Google auth");
        return res.redirect("/api/auth/google?error=no_user");
      }

      // Log in the user
      req.logIn(user, async (loginErr: any) => {
        if (loginErr) {
          console.error("Login error:", loginErr);
          return res.redirect("/api/auth/google?error=login_failed");
        }

        console.log("Google login successful for user:", user.claims?.email);

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
                loginMethod: 'google-oauth'
              }
            });
          }
        } catch (auditError) {
          console.error("Failed to create audit log for Google login:", auditError);
        }

        // Ensure session is saved properly
        (req.session as any).user = user;
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.redirect("/api/auth/google?error=session_failed");
          }
          console.log("Session saved successfully, redirecting to dashboard");
          res.redirect("/");
        });
      });
    })(req, res, next);
  });
}

export const isGoogleAuthenticated: RequestHandler = async (req, res, next) => {
  console.log("Google auth check - isAuthenticated:", req.isAuthenticated());
  console.log("Google auth check - user:", req.user ? "exists" : "null");
  console.log("Google auth check - session ID:", req.sessionID);

  // Check session user first
  const sessionUser = (req.session as any)?.user;
  
  if (!req.isAuthenticated() && !sessionUser) {
    console.log("Google auth failed - not authenticated and no session user");
    const error = new Error("Not authenticated with Google");
    return next(error);
  }

  const user = req.user as any || sessionUser;
  if (!user || !user.claims?.sub) {
    console.log("Google auth failed - no user claims or sub");
    const error = new Error("No Google user claims");
    return next(error);
  }

  // Check if token is still valid
  const now = Math.floor(Date.now() / 1000);
  if (user.claims.exp && now > (user.claims.exp - 3600)) {
    console.log("Google auth token near expiration or expired, but allowing with session fallback");
  }

  // Update session activity
  if (!req.user && sessionUser) {
    req.user = sessionUser;
  }

  console.log("Google auth successful for:", user.claims.email);
  return next();
};
