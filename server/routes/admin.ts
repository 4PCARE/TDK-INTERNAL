
import type { Express } from "express";
import { isAuthenticated, isAdmin } from "../replitAuth";
import { isMicrosoftAuthenticated } from "../microsoftAuth";
import { storage } from "../storage";
import { db } from "../db";
import { 
  users, 
  departments, 
  documentUserPermissions, 
  documentDepartmentPermissions,
  auditLogs
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export function registerAdminRoutes(app: Express) {
  // Audit & Monitoring routes
  app.get("/api/audit/logs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Check if user is admin - only admins can view audit logs
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const {
        limit,
        offset,
        action,
        resourceType,
        filterUserId,
        dateFrom,
        dateTo,
      } = req.query;

      const options: any = {};
      if (limit) options.limit = parseInt(limit);
      if (offset) options.offset = parseInt(offset);
      if (action && action !== "all") options.action = action;
      if (resourceType && resourceType !== "all")
        options.resourceType = resourceType;
      if (filterUserId && filterUserId !== "all") options.userId = filterUserId;
      if (dateFrom) options.dateFrom = new Date(dateFrom);
      if (dateTo) options.dateTo = new Date(dateTo);

      const logs = await storage.getAuditLogs(userId, options);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/audit/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Check if user is admin - only admins can view audit stats
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const stats = await storage.getAuditStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching audit stats:", error);
      res.status(500).json({ message: "Failed to fetch audit stats" });
    }
  });

  // Export audit logs as CSV
  app.get("/api/audit/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Check if user is admin - only admins can export audit logs
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { action, resourceType, filterUserId, dateFrom, dateTo } =
        req.query;

      const options: any = {
        limit: 10000, // Export up to 10,000 records
        offset: 0,
      };
      if (action && action !== "all") options.action = action;
      if (resourceType && resourceType !== "all")
        options.resourceType = resourceType;
      if (filterUserId && filterUserId !== "all") options.userId = filterUserId;
      if (dateFrom) options.dateFrom = new Date(dateFrom);
      if (dateTo) options.dateTo = new Date(dateTo);

      const auditLogs = await storage.getAuditLogs(userId, options);

      // Create CSV content
      const csvHeader =
        "ID,User Email,Action,Resource Type,Resource ID,Success,IP Address,User Agent,Created At,Details\n";
      const csvRows = auditLogs
        .map((log: any) => {
          const userEmail = log.userEmail || "Unknown";
          const details = log.details
            ? JSON.stringify(log.details).replace(/"/g, '""')
            : "";
          const createdAt = new Date(log.createdAt).toISOString();

          return `${log.id},"${userEmail}","${log.action}","${log.resourceType}","${log.resourceId || ""}",${log.success},"${log.ipAddress}","${log.userAgent}","${createdAt}","${details}"`;
        })
        .join("\n");

      const csvContent = csvHeader + csvRows;

      // Set headers for file download
      const filename = `audit_logs_${new Date().toISOString().split("T")[0]}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting audit logs:", error);
      res.status(500).json({ message: "Failed to export audit logs" });
    }
  });

  // Get filter options for audit logs
  app.get("/api/audit/filters", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Check if user is admin - only admins can access audit filters
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const actions = await db
        .selectDistinct({ action: auditLogs.action })
        .from(auditLogs)
        .orderBy(auditLogs.action);

      const resourceTypes = await db
        .selectDistinct({ resourceType: auditLogs.resourceType })
        .from(auditLogs)
        .orderBy(auditLogs.resourceType);

      const usersList = await db
        .select({
          id: users.id,
          email: users.email,
        })
        .from(users)
        .orderBy(users.email);

      res.json({
        actions: actions.map((a) => a.action),
        resourceTypes: resourceTypes.map((r) => r.resourceType),
        users: usersList,
      });
    } catch (error) {
      console.error("Error fetching audit filters:", error);
      res.status(500).json({ message: "Failed to fetch audit filters" });
    }
  });

  // Department management routes
  app.get("/api/departments", isAuthenticated, async (req: any, res) => {
    try {
      const allDepartments = await db
        .select()
        .from(departments)
        .orderBy(departments.name);
      res.json(allDepartments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

  app.post("/api/departments", isAuthenticated, async (req: any, res) => {
    try {
      const { name, description } = req.body;

      const [department] = await db
        .insert(departments)
        .values({ name, description })
        .returning();

      res.json(department);
    } catch (error) {
      console.error("Error creating department:", error);
      res.status(500).json({ message: "Failed to create department" });
    }
  });

  // Admin User Management Routes
  app.get(
    "/api/admin/users",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const allUsers = await db
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
          })
          .from(users)
          .leftJoin(departments, eq(users.departmentId, departments.id));

        res.json(allUsers);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Failed to fetch users" });
      }
    },
  );

  app.get(
    "/api/admin/departments",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const allDepartments = await db.select().from(departments);
        res.json(allDepartments);
      } catch (error) {
        console.error("Error fetching departments:", error);
        res.status(500).json({ message: "Failed to fetch departments" });
      }
    },
  );

  app.post("/api/admin/departments", isAuthenticated, async (req: any, res) => {
    try {
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Department name is required" });
      }

      const [department] = await db
        .insert(departments)
        .values({
          name,
          description,
        })
        .returning();

      res.status(201).json(department);
    } catch (error) {
      console.error("Error creating department:", error);
      res.status(500).json({ message: "Failed to create department" });
    }
  });

  app.put(
    "/api/admin/users/:userId/department",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { userId } = req.params;
        const { departmentId } = req.body;

        await db
          .update(users)
          .set({
            departmentId: departmentId || null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        res.json({ message: "User department updated successfully" });
      } catch (error) {
        console.error("Error updating user department:", error);
        res.status(500).json({ message: "Failed to update user department" });
      }
    },
  );

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

  app.get(
    "/api/admin/permissions",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const userPermissions = await db
          .select({
            id: documentUserPermissions.id,
            documentId: documentUserPermissions.documentId,
            userId: documentUserPermissions.userId,
            permissionType: documentUserPermissions.permissionType,
            grantedAt: documentUserPermissions.grantedAt,
          })
          .from(documentUserPermissions);

        const departmentPermissions = await db
          .select({
            id: documentDepartmentPermissions.id,
            documentId: documentDepartmentPermissions.documentId,
            departmentId: documentDepartmentPermissions.departmentId,
            permissionType: documentDepartmentPermissions.permissionType,
            grantedAt: documentDepartmentPermissions.grantedAt,
          })
          .from(documentDepartmentPermissions);

        const allPermissions = [
          ...userPermissions.map((p) => ({ ...p, type: "user" })),
          ...departmentPermissions.map((p) => ({ ...p, type: "department" })),
        ];

        res.json(allPermissions);
      } catch (error) {
        console.error("Error fetching permissions:", error);
        res.status(500).json({ message: "Failed to fetch permissions" });
      }
    },
  );

  app.post("/api/admin/permissions", isAuthenticated, async (req: any, res) => {
    try {
      const {
        documentId,
        userId,
        departmentId,
        permission = "read",
      } = req.body;

      if (!documentId) {
        return res.status(400).json({ message: "Document ID is required" });
      }

      if (!userId && !departmentId) {
        return res
          .status(400)
          .json({ message: "Either user ID or department ID is required" });
      }

      let result;
      if (userId) {
        // Check if permission already exists
        const existing = await db
          .select()
          .from(documentUserPermissions)
          .where(
            and(
              eq(documentUserPermissions.documentId, parseInt(documentId)),
              eq(documentUserPermissions.userId, userId),
            ),
          );

        if (existing.length > 0) {
          return res
            .status(400)
            .json({ message: "Permission already exists for this user" });
        }

        [result] = await db
          .insert(documentUserPermissions)
          .values({
            documentId: parseInt(documentId),
            userId,
            permissionType: permission,
          })
          .returning();
      } else {
        // Check if permission already exists
        const existing = await db
          .select()
          .from(documentDepartmentPermissions)
          .where(
            and(
              eq(
                documentDepartmentPermissions.documentId,
                parseInt(documentId),
              ),
              eq(
                documentDepartmentPermissions.departmentId,
                parseInt(departmentId),
              ),
            ),
          );

        if (existing.length > 0) {
          return res
            .status(400)
            .json({ message: "Permission already exists for this department" });
        }

        [result] = await db
          .insert(documentDepartmentPermissions)
          .values({
            documentId: parseInt(documentId),
            departmentId: parseInt(departmentId),
            permissionType: permission,
          })
          .returning();
      }

      res.status(201).json(result);
    } catch (error) {
      console.error("Error creating permission:", error);
      res.status(500).json({ message: "Failed to create permission" });
    }
  });

  app.delete(
    "/api/admin/permissions/:permissionId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { permissionId } = req.params;
        const { type } = req.query;

        if (type === "department") {
          await db
            .delete(documentDepartmentPermissions)
            .where(
              eq(documentDepartmentPermissions.id, parseInt(permissionId)),
            );
        } else {
          await db
            .delete(documentUserPermissions)
            .where(eq(documentUserPermissions.id, parseInt(permissionId)));
        }

        res.json({ message: "Permission deleted successfully" });
      } catch (error) {
        console.error("Error deleting permission:", error);
        res.status(500).json({ message: "Failed to delete permission" });
      }
    },
  );

  app.get("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          departmentId: users.departmentId,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .leftJoin(departments, eq(users.departmentId, departments.id));

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.put(
    "/api/users/:id/department",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.params.id;
        const { departmentId } = req.body;

        const [updatedUser] = await db
          .update(users)
          .set({ departmentId, updatedAt: new Date() })
          .where(eq(users.id, userId))
          .returning();

        res.json(updatedUser);
      } catch (error) {
        console.error("Error updating user department:", error);
        res.status(500).json({ message: "Failed to update user department" });
      }
    },
  );
}
