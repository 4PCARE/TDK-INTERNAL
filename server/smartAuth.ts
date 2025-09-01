import { RequestHandler } from "express";
import { storage } from "./storage";
import { isAuthenticated as replitAuth } from "./replitAuth";
import { isMicrosoftAuthenticated } from "./microsoftAuth";

export const smartAuth: RequestHandler = async (req, res, next) => {
  // First, try to get user info from either auth method without failing
  let userId: string | undefined;
  let userEmail: string | undefined;
  let currentAuthMethod: string | undefined;

  // Check if user is authenticated with either method
  const user = req.user as any;
  const sessionUser = (req.session as any)?.passport?.user || (req.session as any)?.user;
  const currentUser = user || sessionUser;

  if (currentUser?.claims?.sub) {
    userId = currentUser.claims.sub;
    userEmail = currentUser.claims.email || currentUser.claims.upn || currentUser.claims.unique_name || currentUser.claims.preferred_username;
    
    // Detect current auth method based on claims structure
    if (currentUser.claims.upn || currentUser.claims.preferred_username) {
      currentAuthMethod = "microsoft";
    } else {
      currentAuthMethod = "replit";
    }
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
    // Get user's stored info from database
    let storedUser;
    try {
      storedUser = await storage.getUser(userId);
    } catch (error: any) {
      // Handle missing login_method column gracefully
      if (error.message && error.message.includes('column "login_method" does not exist')) {
        console.log("Smart auth - handling missing login_method column, proceeding with fallback");
        storedUser = null;
      } else {
        throw error;
      }
    }

    // If user not found by ID, try to find by email (cross-provider matching)
    if (!storedUser && userEmail) {
      console.log(`Smart auth: User not found by ID ${userId}, searching by email: ${userEmail}`);
      try {
        // Import users table to search by email
        const { users } = await import("@shared/schema");
        const { db } = await import("./db");
        const { eq } = await import("drizzle-orm");
        
        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, userEmail))
          .limit(1);

        if (existingUser) {
          console.log(`Smart auth: Found existing user by email ${userEmail}, merging accounts`);
          
          // Update the existing user's login method to allow both
          await db
            .update(users)
            .set({
              loginMethod: currentAuthMethod,
              updatedAt: new Date(),
            })
            .where(eq(users.id, existingUser.id));

          // Update the current session to use the existing user's ID
          userId = existingUser.id;
          if (currentUser?.claims) {
            currentUser.claims.sub = existingUser.id;
          }
          
          storedUser = { ...existingUser, loginMethod: currentAuthMethod };
          console.log(`Smart auth: Merged user accounts - ${userEmail} now uses ${currentAuthMethod} auth with ID ${existingUser.id}`);
        }
      } catch (emailSearchError) {
        console.error("Smart auth - error searching by email:", emailSearchError);
      }
    }

    if (!storedUser) {
      console.log("Smart auth - user not found in database, using current auth provider data");
    }

    const preferredMethod = storedUser?.loginMethod || currentAuthMethod || "replit";
    console.log(`Smart auth: User ${userId} (${userEmail}) uses ${preferredMethod} authentication, current session: ${currentAuthMethod}`);

    // Allow the current authentication method to proceed, regardless of stored preference
    // This enables cross-provider login while maintaining the user's identity
    if (currentAuthMethod === "microsoft") {
      return isMicrosoftAuthenticated(req, res, next);
    } else {
      return replitAuth(req, res, next);
    }

  } catch (error) {
    console.error("Smart auth error:", error);

    // Fallback: try both auth methods
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      replitAuth(req, res, next);
    });
  }
};