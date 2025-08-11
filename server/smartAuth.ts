import { RequestHandler } from "express";
import { storage } from "./storage";
import { isAuthenticated as replitAuth } from "./replitAuth";
import { isMicrosoftAuthenticated } from "./microsoftAuth";

export const smartAuth: RequestHandler = async (req, res, next) => {
  // First, try to get user ID from either auth method without failing
  let userId: string | undefined;

  // Check if user is authenticated with either method
  const user = req.user as any;
  const sessionUser = (req.session as any)?.passport?.user || (req.session as any)?.user;
  const currentUser = user || sessionUser;

  console.log("Smart auth debug:", {
    sessionID: req.sessionID,
    hasUser: !!user,
    hasSessionUser: !!sessionUser,
    sessionPassport: !!(req.session as any)?.passport,
    userClaims: user?.claims?.sub,
    sessionUserClaims: sessionUser?.claims?.sub
  });

  if (currentUser?.claims?.sub) {
    userId = currentUser.claims.sub;
  }

  if (!userId) {
    console.log("Smart auth: No user ID found, unauthorized - Session ID:", req.sessionID);
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Log device info for debugging multi-device issues
  const deviceInfo = (req.session as any)?.deviceInfo;
  if (deviceInfo) {
    console.log(`Smart auth: Device session for user ${userId}:`, {
      lastAccess: new Date(deviceInfo.lastAccess).toISOString(),
      userAgent: deviceInfo.userAgent?.substring(0, 50),
      authMethod: deviceInfo.authMethod
    });
  }

  try {
    // Get user's preferred login method from database
    let user;
    try {
      user = await storage.getUser(userId);
    } catch (error: any) {
      // Handle missing login_method column gracefully
      if (error.message && error.message.includes('column "login_method" does not exist')) {
        console.log("Smart auth - handling missing login_method column, proceeding with fallback");
        user = null; // Will fall back to auth provider data
      } else {
        throw error;
      }
    }

    if (!user) {
      console.log("Smart auth - user not found in database or column missing, using auth provider data");
    }

    console.log(`Smart auth: User ${userId} uses ${user?.loginMethod} authentication`);

    // Route to the correct authentication middleware
    if (user?.loginMethod === "microsoft") {
      return isMicrosoftAuthenticated(req, res, next);
    } else {
      return replitAuth(req, res, next);
    }

  } catch (error) {
    console.error("Smart auth error:", error);

    // Fallback: try Microsoft first, then Replit
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      replitAuth(req, res, next);
    });
  }
};