
import { RequestHandler } from "express";
import { storage } from "./storage";
import { isAuthenticated as replitAuth } from "./replitAuth";
import { isMicrosoftAuthenticated } from "./microsoftAuth";

export const smartAuth: RequestHandler = async (req, res, next) => {
  // First, try to get user ID from either auth method without failing
  let userId: string | undefined;
  
  // Check if user is authenticated with either method
  const user = req.user as any;
  const sessionUser = (req.session as any)?.passport?.user;
  const currentUser = user || sessionUser;
  
  if (currentUser?.claims?.sub) {
    userId = currentUser.claims.sub;
  }
  
  if (!userId) {
    console.log("Smart auth: No user ID found, unauthorized");
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  try {
    // Get user's preferred login method from database
    const dbUser = await storage.getUser(userId);
    
    if (!dbUser) {
      console.log("Smart auth: User not found in database");
      return res.status(401).json({ message: "User not found" });
    }
    
    console.log(`Smart auth: User ${userId} uses ${dbUser.loginMethod} authentication`);
    
    // Route to the correct authentication middleware
    if (dbUser.loginMethod === "microsoft") {
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
