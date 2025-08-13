
import type { Express } from "express";
import { setupAuth, isAuthenticated, isAdmin } from "../replitAuth";
import { setupMicrosoftAuth, isMicrosoftAuthenticated } from "../microsoftAuth";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { db } from "../db";
import { users, departments } from "@shared/schema";
import { eq } from "drizzle-orm";

export function registerAuthRoutes(app: Express) {
  // Setup authentication middleware
  setupAuth(app);
  setupMicrosoftAuth(app);

  // Get authentication methods available
  app.get("/api/auth/methods", async (req, res) => {
    res.json({
      methods: [
        {
          name: "replit",
          displayName: "Login with Replit",
          endpoint: "/api/login"
        },
        {
          name: "microsoft",
          displayName: "Login with Microsoft",
          endpoint: "/api/auth/microsoft"
        }
      ]
    });
  });

  // Auth routes - support both Replit and Microsoft authentication
  app.get("/api/auth/user", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email || req.user.claims.upn || req.user.claims.unique_name || req.user.claims.preferred_username;

      console.log("Getting user profile for:", { userId, userEmail });

      // Fetch user with department information
      const [userWithDept] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          role: users.role,
          departmentId: users.departmentId,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          departmentName: departments.name,
        })
        .from(users)
        .leftJoin(departments, eq(users.departmentId, departments.id))
        .where(eq(users.id, userId));

      if (!userWithDept) {
        console.log("User not found in database, returning user claims");
        // Return user info from claims if not found in database
        return res.json({
          id: userId,
          email: userEmail,
          firstName: req.user.claims.given_name || req.user.claims.first_name || '',
          lastName: req.user.claims.family_name || req.user.claims.last_name || '',
          profileImageUrl: req.user.claims.profile_image_url || null,
          role: 'user', // Default role
          departmentId: null,
          departmentName: null,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      res.json(userWithDept);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get user profile
  app.get("/api/user/profile", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email || req.user.claims.upn || req.user.claims.unique_name || req.user.claims.preferred_username;

      console.log("Getting user profile for:", { userId, userEmail });

      // Fetch user with department information
      const [userWithDept] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          role: users.role,
          departmentId: users.departmentId,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          departmentName: departments.name,
        })
        .from(users)
        .leftJoin(departments, eq(users.departmentId, departments.id))
        .where(eq(users.id, userId));

      if (!userWithDept) {
        console.log("User not found in database, returning user claims");
        // Return user info from claims if not found in database
        const firstName = req.user.claims.given_name || req.user.claims.first_name || '';
        const lastName = req.user.claims.family_name || req.user.claims.last_name || '';
        const fullName = req.user.claims.name || `${firstName} ${lastName}`.trim();
        const displayName = fullName ||
                         req.user.claims.display_name ||
                         req.user.claims.name ||
                         userEmail;

        return res.json({
          id: userId,
          email: userEmail,
          name: displayName,
          display_name: displayName,
          firstName: firstName,
          lastName: lastName,
          profileImageUrl: req.user.claims.profile_image_url || null,
          role: 'user',
          department: null,
          departmentId: null,
          preferences: {
            notifications: true,
            emailUpdates: true,
            theme: 'light'
          }
        });
      }

      // Construct display name from database fields first, then fallback to claims
      let displayName = `${userWithDept.firstName || ''} ${userWithDept.lastName || ''}`.trim();

      // If no name in database, try to get from claims and update database
      if (!displayName) {
        displayName = req.user.claims.display_name ||
                     req.user.claims.name ||
                     userWithDept.email;

        // If we have name from claims but not in database, extract and update
        if (req.user.claims.name && !userWithDept.firstName && !userWithDept.lastName) {
          const nameParts = req.user.claims.name.split(' ');
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';

          try {
            // Update the database with extracted name parts
            await db
              .update(users)
              .set({
                firstName: firstName,
                lastName: lastName,
                updatedAt: new Date(),
              })
              .where(eq(users.id, userWithDept.id));

            console.log(`Updated user ${userWithDept.id} with name: ${firstName} ${lastName}`);
          } catch (error) {
            console.error("Error updating user name:", error);
          }
        }
      }

      res.json({
        id: userWithDept.id,
        email: userWithDept.email,
        name: displayName,
        display_name: displayName,
        firstName: userWithDept.firstName,
        lastName: userWithDept.lastName,
        profileImageUrl: userWithDept.profileImageUrl,
        role: userWithDept.role,
        department: userWithDept.departmentName,
        departmentId: userWithDept.departmentId,
        preferences: {
          notifications: true,
          emailUpdates: true,
          theme: 'light'
        }
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  // Update user profile
  app.put("/api/user/profile", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, department, preferences } = req.body;

      // For now, just return success since we don't have a full user management system
      res.json({
        success: true,
        message: "Profile updated successfully",
        id: userId,
        name: name,
        department: department,
        preferences: preferences
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update user profile" });
    }
  });

  // Update user profile
  app.put("/api/users/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { firstName, lastName, departmentId } = req.body;

      const [updatedUser] = await db
        .update(users)
        .set({
          firstName,
          lastName,
          departmentId: departmentId || null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // User stats
  app.get("/api/stats", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Bootstrap admin endpoint - allows first user to become admin
  app.post("/api/bootstrap-admin", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Check if any admin exists
      const [existingAdmin] = await db
        .select()
        .from(users)
        .where(eq(users.role, 'admin'))
        .limit(1);

      if (existingAdmin) {
        return res.status(403).json({
          message: "Admin already exists. Contact existing admin for role assignment."
        });
      }

      // Make this user an admin
      const [updatedUser] = await db
        .update(users)
        .set({
          role: 'admin',
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      console.log(`Bootstrap admin: User ${userId} promoted to admin`);

      res.json({
        message: "Successfully promoted to admin",
        user: updatedUser
      });
    } catch (error) {
      console.error("Error bootstrapping admin:", error);
      res.status(500).json({ message: "Failed to bootstrap admin" });
    }
  });

  // Update user role
  app.put(
    "/api/admin/users/:userId/role",
    (req: any, res: any, next: any) => {
      // Try Microsoft auth first, then fallback to Replit auth
      isMicrosoftAuthenticated(req, res, (err: any) => {
        if (!err) {
          return next();
        }
        isAuthenticated(req, res, next);
      });
    },
    isAdmin,
    async (req: any, res) => {
      try {
        const { userId } = req.params;
        const { role } = req.body;
        const adminUserId = req.user.claims.sub;

        console.log(`Role update request from admin ${adminUserId}: userId=${userId}, newRole=${role}`);
        console.log("Request body:", req.body);

        // Validate required fields
        if (!userId) {
          console.log("Missing userId in request params");
          return res.status(400).json({
            message: "User ID is required",
          });
        }

        if (!role) {
          console.log("Missing role in request body");
          return res.status(400).json({
            message: "Role is required",
          });
        }

        // Validate role
        if (!["admin", "user", "viewer"].includes(role)) {
          console.log(`Invalid role provided: ${role}`);
          return res.status(400).json({
            message: "Invalid role. Must be 'admin', 'user', or 'viewer'",
          });
        }

        // Check if user exists
        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!existingUser) {
          console.log(`User not found: ${userId}`);
          return res.status(404).json({
            message: "User not found",
          });
        }

        console.log(`Updating user ${userId} role from ${existingUser.role} to ${role}`);

        // Update user role
        const [updatedUser] = await db
          .update(users)
          .set({
            role: role,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId))
          .returning();

        if (!updatedUser) {
          console.log(`Failed to update user ${userId}`);
          return res.status(500).json({
            message: "Failed to update user role",
          });
        }

        console.log(`Successfully updated user ${userId} role to ${role}`);

        // Log role change for audit
        try {
          await storage.createAuditLog({
            userId: adminUserId,
            action: "role_change",
            resourceType: "user",
            resourceId: userId,
            ipAddress: req.ip || req.connection.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
            details: {
              targetUser: userId,
              oldRole: existingUser.role,
              newRole: role,
            },
          });
        } catch (auditError) {
          console.error(
            "Failed to create audit log for role change:",
            auditError,
          );
        }

        res.json({
          message: "User role updated successfully",
          user: {
            id: updatedUser.id,
            role: updatedUser.role,
          }
        });
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).json({
          message: "Failed to update user role",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    },
  );
}
