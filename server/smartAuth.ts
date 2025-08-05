import { RequestHandler } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replitAuth"; // Corrected import
import { isMicrosoftAuthenticated } from "./microsoftAuth";

// Cache for recent auth checks to reduce repetitive calls
const authCheckCache = new Map<string, number>();

// Clean up old cache entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, timestamp] of authCheckCache.entries()) {
    if (now - timestamp > 600000) { // 10 minutes
      authCheckCache.delete(sessionId);
    }
  }
}, 600000);

export const smartAuth: RequestHandler = async (req, res, next) => {
  try {
    // Skip auth check for rapid consecutive requests from same session
    const sessionId = req.sessionID;
    const now = Date.now();
    const lastCheck = authCheckCache.get(sessionId);

    if (lastCheck && (now - lastCheck) < 5000) { // 5 second cache
      return next();
    }

    console.log(`Smart auth: Checking authentication for ${req.method} ${req.path}`);

    // Check if user is authenticated with Replit
    if (req.isAuthenticated() && req.user) {
      const user = req.user as any;
      if (user.claims?.sub) {
        console.log(`Smart auth: User ${user.claims.sub} uses replit authentication`);
        authCheckCache.set(sessionId, now);
        return next();
      }
    }

    // Check session for Replit user as fallback
    const sessionUser = (req.session as any)?.user;
    if (sessionUser && sessionUser.claims?.sub) {
      console.log(`Smart auth: User ${sessionUser.claims.sub} uses replit session authentication`);
      req.user = sessionUser; // Set user on request
      authCheckCache.set(sessionId, now);
      return next();
    }

    // Only check Microsoft authentication if Replit auth failed
    try {
      await new Promise<void>((resolve, reject) => {
        isMicrosoftAuthenticated(req, res, (err) => {
          if (err) reject(err);
          else {
            authCheckCache.set(sessionId, now);
            resolve();
          }
        });
      });
      return next();
    } catch (microsoftError) {
      console.log("Smart auth: Neither Replit nor Microsoft authentication succeeded");
      return res.status(401).json({ 
        message: "Authentication required", 
        error: "Not authenticated with either Replit or Microsoft" 
      });
    }
  } catch (error) {
    console.error("Smart auth error:", error);
    return res.status(500).json({ 
      message: "Authentication error", 
      error: error.message 
    });
  }
};