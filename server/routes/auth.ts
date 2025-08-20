
import type { Express } from "express";
import { requireAuth, requireAdmin, setupAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { users, departments } from "@shared/schema";
import { eq } from "drizzle-orm";

export function registerAuthRoutes(app: Express) {
  // Setup authentication middleware
  setupAuth(app);

  // Get authentication methods available
  app.get("/api/auth/methods", async (req, res) => {
    res.json({
      methods: [
        {
          name: "replit",
          displayName: "Login with Replit",
          endpoint: "/api/login"
        }
      ]
    });
  });

  // Get current authenticated user
  app.get("/api/auth/user", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const userEmail = req.user?.email;

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
        console.log("User not found in database, returning user from session");
        return res.json({
          id: userId,
          email: userEmail,
          firstName: req.user.name?.split(' ')[0] || '',
          lastName: req.user.name?.split(' ').slice(1).join(' ') || '',
          profileImageUrl: null,
          role: 'user',
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
  app.get("/api/user/profile", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const userEmail = req.user?.email;

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
        console.log("User not found in database, returning user from session");
        const displayName = req.user.name || userEmail;
        const firstName = req.user.name?.split(' ')[0] || '';
        const lastName = req.user.name?.split(' ').slice(1).join(' ') || '';

        return res.json({
          id: userId,
          email: userEmail,
          name: displayName,
          display_name: displayName,
          firstName: firstName,
          lastName: lastName,
          profileImageUrl: null,
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

      const displayName = `${userWithDept.firstName || ''} ${userWithDept.lastName || ''}`.trim() || userWithDept.email;

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
  app.put("/api/user/profile", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { name, department, preferences } = req.body;

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

  // Update user details
  app.put("/api/users/:id", requireAuth, async (req: any, res) => {
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
  app.get("/api/stats", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Bootstrap admin endpoint
  app.post("/api/bootstrap-admin", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;

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

  // Update user role (admin only)
  app.put("/api/admin/users/:userId/role", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const adminUserId = req.user?.id;

      console.log(`Role update request from admin ${adminUserId}: userId=${userId}, newRole=${role}`);

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      if (!role || !["admin", "user", "viewer"].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be 'admin', 'user', or 'viewer'" });
      }

      // Check if user exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user role
      const [updatedUser] = await db
        .update(users)
        .set({
          role: role,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

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
        console.error("Failed to create audit log for role change:", auditError);
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
  });
}
