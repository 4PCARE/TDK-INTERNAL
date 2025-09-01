import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import OpenAI from "openai";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { setupMicrosoftAuth, isMicrosoftAuthenticated } from "./microsoftAuth";
import { smartAuth } from "./smartAuth";
import { registerHrApiRoutes } from "./hrApi";
import { handleLineWebhook, sendLineImageMessage } from "./lineOaWebhook";
import { pool, db } from "./db";
import { agentChatbots } from "@shared/schema";
import { eq } from "drizzle-orm";
import { GuardrailsService } from "./services/guardrails";
import { registerAgentRoutes } from "./routes/agentRoutes";
import { registerDocumentRoutes } from "./routes/documentRoutes";
import { registerWidgetRoutes } from "./routes/widgetRoutes";
import { registerAnalyticRoutes } from "./routes/analyticRoutes";
import { registerChatBotRoutes } from "./routes/chatBotRoutes";

// Initialize OpenAI for CSAT analysis
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });



import { db, pool } from "./db";
import { eq, sql, and, gte, getTableColumns } from "drizzle-orm";
import {
  insertCategorySchema,
  insertDocumentSchema,
  insertChatConversationSchema,
  insertChatMessageSchema,
  insertDataConnectionSchema,
  updateDataConnectionSchema,
  type Document as DocType,
  users,
  departments,
  documentUserPermissions,
  documentDepartmentPermissions,
  documents,
  categories,
  auditLogs,
  socialIntegrations,
  chatWidgets,
  agentChatbots,
  agentChatbotDocuments,
  documentVectors,
  chatHistory,
  widgetChatMessages,
  hrEmployees,
  llm_config,
  chat_history,
} from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import * as fsSync from "fs";
import { processDocument, generateChatResponse } from "./services/openai";
import { documentProcessor } from "./services/documentProcessor";
import { vectorService } from "./services/vectorService";
import { semanticSearchServiceV2 } from "./services/semanticSearchV2";

// File upload configuration
const uploadDir = path.join(process.cwd(), "uploads");

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
};

const storage_multer = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const upload = multer({
  storage: storage_multer,
  fileFilter: (req, file, cb) => {
    // Ensure proper UTF-8 encoding for filename
    if (file.originalname) {
      file.originalname = Buffer.from(file.originalname, "latin1").toString(
        "utf8",
      );
    }

    const allowedMimes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
      "text/plain",
      "text/csv",
      "application/json",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Supported: PDF, DOCX, XLSX, PPTX, TXT, CSV, JSON, and image files.",
        ),
      );
    }
  },
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

// Using semanticSearchServiceV2 from import

export async function registerRoutes(app: Express): Server {
  // Auth middleware
  await setupAuth(app);
  await setupMicrosoftAuth(app);

  // Register extracted route modules
  registerAgentRoutes(app);
  registerDocumentRoutes(app);
  registerWidgetRoutes(app);
  registerAnalyticRoutes(app);
  registerChatBotRoutes(app);

  // Serve uploaded files and Line images
  const uploadsPath = path.join(process.cwd(), 'uploads');
  const lineImagesPath = path.join(uploadsPath, 'line-images');

  // Ensure directories exist
  if (!fsSync.existsSync(uploadsPath)) {
    fsSync.mkdirSync(uploadsPath, { recursive: true });
  }
  if (!fsSync.existsSync(lineImagesPath)) {
    fsSync.mkdirSync(lineImagesPath, { recursive: true });
  }

  app.use('/uploads', express.static(uploadsPath));

  // Register public HR API routes (no authentication required)
  registerHrApiRoutes(app);

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

      // Get distinct values from audit logs
      const { auditLogs, users } = await import("@shared/schema");

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
      const { users, departments } = await import("@shared/schema");

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
      const { users, departments } = await import("@shared/schema");

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
      const { users } = await import("@shared/schema");

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

  // Category routes
  app.get("/api/categories", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const categories = await storage.getCategories(userId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const categoryData = insertCategorySchema.parse({ ...req.body, userId });
      const category = await storage.createCategory(categoryData);
      res.json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.put("/api/categories/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const categoryData = insertCategorySchema.partial().parse(req.body);
      const category = await storage.updateCategory(id, categoryData);
      res.json(category);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete("/api/categories/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      await storage.deleteCategory(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // Category statistics endpoint
  app.get("/api/stats/categories", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { documents } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      const categoryStats = await db
        .select({
          category: documents.aiCategory,
          count: sql<number>`count(${documents.id})`,
        })
        .from(documents)
        .where(eq(documents.userId, userId))
        .groupBy(documents.aiCategory)
        .orderBy(sql`count(${documents.id}) desc`);

      res.json(categoryStats);
    } catch (error) {
      console.error("Error fetching category stats:", error);
      res.status(500).json({ message: "Failed to fetch category stats" });
    }
  });

  // Tag statistics endpoint
  app.get("/api/stats/tags", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { documents } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      // Get all documents with their tags
      const documentsWithTags = await db
        .select({
          tags: documents.tags,
        })
        .from(documents)
        .where(eq(documents.userId, userId));

      // Count occurrences of each tag
      const tagCounts: { [key: string]: number } = {};

      documentsWithTags.forEach((doc) => {
        if (doc.tags && Array.isArray(doc.tags)) {
          doc.tags.forEach((tag: string) => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });

      // Convert to array and sort by count
      const tagStats = Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);

      res.json(tagStats);
    } catch (error) {
      console.error("Error fetching tag stats:", error);
      res.status(500).json({ message: "Failed to fetch tag stats" });
    }
  });

  // Department management routes
  app.get("/api/departments", isAuthenticated, async (req: any, res) => {
    try {
      const { departments } = await import("@shared/schema");
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
      const { departments } = await import("@shared/schema");
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

  // User management routes
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
          createdBy: req.user.claims.sub,
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

  // Bootstrap admin endpoint - allows first user to become admin
  app.post("/api/bootstrap-admin", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { users } = await import("@shared/schema");

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
        const { users } = await import("@shared/schema");
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

  // Document permissions routes (Many-to-Many)
  app.get(
    "/api/documents/:id/permissions",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const {
          documentUserPermissions,
          documentDepartmentPermissions,
          users,
          departments,
        } = await import("@shared/schema");
        const documentId = parseInt(req.params.id);

        // Get user permissions
        const userPermissions = await db
          .select({
            id: documentUserPermissions.id,
            userId: documentUserPermissions.userId,
            userName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
            userEmail: users.email,
            permissionType: documentUserPermissions.permissionType,
            grantedAt: documentUserPermissions.grantedAt,
            type: sql<string>`'user'`,
          })
          .from(documentUserPermissions)
          .leftJoin(users, eq(documentUserPermissions.userId, users.id))
          .where(eq(documentUserPermissions.documentId, documentId));

        // Get department permissions
        const departmentPermissions = await db
          .select({
            id: documentDepartmentPermissions.id,
            departmentId: documentDepartmentPermissions.departmentId,
            departmentName: departments.name,
            permissionType: documentDepartmentPermissions.permissionType,
            grantedAt: documentDepartmentPermissions.grantedAt,
            type: sql<string>`'department'`,
          })
          .from(documentDepartmentPermissions)
          .leftJoin(
            departments,
            eq(documentDepartmentPermissions.departmentId, departments.id),
          )
          .where(eq(documentDepartmentPermissions.documentId, documentId));

        res.json({ userPermissions, departmentPermissions });
      } catch (error) {
        console.error("Error fetching document permissions:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch document permissions" });
      }
    },
  );

  app.post(
    "/api/documents/:id/permissions/user",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { documentUserPermissions } = await import("@shared/schema");
        const documentId = parseInt(req.params.id);
        const { userId, permissionType = "read" } = req.body;
        const grantedBy = req.user.claims.sub;

        const [permission] = await db
          .insert(documentUserPermissions)
          .values({ documentId, userId, permissionType, grantedBy })
          .returning();

        res.json(permission);
      } catch (error) {
        console.error("Error granting user permission:", error);
        res.status(500).json({ message: "Failed to grant user permission" });
      }
    },
  );

  app.post(
    "/api/documents/:id/permissions/department",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { documentDepartmentPermissions } = await import(
          "@shared/schema"
        );
        const documentId = parseInt(req.params.id);
        const { departmentId, permissionType = "read" } = req.body;
        const grantedBy = req.user.claims.sub;

        const [permission] = await db
          .insert(documentDepartmentPermissions)
          .values({ documentId, departmentId, permissionType, grantedBy })
          .returning();

        res.json(permission);
      } catch (error) {
        console.error("Error granting department permission:", error);
        res
          .status(500)
          .json({ message: "Failed to grant department permission" });
      }
    },
  );

  app.delete(
    "/api/documents/permissions/user/:permissionId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { documentUserPermissions } = await import("@shared/schema");
        const permissionId = parseInt(req.params.permissionId);

        await db
          .delete(documentUserPermissions)
          .where(eq(documentUserPermissions.id, parseInt(permissionId)));

        res.json({ success: true });
      } catch (error) {
        console.error("Error removing user permission:", error);
        res.status(500).json({ message: "Failed to remove user permission" });
      }
    },
  );

  app.delete(
    "/api/documents/permissions/department/:permissionId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { documentDepartmentPermissions } = await import(
          "@shared/schema"
        );
        const permissionId = parseInt(req.params.permissionId);

        await db
          .delete(documentDepartmentPermissions)
          .where(eq(documentDepartmentPermissions.id, parseInt(permissionId)));

        res.json({ success: true });
      } catch (error) {
        console.error("Error removing department permission:", error);
        res
          .status(500)
          .json({ message: "Failed to remove department permission" });
      }
    },
  );

  // Document routes
  app.get("/api/documents", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const categoryId = req.query.categoryId
        ? parseInt(req.query.categoryId as string)
        : undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string)
        : undefined;
      const offset = req.query.offset
        ? parseInt(req.query.offset)
        : undefined;

      const documents = await storage.getDocuments(userId, {
        categoryId,
        limit,
        offset,
      });
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/search", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const query = req.query.query as string;
      const searchType = req.query.type as string || "hybrid";
      const searchFileName = req.query.fileName === "true";
      const searchKeyword = req.query.keyword === "true";
      const searchMeaning = req.query.meaning === "true";

      console.log(
        `Search request - User: ${userId}, Query: "${query}", Type: ${searchType}, FileName: ${searchFileName}, Keyword: ${searchKeyword}, Meaning: ${searchMeaning}`,
      );

      if (!query || query.trim().length === 0) {
        console.log("Empty query, returning empty results");
        return res.json([]);
      }

      let results = [];
      let filenameResults = [];
      let keywordResults = [];
      let semanticResults = [];

      // Filename search
      if (searchFileName) {
        console.log("Performing filename search...");
        try {
          const allDocs = await storage.getDocuments(userId);
          filenameResults = allDocs.filter(doc =>
            (doc.name || doc.originalName || "").toLowerCase().includes(query.toLowerCase())
          ).map(doc => ({
            ...doc,
            searchScore: 100, // Highest priority for filename matches
            searchType: "filename"
          }));
          console.log(`Filename search returned ${filenameResults.length} results`);
        } catch (error) {
          console.error("Filename search failed:", error);
        }
      }

      // Keyword search
      if (searchKeyword) {
        console.log("Performing keyword search...");
        try {
          const { advancedKeywordSearchService } = await import('./services/advancedKeywordSearch');
          const advancedResults = await advancedKeywordSearchService.searchDocuments(query, userId, 50);

          keywordResults = advancedResults.map(result => ({
            ...result,
            searchScore: 50 + (result.similarity * 30), // Medium priority with similarity boost
            searchType: "keyword"
          }));

          console.log(`Keyword search returned ${keywordResults.length} results`);
        } catch (error) {
          console.error("Keyword search failed, falling back to basic:", error);
          const basicResults = await storage.searchDocuments(userId, query);
          keywordResults = basicResults.map(doc => ({
            ...doc,
            searchScore: 40,
            searchType: "keyword"
          }));
        }
      }

      // Semantic search
      if (searchMeaning) {
        console.log("Performing semantic search...");
        try {
          const semanticDocs = await semanticSearchServiceV2.searchDocuments(
            query,
            userId,
            { searchType: "semantic" },
          );

          semanticResults = semanticDocs.map(doc => ({
            ...doc,
            searchScore: 20 + (doc.similarity || 0) * 25, // Lower priority but similarity-based
            searchType: "semantic"
          }));

          console.log(`Semantic search returned ${semanticResults.length} results`);
        } catch (error) {
          console.error("Semantic search failed:", error);
        }
      }

      // Merge and deduplicate results
      const allResults = [...filenameResults, ...keywordResults, ...semanticResults];
      const deduplicatedResults = new Map();

      // Keep the highest scoring result for each document
      allResults.forEach(result => {
        const docId = result.id;
        if (!deduplicatedResults.has(docId) ||
            result.searchScore > deduplicatedResults.get(docId).searchScore) {
          deduplicatedResults.set(docId, result);
        }
      });

      // Sort by search score (highest first) then by relevance
      results = Array.from(deduplicatedResults.values())
        .sort((a, b) => {
          if (b.searchScore !== a.searchScore) {
            return b.searchScore - a.searchScore;
          }
          // Secondary sort by similarity if available
          return (b.similarity || 0) - (a.similarity || 0);
        });

      console.log(`Final results count: ${results.length} (filename: ${filenameResults.length}, keyword: ${keywordResults.length}, semantic: ${semanticResults.length})`);

      // Log the search action for audit
      await storage.createAuditLog({
        userId,
        action: "search",
        resourceType: "document",
        ipAddress: req.ip || req.connection.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: true,
        details: {
          query: query,
          searchType: searchType,
          searchFileName,
          searchKeyword,
          searchMeaning,
          resultsCount: results.length,
        },
      });

      res.json(results);


    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ message: "Failed to search documents" });
    }
  });

  app.get("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);

      // Get basic document first
      const document = await storage.getDocument(id, userId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Get user information separately to avoid complex query issues
      const [uploaderInfo] = await db
        .select({
          uploaderName:
            sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`.as(
              "uploaderName",
            ),
          uploaderEmail: users.email,
          uploaderRole: users.role,
          departmentName: departments.name,
        })
        .from(users)
        .leftJoin(departments, eq(users.departmentId, departments.id))
        .where(eq(users.id, document.userId));

      // Combine document with uploader info
      const documentWithUploader = {
        ...document,
        uploaderName: uploaderInfo?.uploaderName || "Unknown User",
        uploaderEmail: uploaderInfo?.uploaderEmail || "",
        uploaderRole: uploaderInfo?.uploaderRole || "user",
        departmentName: uploaderInfo?.departmentName || "No Department",
      };

      // Log access
      await storage.logDocumentAccess(id, userId, "view");
      res.json(documentWithUploader);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  app.get(
    "/api/documents/:id/summary",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const id = parseInt(req.params.id);
        const document = await storage.getDocument(id, userId);

        if (!document) {
          return res.status(404).json({ message: "Document not found" });
        }

        // Return existing summary or content excerpt
        const summary =
          document.summary ||
          (document.content
            ? document.content.substring(0, 500) + "..."
            : "No content summary available for this document.");

        res.json({ summary });
      } catch (error) {
        console.error("Error fetching document summary:", error);
        res.status(500).json({ message: "Failed to fetch document summary" });
      }
    },
  );

  // Translation API endpoint with database caching
  app.post(
    "/api/documents/:id/translate",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const documentId = parseInt(req.params.id);
        const { targetLanguage } = req.body;

        console.log(
          `Translation request: documentId=${documentId}, targetLanguage=${targetLanguage}, userId=${userId}`,
        );

        if (!targetLanguage) {
          console.log("Missing target language in request");
          return res
            .status(400)
            .json({ message: "Target language is required" });
        }

        // Get document
        const document = await storage.getDocument(documentId, userId);
        if (!document) {
          console.log(`Document ${documentId} not found for user ${userId}`);
          return res.status(404).json({ message: "Document not found" });
        }

        if (!document.summary) {
          console.log(`Document ${documentId} has no summary to translate`);
          return res
            .status(400)
            .json({ message: "Document has no summary to translate" });
        }

        console.log(
          `Found document: ${document.name}, summary length: ${document.summary.length}`,
        );

        // Create translation using OpenAI directly
        if (!process.env.OPENAI_API_KEY) {
          return res
            .status(500)
            .json({ message: "Translation service not available" });
        }

        console.log("Creating fresh translation with OpenAI");

        const OpenAI = await import("openai");
        const openai = new OpenAI.default({
          apiKey: process.env.OPENAI_API_KEY,
        });

        const prompt = `Translate the following text to ${targetLanguage}. Maintain the same tone and meaning. Only return the translated text without any additional explanation:

${document.summary}`;

        console.log(
          `Sending translation request to OpenAI for ${targetLanguage}`,
        );

        const response = await openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 2000,
          temperature: 0.3
        });

        const translatedText = response.choices[0].message.content?.trim();

        console.log(
          `OpenAI response received, translated text length: ${translatedText?.length || 0}`,
        );

        if (!translatedText) {
          console.log("OpenAI translation failed - no content returned");
          return res
            .status(500)
            .json({ message: "Translation failed - no content from OpenAI" });
        }

        console.log("Translation successful, returning result");

        // Log the translation action for audit
        await storage.createAuditLog({
          userId,
          action: "translate",
          resourceType: "document",
          resourceId: documentId.toString(),
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            documentId: documentId,
            targetLanguage: targetLanguage,
            contentLength: translatedText.length,
          },
        });

        res.json({ translatedText });
      } catch (error) {
        console.error("Translation error:", error);
        res.status(500).json({ message: "Failed to translate text" });
      }
    },
  );

  app.post(
    "/api/documents/upload",
    isAuthenticated,
    upload.array("files", 10),
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const files = req.files as Express.Multer.File[];

        // Parse metadata if provided
        let metadataArray: any[] = [];
        try {
          if (req.body.metadata) {
            metadataArray = JSON.parse(req.body.metadata);
          }
        } catch (error) {
          console.warn("Failed to parse metadata:", error);
        }

        console.log("Upload request received:", {
          userId,
          filesCount: files?.length || 0,
          bodyKeys: Object.keys(req.body || {}),
          hasFiles: !!files,
          hasMetadata: metadataArray.length > 0,
        });

        if (!files || files.length === 0) {
          console.log("No files in request, body:", req.body);
          return res.status(400).json({ message: "No files uploaded" });
        }

        const uploadedDocuments = [];

        for (const file of files) {
          try {
            // Fix Thai filename encoding if needed
            let correctedFileName = file.originalname;
            try {
              // Check if filename contains Thai characters that are garbled
              if (
                file.originalname.includes("à¸") ||
                file.originalname.includes("à¹")
              ) {
                // Try to decode and re-encode properly
                const buffer = Buffer.from(file.originalname, "latin1");
                correctedFileName = buffer.toString("utf8");
                console.log(
                  `Fixed Thai filename: ${file.originalname} -> ${correctedFileName}`,
                );
              }
            } catch (error) {
              console.warn("Failed to fix filename encoding:", error);
              // Keep original filename if encoding fix fails
            }

            // Find metadata for this file
            const fileMetadata = metadataArray.find(meta => meta.fileName === file.originalname);

            // Process the document with enhanced AI classification
            const { content, summary, tags, category, categoryColor } =
              await processDocument(file.path, file.mimetype);

            const documentData = {
              name: fileMetadata?.name || correctedFileName,
              fileName: file.filename,
              filePath: file.path,
              fileSize: file.size,
              mimeType: file.mimetype,
              content,
              summary,
              tags,
              aiCategory: category,
              aiCategoryColor: categoryColor,
              userId,
              processedAt: new Date(),
              effectiveStartDate: fileMetadata?.effectiveStartDate ? new Date(fileMetadata.effectiveStartDate) : null,
              effectiveEndDate: fileMetadata?.effectiveEndDate ? new Date(fileMetadata.effectiveEndDate) : null,
            };

            const document = await storage.createDocument(documentData);
            uploadedDocuments.push(document);

            // Auto-vectorize the document if it has content
            if (content && content.trim().length > 0) {
              try {
                await vectorService.addDocument(
                  document.id.toString(),
                  content,
                  {
                    userId,
                    documentName: document.name,
                    mimeType: document.mimeType,
                    tags: document.tags || [],
                    originalDocumentId: document.id.toString(),
                  },
                );
                console.log(
                  `Document ${document.id} auto-vectorized successfully`,
                );
              } catch (vectorError) {
                console.error(
                  `Failed to auto-vectorize document ${document.id}:`,
                  vectorError,
                );
              }
            }

            console.log(
              `Document processed: ${correctedFileName} -> Category: ${category}, Tags: ${tags?.join(", ")}`,
            );
          } catch (error) {
            // Fix Thai filename encoding for error fallback too
            let correctedFileName = file.originalname;
            try {
              if (
                file.originalname.includes("à¸") ||
                file.originalname.includes("à¹")
              ) {
                const buffer = Buffer.from(file.originalname, "latin1");
                correctedFileName = buffer.toString("utf8");
              }
            } catch (encodingError) {
              console.warn(
                "Failed to fix filename encoding in error handler:",
                encodingError,
              );
            }

            console.error(`Error processing file ${correctedFileName}:`, error);
            // Still create document without AI processing
            const documentData = {
              name: correctedFileName,
              fileName: file.filename,
              filePath: file.path,
              fileSize: file.size,
              mimeType: file.mimetype,
              aiCategory: "Uncategorized",
              aiCategoryColor: "#6B7280",
              userId,
            };
            const document = await storage.createDocument(documentData);
            uploadedDocuments.push(document);
          }
        }

        // Log document upload for audit
        try {
          await storage.createAuditLog({
            userId,
            action: "upload",
            resourceType: "document",
            ipAddress: req.ip || req.connection.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
            details: {
              documentsCount: uploadedDocuments.length,
              documentNames: uploadedDocuments.map((doc) => doc.name),
            },
          });
        } catch (auditError) {
          console.error("Failed to create audit log for upload:", auditError);
        }

        res.json(uploadedDocuments);
      } catch (error) {
        console.error("Error uploading documents:", error);
        res.status(500).json({ message: "Failed to upload documents" });
      }
    },
  );

  app.get(
    "/api/documents/:id/download",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const id = parseInt(req.params.id);
        const document = await storage.getDocument(id, userId);

        if (!document) {
          return res.status(404).json({ message: "Document not found" });
        }

        const filePath = path.join(process.cwd(), "uploads", document.fileName);

        if (!fsSync.existsSync(filePath)) {
          return res.status(404).json({ message: "File not found" });
        }

        // Log access
        await storage.logDocumentAccess(id, userId, "download");

        // Log the download action for audit
        await storage.createAuditLog({
          userId,
          action: "download",
          resourceType: "document",
          resourceId: id.toString(),
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            fileName: document.name,
            fileSize: document.fileSize,
          },
        });

        // Set proper headers to prevent corruption
        res.setHeader("Content-Type", document.mimeType);
        // Use RFC 5987 encoding for Thai filenames to ensure proper display
        const encodedFilename = encodeURIComponent(document.name);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodedFilename}`,
        );
        res.setHeader("Content-Length", fsSync.statSync(filePath).size);

        const fileStream = fsSync.createReadStream(filePath);
        fileStream.pipe(res);
      } catch (error) {
        console.error("Error downloading document:", error);
        res.status(500).json({ message: "Failed to download document" });
      }
    },
  );

  app.post(
    "/api/documents/:id/favorite",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const id = parseInt(req.params.id);
        const document = await storage.toggleDocumentFavorite(id, userId);
        res.json(document);
      } catch (error) {
        console.error("Error toggling favorite:", error);
        res.status(500).json({ message: "Failed to toggle favorite" });
      }
    },
  );

  app.post(
    "/api/documents/:id/vectorize",
    (req: any, res: any, next: any) => {
      // Try Microsoft auth first, then fallback to Replit auth
      isMicrosoftAuthenticated(req, res, (err: any) => {
        if (!err) {
          return next();
        }
        isAuthenticated(req, res, next);
      });
    },
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const { preserveExistingEmbeddings = false } = req.body;
        const document = await storage.getDocument(id, userId);

        if (!document) {
          return res.status(404).json({ message: "Document not found" });
        }

        if (document.content && document.content.trim().length > 0) {
          const result = await vectorService.addDocument(id.toString(), document.content, {
            userId,
            documentName: document.name,
            mimeType: document.mimeType,
            tags: document.tags || [],
          }, document.mimeType, preserveExistingEmbeddings);

          console.log(`Document ${id} manually vectorized successfully with preserve mode: ${preserveExistingEmbeddings}`);
          res.json({
            success: true,
            message: result,
            preservedExistingEmbeddings: preserveExistingEmbeddings
          });
        } else {
          res.status(400).json({
            message: "Document has no extractable content for vectorization",
          });
        }
      } catch (error) {
        console.error("Error adding document to vector database:", error);
        res
          .status(500)
          .json({ message: "Failed to add document to vector database" });
      }
    },
  );

  app.post(
    "/api/documents/vectorize-all",
    (req: any, res: any, next: any) => {
      // Try Microsoft auth first, then fallback to Replit auth
      isMicrosoftAuthenticated(req, res, (err: any) => {
        if (!err) {
          return next();
        }
        isAuthenticated(req, res, next);
      });
    },
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const { preserveExistingEmbeddings = false } = req.body;
        const documents = await storage.getDocuments(userId);

        let vectorizedCount = 0;
        let skippedCount = 0;

        console.log(
          `Starting to vectorize ${documents.length} documents for user ${userId} with preserve mode: ${preserveExistingEmbeddings}`,
        );

        for (const doc of documents) {
          if (doc.content && doc.content.trim().length > 0) {
            try {
              await vectorService.addDocument(doc.id.toString(), doc.content, {
                userId,
                documentName: doc.name,
                mimeType: doc.mimeType,
                tags: doc.tags || [],
              }, doc.mimeType, preserveExistingEmbeddings);
              vectorizedCount++;
              console.log(
                `Vectorized document ${doc.id}: ${doc.name}`);
            } catch (error) {
              console.error(`Failed to vectorize document ${doc.id}:`, error);
              skippedCount++;
            }
          } else {
            skippedCount++;
          }
        }

        console.log(
          `Vectorization complete: ${vectorizedCount} vectorized, ${skippedCount} skipped`,
        );
        res.json({
          success: true,
          message: `${preserveExistingEmbeddings ? 'Re-vectorized' : 'Vectorized'} ${vectorizedCount} documents, skipped ${skippedCount}`,
          vectorizedCount,
          skippedCount,
          preservedExistingEmbeddings: preserveExistingEmbeddings
        });
      } catch (error) {
        console.error("Error vectorizing all documents:", error);
        res.status(500).json({ message: "Failed to vectorize documents" });
      }
    },
  );

  // Revert vectorization endpoint
  app.post(
    "/api/documents/revert-vectorization",
    (req: any, res: any, next: any) => {
      // Try Microsoft auth first, then fallback to Replit auth
      isMicrosoftAuthenticated(req, res, (err: any) => {
        if (!err) {
          return next();
        }
        isAuthenticated(req, res, next);
      });
    },
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;

        console.log(`Starting revert vectorization for user ${userId}`);

        // Get all document vectors for this user that have multi-provider embeddings
        const { documentVectors } = await import("@shared/schema");
        const { eq, and, isNotNull } = await import("drizzle-orm");

        const vectorsToRevert = await db.select()
          .from(documentVectors)
          .where(
            and(
              eq(documentVectors.userId, userId),
              isNotNull(documentVectors.embeddingMulti)
            )
          );

        let revertedCount = 0;

        for (const vector of vectorsToRevert) {
          try {
            const embeddingMulti = vector.embeddingMulti as { openai?: number[]; gemini?: number[] };

            // If we have a previous embedding to revert to
            if (embeddingMulti && (embeddingMulti.gemini || embeddingMulti.openai)) {
              // Prefer reverting to OpenAI embedding if available, otherwise use Gemini
              const revertToEmbedding = embeddingMulti.openai || embeddingMulti.gemini;

              // Update the main embedding column and clear the multi-provider column
              await db.update(documentVectors)
                .set({
                  embedding: revertToEmbedding,
                  embeddingMulti: null // Clear the multi-provider column
                })
                .where(eq(documentVectors.id, vector.id));

              revertedCount++;
            }
          } catch (error) {
            console.error(`Failed to revert vector ${vector.id}:`, error);
          }
        }

        console.log(`Revert complete: ${revertedCount} vectors reverted`);

        res.json({
          success: true,
          message: `Successfully reverted ${revertedCount} document embeddings`,
          revertedCount
        });

      } catch (error) {
        console.error("Error reverting vectorization:", error);
        res.status(500).json({
          message: "Failed to revert vectorization",
          error: error.message
        });
      }
    },
  );

  // Test Gemini embeddings endpoint
  app.post(
    "/api/test/gemini-embedding",
    (req: any, res: any, next: any) => {
      // Try Microsoft auth first, then fallback to Replit auth
      isMicrosoftAuthenticated(req, res, (err: any) => {
        if (!err) {
          return next();
        }
        isAuthenticated(req, res, next);
      });
    },
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const { text = "Hello, this is a test embedding." } = req.body;

        console.log(`Testing Gemini embedding for user ${userId}`);

        // Test Gemini embedding generation
        const { llmRouter } = await import("./services/llmRouter");
        const embeddings = await llmRouter.generateEmbeddings([text], userId);

        if (embeddings && embeddings[0] && embeddings[0].length > 0) {
          console.log(`✅ Gemini embedding test successful: ${embeddings[0].length} dimensions`);
          res.json({
            success: true,
            message: "Gemini embedding generated successfully",
            dimensions: embeddings[0].length,
            sampleValues: embeddings[0].slice(0, 5) // First 5 values for verification
          });
        } else {
          console.log("❌ Gemini embedding test failed: no valid embedding returned");
          res.status(500).json({
            success: false,
            message: "Failed to generate Gemini embedding"
          });
        }

      } catch (error) {
        console.error("Error testing Gemini embedding:", error);
        res.status(500).json({
          message: "Failed to test Gemini embedding",
          error: error.message
        });
      }
    },
  );

  // Document endorsement endpoint
  app.post("/api/documents/:id/endorse", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = parseInt(req.params.id);
      const { effectiveStartDate, effectiveEndDate } = req.body;

      // Validate input
      if (!effectiveStartDate) {
        return res.status(400).json({ message: "Effective start date is required" });
      }

      // Validate date format and logic
      const startDate = new Date(effectiveStartDate);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ message: "Invalid effective start date format" });
      }

      if (effectiveEndDate) {
        const endDate = new Date(effectiveEndDate);
        if (isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "Invalid effective end date format" });
        }
        if (endDate <= startDate) {
          return res.status(400).json({ message: "End date must be after start date" });
        }
      }

      // Verify the document exists and user has access
      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Endorse the document
      const endorsedDocument = await storage.endorseDocument(
        documentId,
        userId,
        effectiveStartDate,
        effectiveEndDate
      );

      // Log endorsement action for audit
      try {
        await storage.createAuditLog({
          userId,
          action: "endorse",
          resourceType: "document",
          resourceId: documentId.toString(),
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            documentName: document.name,
            effectiveStartDate,
            effectiveEndDate: effectiveEndDate || null,
          },
        });
      } catch (auditError) {
        console.error("Failed to create audit log for endorsement:", auditError);
      }

      res.json({
        success: true,
        message: "Document endorsed successfully",
        document: endorsedDocument,
      });
    } catch (error) {
      console.error("Error endorsing document:", error);
      res.status(500).json({
        message: "Failed to endorse document",
        error: error.message,
      });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);

      console.log(`Delete request for document ${id} by user ${userId}`);

      // Get document to verify ownership and get file path
      const document = await storage.getDocument(id, userId);
      if (!document) {
        console.log(`Document ${id} not found for user ${userId}`);
        return res.status(404).json({ message: "Document not found" });
      }

      console.log(
        `Found document: ${document.name}, filePath: ${document.filePath}`,
      );

      // Delete physical file first
      if (document.filePath) {
        try {
          await fs.unlink(document.filePath);
          console.log(`Successfully deleted file: ${document.filePath}`);
        } catch (error) {
          console.error("Error deleting file:", error);
          // Continue with database deletion even if file deletion fails
        }
      }

      // Delete from database
      await storage.deleteDocument(id, userId);
      console.log(`Successfully deleted document ${id} from database`);

      // Log document deletion for audit
      try {
        await storage.createAuditLog({
          userId,
          action: "delete",
          resourceType: "document",
          resourceId: id.toString(),
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            documentName: document.name,
            fileSize: document.fileSize,
          },
        });
      } catch (auditError) {
        console.error("Failed to create audit log for delete:", auditError);
      }

      res.json({ success: true, message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res
        .status(500)
        .json({ message: "Failed to delete document", error: error.message });
    }
  });

  // Chat routes
  app.get("/api/chat/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversations = await storage.getChatConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post(
    "/api/chat/conversations",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const conversationData = insertChatConversationSchema.parse({
          ...req.body,
          userId,
        });
        const conversation =
          await storage.createChatConversation(conversationData);
        res.json(conversation);
      } catch (error) {
        console.error("Error creating conversation:", error);
        res.status(500).json({ message: "Failed to create conversation" });
      }
    },
  );

  app.get(
    "/api/chat/conversations/:id/messages",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const conversationId = parseInt(req.params.id);
        const messages = await storage.getChatMessages(conversationId, userId);
        res.json(messages);
      } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: "Failed to fetch messages" });
      }
    },
  );

  app.post("/api/chat/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId, content, documentId } = req.body;

      // Create user message
      const userMessage = await storage.createChatMessage({
        conversationId,
        role: "user",
        content,
      });

      // Get specific document if documentId is provided, otherwise get all documents
      let documents;
      if (documentId) {
        const specificDocument = await storage.getDocument(documentId, userId);
        documents = specificDocument ? [specificDocument] : [];
      } else {
        documents = await storage.getDocuments(userId, { limit: 100 });
      }

      // Generate AI response with specific document context using hybrid search
      const aiResponse = await generateChatResponse(
        content,
        documents,
        documentId ? documentId : undefined,
        'hybrid',
        0.4, // keywordWeight
        0.6  // vectorWeight
      );

      // Create assistant message
      const assistantMessage = await storage.createChatMessage({
        conversationId,
        role: "assistant",
        content: aiResponse,
      });

      // Log document access if specific document was referenced
      if (documentId) {
        await storage.logDocumentAccess(documentId, userId, "chat", {
          query: content,
          conversationId: conversationId,
        });
      }

      // Log chat interaction for audit
      try {
        await storage.createAuditLog({
          userId,
          action: "chat",
          resourceType: "ai_assistant",
          resourceId: conversationId?.toString(),
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            conversationId: conversationId,
            userMessage: content,
            assistantResponse: aiResponse,
            messageLength: content.length,
            responseLength: aiResponse.length,
            hasDocumentContext: !!documentId,
            documentId: documentId || null,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (auditError) {
        console.error("Failed to create audit log for chat:", auditError);
      }

      // Automatically analyze AI response quality
      try {
        const startTime = Date.now();
        const responseTime = Date.now() - startTime;

        const analysisPrompt = `
Analyze this AI assistant response to determine if it's a "positive" (helpful, informative response) or "fallback" (unable to answer, generic response).

User Query: "${content}"
Assistant Response: "${aiResponse}"

Classification criteria:
- "positive": The response contains specific information, facts, procedures, or actionable guidance that directly addresses the user's question. Even if the response says "according to the document" or references sources, it's positive if it provides useful information.
- "fallback": The response explicitly states inability to help, gives only generic advice without specifics, or clearly indicates no relevant information was found.

Respond with JSON: {"result": "positive" or "fallback", "confidence": 0.0-1.0, "reason": "explanation"}
`;

        const openai = new (await import("openai")).default({
          apiKey: process.env.OPENAI_API_KEY,
        });

        const response = await openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [{ role: "user", content: analysisPrompt }],
          response_format: { type: "json_object" },
        });

        const analysisResult = JSON.parse(
          response.choices[0].message.content || "{}",
        );

        // Store the analysis result
        await storage.createAiResponseAnalysis({
          chatMessageId: assistantMessage.id,
          userId,
          userQuery: content,
          assistantResponse: aiResponse,
          analysisResult: analysisResult.result,
          analysisConfidence: analysisResult.confidence,
          analysisReason: analysisResult.reason,
          documentContext: documentId
            ? `Document ID: ${documentId}`
            : "General chat",
          responseTime,
        });

        console.log(
          `AI Response Analysis completed: ${analysisResult.result} (confidence: ${analysisResult.confidence})`,
        );
      } catch (analysisError) {
        console.error("Failed to analyze AI response:", analysisError);
      }

      res.json([userMessage, assistantMessage]);
    } catch (error) {
      console.error("Error processing chat message:", error);
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  // Data connection management routes
  app.get("/api/data-connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connections = await storage.getDataConnections(userId);
      res.json(connections);
    } catch (error) {
      console.error("Error fetching data connections:", error);
      res.status(500).json({ message: "Failed to fetch data connections" });
    }
  });

  app.post("/api/data-connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connectionData = insertDataConnectionSchema.parse({
        ...req.body,
        userId,
      });
      const connection = await storage.createDataConnection(connectionData);
      res.json(connection);
    } catch (error) {
      console.error("Error creating data connection:", error);
      res.status(500).json({ message: "Failed to create data connection" });
    }
  });

  app.get(
    "/api/data-connections/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const connectionId = parseInt(req.params.id);
        const connection = await storage.getDataConnection(
          connectionId,
          userId,
        );

        if (!connection) {
          return res.status(404).json({ message: "Data connection not found" });
        }

        res.json(connection);
      } catch (error) {
        console.error("Error fetching data connection:", error);
        res.status(500).json({ message: "Failed to fetch data connection" });
      }
    },
  );

  app.put(
    "/api/data-connections/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const connectionId = parseInt(req.params.id);
        const connectionData = updateDataConnectionSchema.parse(req.body);

        const connection = await storage.updateDataConnection(
          connectionId,
          connectionData,
          userId,
        );
        res.json(connection);
      } catch (error) {
        console.error("Error updating data connection:", error);
        res.status(500).json({ message: "Failed to update data connection" });
      }
    },
  );

  app.delete(
    "/api/data-connections/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const connectionId = parseInt(req.params.id);

        await storage.deleteDataConnection(connectionId, userId);
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting data connection:", error);
        res.status(500).json({ message: "Failed to delete data connection" });
      }
    },
  );

  app.post(
    "/api/data-connections/:id/test",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const connectionId = parseInt(req.params.id);
        const connection = await storage.getDataConnection(
          connectionId,
          userId,
        );

        if (!connection) {
          return res.status(404).json({ message: "Connection not found" });
        }

        // Import database connector
        const { databaseConnector } = await import(
          "./services/databaseConnector"
        );

        // Transform connection data for connector
        const connectorData = {
          id: connection.id,
          type: connection.type as "database" | "api" | "enterprise",
          dbType: connection.dbType || undefined,
          host: connection.host || undefined,
          port: connection.port || undefined,
          database: connection.database || undefined,
          username: connection.username || undefined,
          password: connection.password || undefined,
          apiUrl: connection.apiUrl || undefined,
          authType: connection.authType || undefined,
          apiKey: connection.authConfig?.apiKey || undefined,
          bearerToken: connection.authConfig?.bearerToken || undefined,
          enterpriseType: connection.enterpriseType || undefined,
        };

        const result = await databaseConnector.testConnection(connectorData);

        // Update connection test status
        await storage.updateDataConnection(
          connectionId,
          {
            lastTested: new Date(),
            testStatus: result.success ? "success" : "failed",
            testMessage: result.message,
          },
          userId,
        );

        res.json(result);
      } catch (error) {
        console.error("Error testing data connection:", error);
        res.status(500).json({ message: "Failed to test data connection" });
      }
    },
  );

  // Database connections endpoints
  app.get("/api/database-connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connections = await storage.getDataConnections(userId);
      res.json(connections);
    } catch (error) {
      console.error("Error fetching database connections:", error);
      res.status(500).json({ message: "Failed to fetch database connections" });
    }
  });

  app.post("/api/database-connections/postgresql", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connectionData = {
        ...req.body,
        type: 'postgresql' as const,
        dbType: 'postgresql',
        userId,
        isActive: true
      };
      const connection = await storage.saveDataConnection(connectionData);
      res.json(connection);
    } catch (error) {
      console.error("Error creating PostgreSQL connection:", error);
      res.status(500).json({ message: "Failed to create PostgreSQL connection" });
    }
  });

  app.post("/api/database-connections/mysql", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connectionData = {
        ...req.body,
        type: 'mysql' as const,
        dbType: 'mysql',
        userId,
        isActive: true
      };
      const connection = await storage.saveDataConnection(connectionData);
      res.json(connection);
    } catch (error) {
      console.error("Error creating MySQL connection:", error);
      res.status(500).json({ message: "Failed to create MySQL connection" });
    }
  });

  app.post("/api/database-connections/:id/test", isAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection) {
        return res.status(404).json({ message: "Database connection not found" });
      }

      const { databaseConnector } = await import("./services/databaseConnector");
      const result = await databaseConnector.testConnection(connection);
      
      if (result.success) {
        // Update connection status
        await storage.updateDataConnection(connectionId, { isConnected: true }, userId);
      }

      res.json(result);
    } catch (error) {
      console.error("Error testing database connection:", error);
      res.status(500).json({ message: "Failed to test database connection" });
    }
  });

  app.get("/api/database-connections/:id/details", isAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection) {
        return res.status(404).json({ message: "Database connection not found" });
      }

      // Generate connection string and details
      let connectionString = '';
      if (connection.type === 'postgresql') {
        connectionString = `postgresql://${connection.username}:***@${connection.host}:${connection.port}/${connection.database}`;
      } else if (connection.type === 'mysql') {
        connectionString = `mysql://${connection.username}:***@${connection.host}:${connection.port}/${connection.database}`;
      } else if (connection.type === 'sqlite') {
        connectionString = `sqlite:///${connection.database}`;
      }

      res.json({
        connectionString,
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username
      });
    } catch (error) {
      console.error("Error fetching connection details:", error);
      res.status(500).json({ message: "Failed to fetch connection details" });
    }
  });

  // Database query endpoints
  app.post(
    "/api/data-connections/:id/query",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const connectionId = parseInt(req.params.id);
        const userId = req.user.claims.sub;
        const { query } = req.body;

        if (!query) {
          return res.status(400).json({ message: "SQL query is required" });
        }

        const { databaseQueryService } = await import(
          "./services/databaseQueryService"
        );
        const result = await databaseQueryService.executeQuery(
          connectionId,
          query,
          userId,
        );

        res.json(result);
      } catch (error) {
        console.error("Error executing database query:", error);
        res.status(500).json({ message: "Failed to execute query" });
      }
    },
  );

  app.get(
    "/api/data-connections/:id/schema",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const connectionId = parseInt(req.params.id);
        const userId = req.user.claims.sub;

        const { databaseQueryService } = await import(
          "./services/databaseQueryService"
        );
        const schema = await databaseQueryService.getDatabaseSchema(
          connectionId,
          userId,
        );

        if (!schema) {
          return res.status(404).json({ message: "Database schema not found" });
        }

        res.json(schema);
      } catch (error) {
        console.error("Error fetching database schema:", error);
        res.status(500).json({ message: "Failed to fetch database schema" });
      }
    },
  );

  app.post("/api/chat/database", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { message, connectionId, executeQuery = false } = req.body;

      if (!message || !connectionId) {
        return res
          .status(400)
          .json({ message: "Message and connection ID are required" });
      }

      if (executeQuery) {
        // Use AI agent to generate and execute SQL
        const { aiDatabaseAgent } = await import("./services/aiDatabaseAgent");
        const result = await aiDatabaseAgent.generateSQL(
          message,
          connectionId,
          userId,
          50
        );

        res.json({
          response: result.explanation || 'Query executed successfully',
          sql: result.sql,
          data: result.data,
          columns: result.columns,
          success: result.success,
          error: result.error,
          executionTime: result.executionTime
        });
      } else {
        // Use existing approach for conversational responses
        const { databaseQueryService } = await import(
          "./services/databaseQueryService"
        );
        const schema = await databaseQueryService.getDatabaseSchema(
          connectionId,
          userId,
        );

        if (!schema) {
          return res
            .status(404)
            .json({ message: "Database connection not found" });
        }

        const suggestions = await databaseQueryService.suggestQueries(
          connectionId,
          userId,
          message
        );

        const { generateDatabaseResponse } = await import("./services/openai");
        const response = await generateDatabaseResponse(
          message,
          schema,
          suggestions
        );

        res.json({ response });
      }
    } catch (error) {
      console.error("Error in database chat:", error);
      res.status(500).json({ message: "Failed to process database query" });
    }
  });







  // HR Employee management endpoints
  app.get("/api/hr-employees", isAuthenticated, async (req: any, res) => {
    try {
      const { hrEmployees } = await import("@shared/schema");
      const employees = await db
        .select()
        .from(hrEmployees)
        .where(eq(hrEmployees.isActive, true));
      res.json(employees);
    } catch (error) {
      console.error("Error fetching HR employees:", error);
      res.status(500).json({ message: "Failed to fetch HR employees" });
    }
  });

  app.post("/api/hr-employees", isAuthenticated, async (req: any, res) => {
    try {
      const { hrEmployees } = await import("@shared/schema");
      const {
        employeeId,
        citizenId,
        firstName,
        lastName,
        email,
        phone,
        department,
        position,
        startDate,
      } = req.body;

      if (!employeeId || !citizenId || !firstName || !lastName || !department) {
        return res.status(400).json({
          message:
            "Required fields: employeeId, citizenId, firstName, lastName, department",
        });
      }

      // Validate Thai Citizen ID format
      if (!/^\d{13}$/.test(citizenId)) {
        return res.status(400).json({
          message: "Invalid Thai Citizen ID format. Must be 13 digits.",
        });
      }

      const [employee] = await db
        .insert(hrEmployees)
        .values({
          employeeId,
          citizenId,
          firstName,
          lastName,
          email,
          phone,
          department,
          position,
          startDate: startDate ? new Date(startDate) : null,
        })
        .returning();

      res.status(201).json(employee);
    } catch (error) {
      console.error("Error creating HR employee:", error);
      if (error.code === "23505") {
        // Unique constraint violation
        res
          .status(409)
          .json({ message: "Employee ID or Citizen ID already exists" });
      } else {
        res.status(500).json({ message: "Failed to create HR employee" });
      }
    }
  });


  // Survey routes
  app.post("/api/survey/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { satisfaction, easeOfUse, improvements, suggestions } = req.body;

      // Store survey response (you can add this to schema if needed)
      // For now, we'll just return success
      res.json({ success: true, message: "Survey submitted successfully" });
    } catch (error) {
      console.error("Error submitting survey:", error);
      res.status(500).json({ message: "Failed to submit survey" });
    }
  });

  app.get("/api/survey/responses", isAuthenticated, async (req: any, res) => {
    try {
      // Mock survey responses for now
      const mockResponses = [
        {
          id: 1,
          satisfaction: 4,
          easeOfUse: 5,
          improvements: "Better search functionality",
          suggestions: "Add more AI features",
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          satisfaction: 5,
          easeOfUse: 4,
          improvements: "UI improvements",
          suggestions: "More integrations",
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ];

      res.json(mockResponses);
    } catch (error) {
      console.error("Error fetching survey responses:", error);
      res.status(500).json({ message: "Failed to fetch survey responses" });
    }
  });

  app.get("/api/survey/stats", isAuthenticated, async (req: any, res) => {
    try {
      // Mock survey stats
      const mockStats = {
        totalResponses: 25,
        averageSatisfaction: 4.2,
        averageEaseOfUse: 4.1,
        responseRate: 68,
      };

      res.json(mockStats);
    } catch (error) {
      console.error("Error fetching survey stats:", error);
      res.status(500).json({ message: "Failed to fetch survey stats" });
    }
  });



  // Debug endpoint to test WebSocket broadcasting
  app.post('/api/debug/websocket-test', async (req: any, res) => {
    try {
      const { message, userId, channelId } = req.body;

      console.log('Debug WebSocket test initiated:', {
        message,
        userId,
        channelId,
        totalClients: wsClients.size + 1
      });

      if (wsClients && wsClients.size > 0) {
        const testMessage = {
          type: 'human_agent_message',
          channelType: 'web',
          channelId: channelId,
          userId: userId,
          message: {
            messageType: 'agent',
            content: message || 'Test message from debug endpoint',
            timestamp: new Date().toISOString(),
            humanAgent: true,
            humanAgentName: 'Debug Agent'
          }
        };

        console.log('Broadcasting test message:', JSON.stringify(testMessage, null, 2));

        let sentCount = 0;
        let openConnections = 0;
        wsClients.forEach((client, index) => {
          console.log(`WebSocket client ${index + 1} readyState:`, client.readyState);
          if (client.readyState === WebSocket.OPEN) {
            openConnections++;
            try {
              // Send both specific and broadcast messages
              client.send(JSON.stringify(testMessage));
              sentCount++;
              console.log(`Test message sent to WebSocket client ${index + 1}`);
            } catch (error) {
              console.log(`Error sending to WebSocket client ${index + 1}:`, error);
              wsClients.delete(client);
            }
          } else {
            wsClients.delete(client);
          }
        });

        console.log(`WebSocket summary - Total clients: ${wsClients.size}, Open: ${openConnections}, Sent: ${sentCount}`);


        res.json({
          success: true,
          message: 'Debug WebSocket message sent',
          broadcastedTo: wsClients.size,
          testMessage: testMessage
        });
      } else {
        console.log('No WebSocket clients connected');
        res.json({
          success: false,
          message: 'No WebSocket clients connected',
          broadcastedTo: 0
        });
      }
    } catch (error) {
      console.error('Debug WebSocket test error:', error);
      res.status(500).json({
        success: false,
        message: 'Debug WebSocket test failed',
        error: error.message
      });
    }
  });

  app.post('/api/agent-console/send-message', isAuthenticated, async (req: any, res) => {
    try {
      let { userId: targetUserId, channelType, channelId, agentId, message, messageType } = req.body;

      console.log('Agent Console send-message endpoint called:', {
        targetUserId,
        channelType,
        channelId,
        agentId,
        messageLength: message?.length || 0,
        messageType,
        humanAgent: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
      });

      if (!targetUserId || !channelType || !channelId || !agentId || !message) {
        console.log('Missing required parameters:', { targetUserId, channelType, channelId, agentId, hasMessage: !!message });
        return res.status(400).json({ message: "Missing required parameters" });
      }

      // For web channel, always broadcast to all active sessions for this widget
      // This ensures messages reach the widget regardless of session ID mismatches

      // Store the human agent message in chat history
      console.log('Storing human agent message in chat history...');
      const chatHistoryRecord = await storage.createChatHistory({
        userId: targetUserId,
        channelType,
        channelId,
        agentId: parseInt(agentId),
        messageType: messageType || 'agent',
        content: message,
        metadata: {
          sentBy: req.user.claims.sub,
          humanAgent: true,
          humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
        }
      });

      console.log('Chat history stored with ID:', chatHistoryRecord.id);

      // Broadcast new message to Agent Console via WebSocket
      console.log('Preparing to broadcast to Agent Console...');
      if (typeof (global as any).broadcastToAgentConsole === 'function') {
        const broadcastData = {
          type: 'new_message',
          data: {
            userId: targetUserId,
            channelType,
            channelId,
            agentId: parseInt(agentId),
            userMessage: '',
            aiResponse: message,
            messageType: messageType || 'agent',
            timestamp: new Date().toISOString(),
            humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
          }
        };

        console.log('Broadcasting to Agent Console:', broadcastData);
        (global as any).broadcastToAgentConsole(broadcastData);
        console.log('Broadcasted human agent message to Agent Console');
      } else {
        console.log('broadcastToAgentConsole function not available');
      }

      // Send the message via the appropriate channel
      if (channelType === 'lineoa') {
        try {
          // Get Line channel access token from the specific social integration
          const integrationQuery = `
            SELECT si.channel_access_token, si.channel_id, si.name
            FROM social_integrations si
            WHERE si.agent_id = $1
            AND si.type = 'lineoa'
            AND si.is_verified = true
            ORDER BY si.created_at DESC
            LIMIT 1
          `;
          const integrationResult = await pool.query(integrationQuery, [parseInt(agentId)]);

          if (integrationResult.rows.length > 0) {
            const integration = integrationResult.rows[0];
            console.log('Found Line integration:', {
              name: integration.name,
              channelId: integration.channel_id?.substring(0, 8) + '...',
              hasToken: !!integration.channel_access_token
            });

            if (integration.channel_access_token) {
              const { sendLinePushMessage } = await import('./lineOaWebhook');
              await sendLinePushMessage(channelId, message, integration.channel_access_token);
              console.log('Successfully sent Line message via integration:', integration.name);
            } else {
              console.log('No Channel Access Token found in integration:', integration.name);
            }
          } else {
            console.log('No verified Line integration found for agent:', agentId);
          }
        } catch (error) {
          console.error('Error sending Line message:', error);
        }
      } else if (channelType === 'web') {
        // For web channel, we need to store the message in widget_chat_messages table too
        // because the widget reads from this table
        console.log('Processing web channel message:', {
          targetUserId,
          channelId,
          agentId: parseInt(agentId),
          wsClientsCount: wsClients.size,
          globalWsClientsExists: !!(global.wsClients),
          messageContent: message.substring(0, 50) + '...'
        });

        // CRITICAL: Also store human agent message in widget_chat_messages table
        // This is what the widget actually reads from!
        try {
          console.log('Storing human agent message in widget_chat_messages table...');

          // Insert into widget_chat_messages table
          const widgetMessageQuery = `
            INSERT INTO widget_chat_messages (session_id, role, content, message_type, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING id
          `;

          const widgetMessageValues = [
            targetUserId, // session_id (this is the visitor session ID)
            'assistant', // role (must be 'assistant' to pass DB constraint, but message_type will be 'agent')
            message, // content
            'agent', // message_type (this distinguishes human agent from AI assistant)
            JSON.stringify({
              sentBy: req.user.claims.sub,
              humanAgent: true,
              humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
            }) // metadata
          ];

          const widgetMessageResult = await pool.query(widgetMessageQuery, widgetMessageValues);
          console.log('Human agent message stored in widget_chat_messages with ID:', widgetMessageResult.rows[0].id);

        } catch (widgetStoreError) {
          console.error('Error storing human agent message in widget_chat_messages:', widgetStoreError);
        }

        if (wsClients && wsClients.size > 0) {
          // Create two different message formats for broader compatibility
          const wsMessage = {
            type: 'human_agent_message',
            channelType: 'web',
            channelId: channelId, // This is the widget_key
            agentId: parseInt(agentId),
            userId: targetUserId, // This is the visitor session ID
            message: {
              messageType: 'agent',
              content: message,
              timestamp: new Date().toISOString(),
              humanAgent: true,
              humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
            }
          };

          // Also create a broadcast message that any widget with this channelId can receive
          const broadcastMessage = {
            type: 'human_agent_message',
            channelType: 'web',
            channelId: channelId, // Widget key - all widgets with this key should receive
            agentId: parseInt(agentId),
            userId: 'BROADCAST', // Special userId to indicate this is for any session
            message: {
              messageType: 'agent',
              content: message,
              timestamp: new Date().toISOString(),
              humanAgent: true,
              humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
            }
          };

          console.log('Broadcasting web widget message (specific):', JSON.stringify(wsMessage, null, 2));
          console.log('Broadcasting web widget message (broadcast):', JSON.stringify(broadcastMessage, null, 2));

          let sentCount = 0;
          let openConnections = 0;
          wsClients.forEach((client, index) => {
            console.log(`WebSocket client ${index + 1} readyState:`, client.readyState);
            if (client.readyState === WebSocket.OPEN) {
              openConnections++;
              try {
                // Send both specific and broadcast messages
                client.send(JSON.JSON.stringify(wsMessage));
                client.send(JSON.stringify(broadcastMessage));
                sentCount++;
                console.log(`Sent messages to WebSocket client ${index + 1}`);
              } catch (error) {
                console.log(`Error sending to WebSocket client ${index + 1}:`, error);
                wsClients.delete(client);
              }
            } else {
              wsClients.delete(client);
            }
          });

          console.log(`WebSocket summary - Total clients: ${wsClients.size}, Open: ${openConnections}, Sent: ${sentCount}`);
        } else {
          console.log('No WebSocket clients connected for web channel message');
          console.log('Global WebSocket debugging:', {
            globalWsClientsExists: !!(global.wsClients),
            wsClientsSize: global.wsClients ? global.wsClients.size : 'undefined'
          });
        }
      }

      res.json({
        success: true,
        messageId: chatHistoryRecord.id,
        imageUrl: imageUrl,
        message: "Image sent successfully"
      });
    } catch (error) {
      console.error("Error sending agent console image:", error);
      res.status(500).json({ message: "Failed to send image" });
    }
  });

  // Line Message Template Routes

  // Get all Line message templates for user
  app.get("/api/line-templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = req.query.integrationId ? parseInt(req.query.integrationId) : undefined;

      console.log("Fetching Line templates for user:", userId, "integration:", integrationId);

      const templates = await storage.getLineMessageTemplates(userId, integrationId);
      console.log("Found templates:", templates.length);

      // Get complete template data (with columns and actions) for each template
      const completeTemplates = await Promise.all(
        templates.map(async (template) => {
          const completeTemplate = await storage.getCompleteLineTemplate(template.id, userId);
          return completeTemplate;
        })
      );

      console.log("Complete templates ready:", completeTemplates.length);
      res.json(completeTemplates.filter(t => t !== undefined));
    } catch (error) {
      console.error("Error fetching Line message templates:", error);
      res.status(500).json({ message: "Failed to fetch Line message templates" });
    }
  });

  // Get a specific Line message template with complete data
  app.get("/api/line-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateId = parseInt(req.params.id);

      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const completeTemplate = await storage.getCompleteLineTemplate(templateId, userId);

      if (!completeTemplate) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.json(completeTemplate);
    } catch (error) {
      console.error("Error fetching Line message template:", error);
      res.status(500).json({ message: "Failed to fetch Line message template" });
    }
  });

  // Create a new Line message template with OpenAI embedding
  app.post("/api/line-templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, description, tags, type, integrationId, columns } = req.body;

      // Validate required fields
      if (!name || !type) {
        return res.status(400).json({ message: "Name and type are required" });
      }

      console.log("Creating Line message template:", { userId, name, description, tags, type, integrationId, columnsCount: columns?.length });

      // Generate embedding for description using OpenAI
      let descriptionEmbedding = null;
      if (description) {
        try {
          const openai = new (await import("openai")).default({
            apiKey: process.env.OPENAI_API_KEY,
          });

          const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: description,
          });
          descriptionEmbedding = JSON.stringify(response.data[0].embedding);
          console.log("Generated embedding for template description");
        } catch (error) {
          console.error("Failed to generate embedding:", error);
          // Continue without embedding if OpenAI fails
        }
      }

      // Create the template
      const template = await storage.createLineMessageTemplate({
        userId,
        name,
        description,
        tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
        descriptionEmbedding,
        templateType: type,
        integrationId: integrationId || null,
      });

      // Create columns if provided
      if (columns && Array.isArray(columns)) {
        for (let i = 0; i < columns.length; i++) {
          const column = columns[i];
          const createdColumn = await storage.createLineCarouselColumn({
            templateId: template.id,
            order: i + 1,
            thumbnailImageUrl: column.thumbnailImageUrl || null,
            title: column.title || '',
            text: column.text || '',
          });

          // Create actions for this column
          if (column.actions && Array.isArray(column.actions)) {
            for (let j = 0; j < column.actions.length; j++) {
              const action = column.actions[j];
              await storage.createLineTemplateAction({
                columnId: createdColumn.id,
                order: j + 1,
                type: action.type,
                label: action.label || '',
                uri: action.uri || null,
                data: action.data || null,
                text: action.text || null,
              });
            }
          }
        }
      }

      // Return the complete template
      const completeTemplate = await storage.getCompleteLineTemplate(template.id, userId);
      res.status(201).json(completeTemplate);
    } catch (error) {
      console.error("Error creating Line message template:", error);
      res.status(500).json({ message: "Failed to create Line message template" });
    }
  });

  // Update a Line message template
  app.put("/api/line-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateId = parseInt(req.params.id);
      const { name, description, tags, type, integrationId, columns } = req.body;

      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      console.log("BACKEND UPDATE - Received data:", { templateId, name, description, tags, type, integrationId, columnsCount: columns?.length });
      console.log("BACKEND UPDATE - Tags specifically:", tags);

      // Update the template basic info
      const updateData = {
        name,
        description,
        tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
        templateType: type,
        integrationId: integrationId || null,
      };

      console.log("BACKEND UPDATE - Sending to storage:", updateData);
      const updatedTemplate = await storage.updateLineMessageTemplate(templateId, updateData, userId);
      console.log("BACKEND UPDATE - Updated template result:", updatedTemplate);

      // Handle columns update if provided
      if (columns && Array.isArray(columns)) {
        // Get existing columns
        const existingColumns = await storage.getLineCarouselColumns(templateId);

        // Delete existing columns and actions
        for (const existingColumn of existingColumns) {
          const existingActions = await storage.getLineTemplateActions(existingColumn.id);
          for (const action of existingActions) {
            await storage.deleteLineTemplateAction(action.id);
          }
          await storage.deleteLineCarouselColumn(existingColumn.id);
        }

        // Create new columns
        for (let i = 0; i < columns.length; i++) {
          const column = columns[i];
          const createdColumn = await storage.createLineCarouselColumn({
            templateId: templateId,
            order: i + 1,
            thumbnailImageUrl: column.thumbnailImageUrl || null,
            title: column.title || '',
            text: column.text || '',
          });

          // Create actions for this column
          if (column.actions && Array.isArray(column.actions)) {
            for (let j = 0; j < column.actions.length; j++) {
              const action = column.actions[j];
              await storage.createLineTemplateAction({
                columnId: createdColumn.id,
                order: j + 1,
                type: action.type,
                label: action.label || '',
                uri: action.uri || null,
                data: action.data || null,
                text: action.text || null,
              });
            }
          }
        }
      }

      // Return the complete updated template
      const completeTemplate = await storage.getCompleteLineTemplate(templateId, userId);
      res.json(completeTemplate);
    } catch (error) {
      console.error("Error updating Line message template:", error);
      res.status(500).json({ message: "Failed to update Line message template" });
    }
  });

  // Delete a Line message template
  app.delete("/api/line-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateId = parseInt(req.params.id);

      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      // Get existing columns to clean up
      const existingColumns = await storage.getLineCarouselColumns(templateId);

      // Delete all actions and columns first
      for (const column of existingColumns) {
        const actions = await storage.getLineTemplateActions(column.id);
        for (const action of actions) {
          await storage.deleteLineTemplateAction(action.id);
        }
        await storage.deleteLineCarouselColumn(column.id);
      }

      // Delete the template
      await storage.deleteLineMessageTemplate(templateId, userId);

      res.json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Error deleting Line message template:", error);
      res.status(500).json({ message: "Failed to delete Line message template" });
    }
  });

  // Line OA Webhook endpoint (no authentication required)
  app.post("/api/line/webhook", handleLineWebhook);

  // Dynamic Line OA Webhook with integration ID for multiple channels
  app.post("/api/line/webhook/:integrationId", async (req: Request, res: Response) => {
    try {
      const integrationId = parseInt(req.params.integrationId);
      if (isNaN(integrationId)) {
        return res.status(400).json({ error: "Invalid integration ID" });
      }

      // Get the specific Line OA integration
      const integration = await storage.getSocialIntegrationById(integrationId);
      if (!integration || integration.type !== "lineoa" || !integration.isActive) {
        console.log(`Line OA integration ${integrationId} not found or inactive`);
        return res.status(404).json({ error: "Line OA integration not found or inactive" });
      }

      console.log(`Line webhook received for integration ${integrationId} (${integration.name})`);
      console.log(`Integration verified status: ${integration.isVerified}`);
      console.log(`Last verified: ${integration.lastVerifiedAt || 'Never'}`);

      // Temporarily modify the request to include integration info for handleLineWebhook
      (req as any).lineIntegration = integration;

      // Call the existing webhook handler
      return await handleLineWebhook(req, res);
    } catch (error) {
      console.error("Dynamic Line webhook error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin debug endpoint for Line OA integrations
  app.get("/api/admin/line-integrations/debug", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Get all Line OA integrations for this user
      const integrations = await db
        .select()
        .from(socialIntegrations)
        .where(
          and(
            eq(socialIntegrations.userId, userId),
            eq(socialIntegrations.type, "lineoa")
          )
        );

      const debugInfo = integrations.map(integration => ({
        id: integration.id,
        name: integration.name,
        channelId: integration.channelId,
        botUserId: integration.botUserId,
        isActive: integration.isActive,
        isVerified: integration.isVerified,
        lastVerifiedAt: integration.lastVerifiedAt,
        dynamicWebhookUrl: `/api/line/webhook/${integration.id}`,
        recommendedAction: !integration.isVerified
          ? "ต้อง verify Channel Secret ใหม่ผ่าน Social Integrations page"
          : "พร้อมใช้งาน",
        secretPreview: integration.channelSecret
          ? `${integration.channelSecret.substring(0, 8)}...`
          : "ไม่มี",
        agentId: integration.agentId,
        createdAt: integration.createdAt
      }));

      res.json({
        totalIntegrations: integrations.length,
        integrations: debugInfo,
        instructions: {
          verify: "ไปที่ Social Integrations page และกด 'Test Connection' เพื่อ verify Channel Secret",
          webhook: "ใช้ dynamic webhook URL ในการตั้งค่า Line Developer Console",
          troubleshoot: "หาก signature ไม่ถูกต้อง ให้ตรวจสอบ Channel Secret ว่าตรงกับ Line Developer Console หรือไม่"
        }
      });
    } catch (error) {
      console.error("Error in Line integrations debug:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add prompt refinement API endpoint
  app.post('/api/prompt-refinement', (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { originalPrompt, personality, profession, responseStyle, specialSkills, documentIds } = req.body;

      if (!originalPrompt) {
        return res.status(400).json({ error: "Original prompt is required" });
      }

      const { promptRefinementService } = await import('./services/promptRefinementService');

      const result = await promptRefinementService.refineSystemPrompt({
        originalPrompt,
        personality: personality || '',
        profession: profession || '',
        responseStyle: responseStyle || '',
        specialSkills: specialSkills || [],
        documentIds: documentIds || [],
        userId
      });

      res.json(result);
    } catch (error) {
      console.error('Error in prompt refinement:', error);
      res.status(500).json({ error: 'Failed to refine prompt' });
    }
  });


  const httpServer = createServer(app);

  // Create WebSocket server on /ws path to avoid conflicts with Vite HMR
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  });

  // LLM Configuration API routes
  app.get("/api/llm/config", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Get current LLM configuration for user
      const configResult = await pool.query(`
        SELECT provider, embedding_provider, config_data, created_at, updated_at
        FROM llm_config
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `, [userId]);

      if (configResult.rows.length === 0) {
        // Return default configuration
        return res.json({
          provider: "OpenAI",
          embeddingProvider: "OpenAI",
          openAIConfig: {
            model: "gpt-4o",
            temperature: 0.7,
            maxTokens: 4000,
          },
          geminiConfig: {
            model: "gemini-2.5-flash",
            temperature: 0.7,
            maxTokens: 4000,
          },
        });
      }

      const config = configResult.rows[0];
      const configData = config.config_data || {};

      res.json({
        provider: config.provider,
        embeddingProvider: config.embedding_provider,
        openAIConfig: configData.openAIConfig || {
          model: "gpt-4o",
          temperature: 0.7,
          maxTokens: 4000,
        },
        geminiConfig: configData.geminiConfig || {
          model: "gemini-2.5-flash",
          temperature: 0.7,
          maxTokens: 4000,
        },
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      });
    } catch (error) {
      console.error("Error fetching LLM config:", error);
      res.status(500).json({ message: "Failed to fetch LLM configuration" });
    }
  });

  app.put("/api/llm/config", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const {
        provider,
        embeddingProvider,
        openAIConfig,
        geminiConfig
      } = req.body;

      // Validate provider options
      if (!["OpenAI", "Gemini"].includes(provider)) {
        return res.status(400).json({ message: "Invalid provider. Must be 'OpenAI' or 'Gemini'" });
      }

      if (!["OpenAI", "Gemini"].includes(embeddingProvider)) {
        return res.status(400).json({ message: "Invalid embedding provider. Must be 'OpenAI' or 'Gemini'" });
      }

      const configData = {
        openAIConfig: openAIConfig || {
          model: "gpt-4o",
          temperature: 0.7,
          maxTokens: 4000,
        },
        geminiConfig: geminiConfig || {
          model: "gemini-2.5-flash",
          temperature: 0.7,
          maxTokens: 4000,
        },
      };

      // Check if user has existing config
      const existingResult = await pool.query(`
        SELECT id FROM llm_config WHERE user_id = $1
      `, [userId]);

      let configResult;
      if (existingResult.rows.length > 0) {
        // Update existing config
        configResult = await pool.query(`
          UPDATE llm_config
          SET provider = $2, embedding_provider = $3, config_data = $4, updated_at = NOW()
          WHERE user_id = $1
          RETURNING provider, embedding_provider, config_data, created_at, updated_at
        `, [userId, provider, embeddingProvider, JSON.stringify(configData)]);
      } else {
        // Create new config
        configResult = await pool.query(`
          INSERT INTO llm_config (user_id, provider, embedding_provider, config_data)
          VALUES ($1, $2, $3, $4)
          RETURNING provider, embedding_provider, config_data, created_at, updated_at
        `, [userId, provider, embeddingProvider, JSON.stringify(configData)]);
      }

      const config = configResult.rows[0];
      res.json({
        provider: config.provider,
        embeddingProvider: config.embedding_provider,
        openAIConfig: configData.openAIConfig,
        geminiConfig: configData.geminiConfig,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      });
    } catch (error) {
      console.error("Error updating LLM config:", error);
      res.status(500).json({ message: "Failed to update LLM configuration" });
    }
  });

  // Store connected WebSocket clients
  const wsClients = new Set<WebSocket>();

  // Also store global reference for widget message broadcasting
  (global as any).wsClients = wsClients;

  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected:', {
      url: req.url,
      origin: req.headers.origin,
      userAgent: req.headers['user-agent']?.substring(0, 50) + '...',
      totalClients: wsClients.size + 1
    });

    wsClients.add(ws);
    console.log('WebSocket clients count:', wsClients.size);

    // Send initial connection confirmation
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to Agent Console WebSocket'
      }));
    }

    // Handle incoming messages from client
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('WebSocket message received:', message);

        // Handle different message types if needed
        if (message.type === 'subscribe') {
          console.log('Client subscribed to Agent Console updates');
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    });

    // Clean up on disconnect
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      wsClients.delete(ws);
      console.log('Remaining WebSocket clients:', wsClients.size);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      wsClients.delete(ws);
      console.log('Remaining WebSocket clients after error:', wsClients.size);
    });
  });

  // Export function to broadcast messages to all connected clients
  (global as any).broadcastToAgentConsole = (message: any) => {
    console.log(`Broadcasting to ${wsClients.size} connected clients:`, message);

    wsClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error('Error sending WebSocket message:', error);
          wsClients.delete(client);
        }
      } else {
        wsClients.delete(client);
      }
    });
  };

  // Public system status routes
  app.get("/api/system/live-chat-status", async (req, res) => {
    try {
      const settings = await storage.getSystemSettings();
      res.json({ enabled: settings.enablePlatformLiveChat || false });
    } catch (error) {
      console.error("Error fetching live chat status:", error);
      res.json({ enabled: true }); // Default to enabled if error
    }
  });

  // Admin settings routes
  app.get("/api/admin/settings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if user is admin
      const user = await storage.getUser(userId);
      if (!user || !user.email?.includes('admin')) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const settings = await storage.getSystemSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching admin settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.put("/api/admin/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if user is admin
      const user = await storage.getUser(userId);
      if (!user || !user.email?.includes('admin')) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const updated = await storage.updateSystemSettings(req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating admin settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });


  return httpServer;
}


// Helper function to calculate CSAT score (mock implementation)
async function calculateCSATScore(
  userId: string,
  channelType: string,
  channelId: string,
  agentId?: number
): Promise<number | undefined> {
  try {
    // In a real scenario, this function would interact with an AI model
    // to analyze the conversation and determine a CSAT score.
    // For now, we'll return a mock score based on some simple criteria.

    let score = 50; // Default score

    // Example logic: check for negative keywords in the last few messages
    const history = await storage.getChatHistory(userId, channelType, channelId, agentId, 5);
    const negativeKeywords = ["problem", "issue", "error", "frustrated", "difficult"];

    for (const message of history.slice(-3)) { // Check last 3 messages
      if (negativeKeywords.some(keyword => message.content.toLowerCase().includes(keyword))) {
        score -= 15; // Decrease score for negative sentiment
        break;
      }
    }

    // Ensure score is within bounds [0, 100]
    score = Math.max(0, Math.min(100, score));

    console.log(`Mock CSAT calculation for ${userId}/${channelId}: ${score}%`);
    return score;
  } catch (error) {
    console.error("Mock CSAT calculation error:", error);
    return undefined; // Return undefined if calculation fails
  }
}