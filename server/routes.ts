import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import OpenAI from "openai";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { setupMicrosoftAuth, isMicrosoftAuthenticated } from "./microsoftAuth";
import { registerHrApiRoutes } from "./hrApi";
import { handleLineWebhook, sendLineImageMessage } from "./lineOaWebhook";
import { pool, db } from "./db";
import { agentChatbots } from "@shared/schema";
import { eq } from "drizzle-orm";
import { GuardrailsService } from "./services/guardrails";

// Initialize OpenAI for CSAT analysis
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Function to calculate CSAT score using OpenAI with agent memory limits
async function calculateCSATScore(userId: string, channelType: string, channelId: string, agentId?: number): Promise<number | undefined> {
  try {
    console.log("🎯 Starting CSAT calculation for:", { 
      userId, 
      channelType, 
      channelId: channelId.substring(0, 8) + '...',
      agentId 
    });

    // Get agent memory limit if agentId is provided
    let messageLimit = 20; // Default limit
    if (agentId) {
      try {
        const [agent] = await db.select().from(agentChatbots).where(eq(agentChatbots.id, agentId));
        if (agent && agent.memoryLimit) {
          messageLimit = agent.memoryLimit;
          console.log("📊 Using agent memory limit:", messageLimit);
        }
      } catch (error) {
        console.log("⚠️ Could not fetch agent memory limit, using default:", messageLimit);
      }
    }

    // Get recent chat history for analysis using the same memory strategy as agent
    const messages = await storage.getChatHistoryWithMemoryStrategy(userId, channelType, channelId, agentId, messageLimit);

    console.log("📊 Retrieved messages for CSAT:", messages.length);

    if (messages.length < 3) {
      console.log("⚠️ Not enough messages for CSAT analysis:", messages.length);
      return undefined;
    }

    // Format conversation for OpenAI - only include user and agent messages for CSAT analysis
    const conversationText = messages
      .filter(msg => msg.messageType === 'user' || msg.messageType === 'agent' || msg.messageType === 'assistant')
      .map(msg => {
        const role = msg.messageType === 'user' ? 'Customer' : 
                     msg.messageType === 'agent' ? 'Human Agent' : 'AI Agent';
        return `${role}: ${msg.content}`;
      }).join('\n\n');

    console.log("💬 Conversation sample for CSAT:", conversationText.substring(0, 200) + '...');

    const prompt = `
      ประเมิน Customer Satisfaction Score (CSAT) จากการสนทนาต่อไปนี้:

      ${conversationText}

      กรุณาวิเคราะห์ระดับความพึงพอใจของลูกค้าจากการสนทนานี้ โดยพิจารณาจาก:
      1. ความเป็นมิตรและสุภาพของลูกค้า
      2. การแสดงความพึงพอใจหรือไม่พึงพอใจ
      3. การตอบสนองต่อการให้บริการ
      4. ความเต็มใจในการใช้บริการต่อ
      5. การแสดงความรู้สึกเชิงบวกหรือลบ

      ให้คะแนน CSAT เป็นตัวเลข 0-100 เท่านั้น โดยที่:
      - 0-30: ลูกค้าไม่พอใจมาก (มีการแสดงความโกรธ ผิดหวัง หรือต้องการยกเลิก)
      - 31-50: ลูกค้าไม่พอใจ (มีความกังวล ไม่แน่ใจ หรือต้องการความช่วยเหลือเพิ่มเติม)
      - 51-70: ลูกค้าพอใจปานกลาง (ยอมรับคำตอบ แต่ไม่แสดงความกระตือรือร้น)
      - 71-85: ลูกค้าพอใจ (แสดงความขอบคุณ พอใจกับการให้บริการ)
      - 86-100: ลูกค้าพอใจมาก (แสดงความประทับใจ ชื่นชม หรือแนะนำให้คนอื่น)

      ตอบเป็นตัวเลขเท่านั้น ไม่ต้องมีคำอธิบาย:
    `;

    console.log("🤖 Sending request to OpenAI for CSAT analysis...");

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
      temperature: 0.1
    });

    const scoreText = response.choices[0].message.content?.trim();
    const score = parseInt(scoreText || '0');

    console.log("🎯 CSAT Score calculated:", { scoreText, score });

    return isNaN(score) ? undefined : Math.max(0, Math.min(100, score));
  } catch (error) {
    console.error("❌ Error calculating CSAT score:", error);
    return undefined;
  }
}

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

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);
  await setupMicrosoftAuth(app);

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

  // Serve widget embed script
  app.get("/widget/:widgetKey/embed.js", async (req, res) => {
    try {
      const { widgetKey } = req.params;
      const { chatWidgets } = await import("@shared/schema");

      // Verify widget exists and is active
      const [widget] = await db
        .select()
        .from(chatWidgets)
        .where(eq(chatWidgets.widgetKey, widgetKey))
        .limit(1);

      if (!widget || !widget.isActive) {
        return res.status(404).send("// Widget not found or inactive");
      }

      // Read and serve the embed script
      const fs = await import("fs");
      const path = await import("path");
      const embedScript = fs.readFileSync(
        path.join(process.cwd(), "public", "widget", "embed.js"),
        "utf8",
      );

      res.setHeader("Content-Type", "application/javascript");
      // Disable cache in development for easier debugging
      if (process.env.NODE_ENV === "development") {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
      res.send(embedScript);
    } catch (error) {
      console.error("Error serving widget embed script:", error);
      res.status(500).send("// Error loading widget script");
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
  app.get("/api/auth/user", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        // Microsoft auth succeeded
        return next();
      }
      // Try Replit auth as fallback
      isAuthenticated(req, res, next);
    });
  }, async (req: any, res) => {
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
  app.get("/api/user/profile", (req: any, res: any, next: any) => {
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

      // If no name in database, try to get from claims and update
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
  app.put("/api/user/profile", (req: any, res: any, next: any) => {
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
  app.get("/api/stats", (req: any, res: any, next: any) => {
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
          .where(eq(documentUserPermissions.id, permissionId));

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
          .where(eq(documentDepartmentPermissions.id, permissionId));

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
  app.get("/api/documents", (req: any, res: any, next: any) => {
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
      const categoryId = req.query.categoryId
        ? parseInt(req.query.categoryId as string)
        : undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string)
        : undefined;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
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

  // Enhanced document search with semantic capabilities and document name priority
  app.get("/api/documents/search", (req: any, res: any, next: any) => {
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
      const { query, type = "document-priority", massSelectionPercentage = "0.3" } = req.query;

      console.log(`🔍 SEARCH REQUEST: "${query}" (${type}) for user ${userId}`);

      if (!query || query.trim() === "") {
        // Return all documents if no search query
        const documents = await storage.getDocuments(userId, { limit: 1000 });
        console.log(`📂 No search query, returning ${documents.length} documents`);
        return res.json(documents);
      }

      let results = [];
      const massPercentage = parseFloat(massSelectionPercentage);

      switch (type) {
        case "document-priority":
        case "keyword-name-priority":
        case "filename-only":
          // Enhanced search that prioritizes document names, then keywords, then semantic (when enabled)
          const searchFileName = req.query.searchFileName === 'true';
          const searchKeyword = req.query.searchKeyword === 'true'; 
          const searchMeaning = req.query.searchMeaning === 'true';
          const massPercentage = parseFloat(req.query.massSelectionPercentage as string) || 0.6;

          results = await documentNamePrioritySearchService.searchDocuments(
            query,
            userId,
            type,
            massPercentage
          );
          break;

        case "keyword":
          results = await semanticSearchServiceV2.searchDocuments(
            query,
            userId,
            Math.min(50, Math.floor(100 * massPercentage)),
            undefined,
            "keyword",
            massPercentage
          );
          break;

        case "semantic":
          results = await semanticSearchServiceV2.searchDocuments(
            query,
            userId,
            Math.min(50, Math.floor(100 * massPercentage)),
            undefined,
            "semantic",
            massPercentage
          );
          break;

        case "hybrid":
        default:
          results = await semanticSearchServiceV2.searchDocuments(
            query,
            userId,
            Math.min(50, Math.floor(100 * massPercentage)),
            undefined,
            "smart-hybrid",
            massPercentage
          );
          break;
      }

      console.log(`✅ SEARCH COMPLETE: Returning ${results.length} results for "${query}"`);
      res.json(results);
    } catch (error) {
      console.error("Error in document search:", error);
      res.status(500).json({ message: "Search failed", error: error.message });
    }
  });

  // Create WebSocket server for real-time communication
  const server = createServer(app);
  return server;
}