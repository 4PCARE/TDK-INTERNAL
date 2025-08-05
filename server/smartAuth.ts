import { RequestHandler } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replitAuth"; // Corrected import
import { isMicrosoftAuthenticated } from "./microsoftAuth";

export const smartAuth: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user as any;
    const sessionUser = (req.session as any)?.user;

    // Check if user has a stored login method preference
    let userId = user?.claims?.sub || sessionUser?.claims?.sub;
    if (userId) {
      try {
        const userRecord = await storage.getUser(userId);
        // Default to 'replit' if loginMethod is not explicitly set or user record doesn't exist
        const loginMethod = userRecord?.loginMethod || 'replit';
        console.log(`Smart auth: User ${userId} uses ${loginMethod} authentication`);

        if (loginMethod === 'microsoft') {
          // Try Microsoft authentication
          return isMicrosoftAuthenticated(req, res, (err: any) => {
            if (!err) {
              return next();
            }
            console.log("Microsoft auth failed, checking session fallback");
            // Fallback to session if Microsoft auth fails but session exists
            if (sessionUser?.claims?.sub) {
              req.user = sessionUser;
              return next();
            }
            return res.status(401).json({ message: "Unauthorized" });
          });
        } else {
          // Try Replit authentication
          return isAuthenticated(req, res, (err: any) => {
            if (!err) {
              return next();
            }
            console.log("Replit auth failed, trying Microsoft fallback");
            // Fallback to Microsoft auth
            return isMicrosoftAuthenticated(req, res, (microsoftErr: any) => {
              if (!microsoftErr) {
                return next();
              }
              return res.status(401).json({ message: "Unauthorized" });
            });
          });
        }
      } catch (dbError) {
        console.error("Error checking user login method:", dbError);
        // If there's a DB error, continue with fallback authentication logic below
      }
    }

    // If already authenticated via passport, proceed
    if (req.isAuthenticated() && user?.claims?.sub) {
      console.log(`Smart auth: User ${user.claims.sub} already authenticated via passport`);
      return next();
    }

    // If session user exists, use it
    if (sessionUser?.claims?.sub) {
      console.log(`Smart auth: User ${sessionUser.claims.sub} authenticated via session`);
      req.user = sessionUser;
      return next();
    }

    // Fallback: try Replit auth first, then Microsoft
    return isAuthenticated(req, res, (replitErr: any) => {
      if (!replitErr) {
        return next();
      }
      return isMicrosoftAuthenticated(req, res, (microsoftErr: any) => {
        if (!microsoftErr) {
          return next();
        }
        console.log("Smart auth: No valid authentication found");
        return res.status(401).json({ message: "Authentication required" });
      });
    });

  } catch (error) {
    console.error("Smart auth error:", error);
    return res.status(500).json({ message: "Authentication error" });
  }
};