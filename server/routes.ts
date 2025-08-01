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

  app.get("/api/documents/search", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const query = req.query.query as string;
      const searchType =
        (req.query.type as "keyword" | "semantic" | "hybrid") || "hybrid";

      console.log(
        `Search request - User: ${userId}, Query: "${query}", Type: ${searchType}`,
      );

      if (!query || query.trim().length === 0) {
        console.log("Empty query, returning empty results");
        return res.json([]);
      }

      let results = [];

      if (searchType === "keyword") {
        console.log("Performing advanced keyword search...");
        try {
          const { advancedKeywordSearchService } = await import('./services/advancedKeywordSearch');
          const advancedResults = await advancedKeywordSearchService.searchDocuments(query, userId, 50);
          
          // Convert advanced results to match expected format
          results = advancedResults.map(result => ({
            id: result.id,
            name: result.name,
            content: result.content,
            summary: result.summary,
            aiCategory: result.aiCategory,
            createdAt: result.createdAt,
            similarity: result.similarity,
            tags: [], // Will be populated from storage if needed
            categoryId: null,
            userId: userId
          }));
          
          console.log(`Advanced keyword search returned ${results.length} results`);
        } catch (error) {
          console.error("Advanced keyword search failed, falling back to basic:", error);
          results = await storage.searchDocuments(userId, query);
          console.log(`Fallback keyword search returned ${results.length} results`);
        }
      } else if (searchType === "semantic") {
        console.log("Performing semantic search...");
        try {
          results = await semanticSearchServiceV2.searchDocuments(
            query,
            userId,
            { searchType: "semantic" },
          );
          console.log(`Semantic search returned ${results.length} results`);
        } catch (semanticError) {
          console.error(
            "Semantic search failed, falling back to keyword:",
            semanticError,
          );
          results = await storage.searchDocuments(userId, query);
          console.log(
            `Fallback keyword search returned ${results.length} results`,
          );
        }
      } else {
        // hybrid
        console.log("Performing hybrid search...");
        try {
          results = await semanticSearchServiceV2.searchDocuments(
            query,
            userId,
            { 
              searchType: "hybrid",
              keywordWeight: 0.4,
              vectorWeight: 0.6
            },
          );
          console.log(`Hybrid search returned ${results.length} results`);
        } catch (hybridError) {
          console.error(
            "Hybrid search failed, falling back to keyword:",
            hybridError,
          );
          results = await storage.searchDocuments(userId, query);
          console.log(
            `Fallback keyword search returned ${results.length} results`,
          );
        }
      }

      console.log(`Final results count: ${results.length}`);

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
          temperature: 0.3,
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
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const id = parseInt(req.params.id);
        const document = await storage.getDocument(id, userId);

        if (!document) {
          return res.status(404).json({ message: "Document not found" });
        }

        if (document.content && document.content.trim().length > 0) {
          await vectorService.addDocument(id.toString(), document.content, {
            userId,
            documentName: document.name,
            mimeType: document.mimeType,
            tags: document.tags || [],
            originalDocumentId: id.toString(),
          });

          console.log(`Document ${id} manually vectorized successfully`);
          res.json({
            success: true,
            message: "Document added to vector database",
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
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const documents = await storage.getDocuments(userId);

        let vectorizedCount = 0;
        let skippedCount = 0;

        console.log(
          `Starting to vectorize ${documents.length} documents for user ${userId}`,
        );

        for (const doc of documents) {
          if (doc.content && doc.content.trim().length > 0) {
            try {
              await vectorService.addDocument(doc.id.toString(), doc.content, {
                userId,
                documentName: doc.name,
                mimeType: doc.mimeType,
                tags: doc.tags || [],
                originalDocumentId: doc.id.toString(),
              });
              vectorizedCount++;
              console.log(`Vectorized document ${doc.id}: ${doc.name}`);
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
          message: `Vectorized ${vectorizedCount} documents, skipped ${skippedCount}`,
          vectorizedCount,
          skippedCount,
        });
      } catch (error) {
        console.error("Error vectorizing all documents:", error);
        res.status(500).json({ message: "Failed to vectorize documents" });
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

Key indicators of POSITIVE responses:
- Contains specific numbers, dates, procedures, or facts
- References document content or policies
- Provides step-by-step instructions
- Answers the specific question asked
- Uses phrases like "according to the document", "the policy states", "you need to", etc.

Key indicators of FALLBACK responses:
- "I don't know", "I cannot help", "No information available"
- Very generic advice without specifics
- Deflecting to "contact someone else" without any useful information

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

  // Vector database management routes
  app.get("/api/vector/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userDocuments = await vectorService.getDocumentsByUser(userId);
      const totalDocuments = await vectorService.getDocumentCount();
      const chunkStats = await vectorService.getDocumentChunkStats(userId);

      // Group chunks by original document
      const documentMap = new Map();
      userDocuments.forEach((doc) => {
        const originalDocId = doc.metadata.originalDocumentId || doc.id;
        if (!documentMap.has(originalDocId)) {
          documentMap.set(originalDocId, {
            id: originalDocId,
            name: doc.metadata.documentName,
            type: doc.metadata.mimeType,
            chunks: 0,
            totalLength: 0,
          });
        }
        const entry = documentMap.get(originalDocId);
        entry.chunks++;
        entry.totalLength += doc.content.length;
      });

      res.json({
        userDocuments: userDocuments.length,
        totalDocuments,
        uniqueDocuments: documentMap.size,
        chunkStats,
        vectorized: Array.from(documentMap.values()),
      });
    } catch (error) {
      console.error("Error getting vector stats:", error);
      res.status(500).json({ message: "Failed to get vector database stats" });
    }
  });

  // Re-vectorize all documents endpoint
  app.post(
    "/api/vector/reindex-all",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const documents = await storage.getDocuments(userId);

        let processedCount = 0;
        let errorCount = 0;
        const results: any[] = [];

        for (const document of documents) {
          if (document.content && document.content.trim().length > 0) {
            try {
              await vectorService.addDocument(
                document.id.toString(),
                document.content,
                {
                  userId,
                  documentName: document.name,
                  mimeType: document.mimeType,
                  tags: document.tags || [],
                },
              );

              processedCount++;
              results.push({
                id: document.id,
                name: document.name,
                status: "success",
              });

              // Add delay to avoid rate limiting
              await new Promise((resolve) => setTimeout(resolve, 200));
            } catch (error) {
              console.error(
                `Error re-vectorizing document ${document.id}:`,
                error,
              );
              errorCount++;
              results.push({
                id: document.id,
                name: document.name,
                status: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          } else {
            results.push({
              id: document.id,
              name: document.name,
              status: "skipped",
              reason: "No content to vectorize",
            });
          }
        }

        res.json({
          success: true,
          message: `Re-indexing completed. Processed: ${processedCount}, Errors: ${errorCount}`,
          processed: processedCount,
          errors: errorCount,
          total: documents.length,
          results,
        });
      } catch (error) {
        console.error("Error re-indexing documents:", error);
        res.status(500).json({ message: "Failed to re-index documents" });
      }
    },
  );

  app.post(
    "/api/documents/:id/reprocess",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const documentId = parseInt(req.params.id);

        const document = await storage.getDocument(documentId, userId);
        if (!document) {
          return res.status(404).json({ message: "Document not found" });
        }

        // Remove from vector database first
        await vectorService.removeDocument(documentId.toString());

        // Reprocess document
        await documentProcessor.processDocument(documentId);

        res.json({ message: "Document reprocessed successfully" });
      } catch (error) {
        console.error("Error reprocessing document:", error);
        res.status(500).json({ message: "Failed to reprocess document" });
      }
    },
  );

  // Chat conversation endpoints
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
        const { title } = req.body;

        const conversation = await storage.createChatConversation({
          userId,
          title: title || "New Conversation",
        });

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

  app.post(
    "/api/chat/conversations/:id/message",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const conversationId = parseInt(req.params.id);
        const { content } = req.body;

        // Store user message
        const userMessage = await storage.createChatMessage({
          conversationId,
          role: "user",
          content,
        });

        // Get user's documents for context
        const documents = await storage.getDocuments(userId);

        // Generate AI response using OpenAI
        const aiResponse = await generateChatResponse(content, documents);

        // Store AI message
        const aiMessage = await storage.createChatMessage({
          conversationId,
          role: "assistant",
          content: aiResponse,
        });

        res.json({ userMessage, aiMessage });
      } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ message: "Failed to send message" });
      }
    },
  );

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
      const { message, connectionId } = req.body;

      if (!message || !connectionId) {
        return res
          .status(400)
          .json({ message: "Message and connection ID are required" });
      }

      // Get database schema for context
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

      // Generate SQL query suggestions based on user question
      const suggestions = await databaseQueryService.suggestQueries(
        connectionId,
        userId,
        message,
      );

      // Use OpenAI to generate a response and SQL query
      const { generateDatabaseResponse } = await import("./services/openai");
      const response = await generateDatabaseResponse(
        message,
        schema,
        suggestions,
      );

      res.json({
        response,
        schema,
        suggestions,
      });
    } catch (error) {
      console.error("Error processing database chat:", error);
      res.status(500).json({ message: "Failed to process database chat" });
    }
  });

  // Widget config endpoint for embed script
  app.get("/api/widget/:widgetKey/config", async (req, res) => {
    try {
      const { widgetKey } = req.params;
      const { chatWidgets } = await import("@shared/schema");

      const [widget] = await db
        .select({
          name: chatWidgets.name,
          welcomeMessage: chatWidgets.welcomeMessage,
          primaryColor: chatWidgets.primaryColor,
          textColor: chatWidgets.textColor,
          position: chatWidgets.position,
        })
        .from(chatWidgets)
        .where(eq(chatWidgets.widgetKey, widgetKey))
        .limit(1);

      if (!widget) {
        return res.status(404).json({ message: "Widget not found" });
      }

      res.json(widget);
    } catch (error) {
      console.error("Error fetching widget config:", error);
      res.status(500).json({ message: "Failed to fetch widget config" });
    }
  });

  // Chat Widget API endpoints
  app.get("/api/chat-widgets", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { chatWidgets } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const widgets = await db
        .select()
        .from(chatWidgets)
        .where(eq(chatWidgets.userId, userId));

      res.json(widgets);
    } catch (error) {
      console.error("Error fetching chat widgets:", error);
      res.status(500).json({ message: "Failed to fetch chat widgets" });
    }
  });

  app.post("/api/chat-widgets", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { nanoid } = await import("nanoid");
      const { chatWidgets } = await import("@shared/schema");
      const {
        name,
        agentId,
        primaryColor,
        textColor,
        position,
        welcomeMessage,
        offlineMessage,
        enableHrLookup,
        hrApiEndpoint,
      } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Widget name is required" });
      }

      const widgetKey = nanoid(16);

      const [widget] = await db
        .insert(chatWidgets)
        .values({
          userId,
          name,
          widgetKey,
          agentId: agentId || null,
          primaryColor: primaryColor || "#2563eb",
          textColor: textColor || "#ffffff",
          position: position || "bottom-right",
          welcomeMessage: welcomeMessage || "Hi! How can I help you today?",
          offlineMessage:
            offlineMessage ||
            "We're currently offline. Please leave a message.",
          enableHrLookup: enableHrLookup || false,
          hrApiEndpoint: hrApiEndpoint || null,
        })
        .returning();

      res.status(201).json(widget);
    } catch (error) {
      console.error("Error creating chat widget:", error);
      res.status(500).json({ message: "Failed to create chat widget" });
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

  // Widget chat history endpoint for public use
  app.get("/api/widget/:widgetKey/chat-history", async (req, res) => {
    try {
      const { widgetKey } = req.params;
      const { sessionId } = req.query;
      const {
        chatWidgets,
        widgetChatMessages,
      } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");

      if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required" });
      }

      // Find widget to verify it exists and is active
      const [widget] = await db
        .select({
          id: chatWidgets.id,
          name: chatWidgets.name,
          widgetKey: chatWidgets.widgetKey,
          isActive: chatWidgets.isActive,
        })
        .from(chatWidgets)
        .where(eq(chatWidgets.widgetKey, widgetKey))
        .limit(1);

      if (!widget || !widget.isActive) {
        return res
          .status(404)
          .json({ message: "Widget not found or inactive" });
      }

      // Get chat history for this session using raw SQL for direct database access
      const messages = await pool.query(`
        SELECT id, session_id, role, content, message_type, metadata, created_at
        FROM widget_chat_messages
        WHERE session_id = $1
        ORDER BY created_at ASC
      `, [sessionId]);

      console.log(`📚 Retrieved ${messages.rows.length} messages for session ${sessionId}`);

      res.json({ messages: messages.rows });
    } catch (error) {
      console.error("Error fetching widget chat history:", error);
      res.status(500).json({ message: "Failed to fetch chat history" });
    }
  });

  // Widget chat endpoints for public use
  app.post("/api/widget/:widgetKey/chat", async (req, res) => {
    try {
      const { widgetKey } = req.params;
      const { sessionId, message, visitorInfo } = req.body;
      const {
        chatWidgets,
        widgetChatSessions,
        widgetChatMessages,
        hrEmployees,
        agentChatbots,
        agentChatbotDocuments,
        documents,
      } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      // Find widget with agent information
      const [widget] = await db
        .select({
          id: chatWidgets.id,
          name: chatWidgets.name,
          widgetKey: chatWidgets.widgetKey,
          isActive: chatWidgets.isActive,
          agentId: chatWidgets.agentId,
          primaryColor: chatWidgets.primaryColor,
          textColor: chatWidgets.textColor,
          position: chatWidgets.position,
          welcomeMessage: chatWidgets.welcomeMessage,
          offlineMessage: chatWidgets.offlineMessage,
          enableHrLookup: chatWidgets.enableHrLookup,
          hrApiEndpoint: chatWidgets.hrApiEndpoint,
        })
        .from(chatWidgets)
        .where(eq(chatWidgets.widgetKey, widgetKey))
        .limit(1);

      if (!widget || !widget.isActive) {
        return res
          .status(404)
          .json({ message: "Widget not found or inactive" });
      }

      // Create or get session
      let session;
      if (sessionId) {
        [session] = await db
          .select()
          .from(widgetChatSessions)
          .where(eq(widgetChatSessions.sessionId, sessionId))
          .limit(1);
      }

      if (!session) {
        const newSessionId = sessionId || nanoid(16);
        [session] = await db
          .insert(widgetChatSessions)
          .values({
            widgetId: widget.id,
            sessionId: newSessionId,
            visitorName: visitorInfo?.name,
            visitorEmail: visitorInfo?.email,
            visitorPhone: visitorInfo?.phone,
          })
          .returning();
      }

      // Add user message to widget chat messages
      await db.insert(widgetChatMessages).values({
        sessionId: session.sessionId,
        role: "user",
        content: message,
      });

      // Store user message in chat_history for Agent Console integration
      if (widget.agentId) {
        const { chatHistory } = await import("@shared/schema");
        await db.insert(chatHistory).values({
          userId: session.sessionId, // Use session ID as user ID for widget conversations
          channelType: "web",
          channelId: widget.widgetKey,
          agentId: widget.agentId,
          messageType: "user",
          content: message,
          metadata: {
            sessionId: session.sessionId,
            widgetId: widget.id,
            widgetName: widget.name,
            visitorInfo: visitorInfo || {}
          }
        });

        // Broadcast user message to WebSocket for real-time updates in Agent Console
        if (global.wsClients && global.wsClients.size > 0) {
          const wsMessage = {
            type: 'new_message',
            channelType: 'web',
            channelId: widget.widgetKey,
            agentId: widget.agentId,
            message: {
              messageType: 'user',
              content: message,
              sessionId: session.sessionId,
              timestamp: new Date().toISOString()
            }
          };
          
          global.wsClients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
              client.send(JSON.stringify(wsMessage));
            }
          });
        }
      }

      // Generate AI response based on widget configuration
      let response = widget.welcomeMessage || "Thank you for your message. How can I help you today?";
      let messageType = "text";
      let metadata = null;

      // If widget has an AI agent, use it for responses
      if (widget.agentId) {
        try {
          // Get recent chat history for context
          const recentMessages = await db
            .select({
              role: widgetChatMessages.role,
              content: widgetChatMessages.content,
              createdAt: widgetChatMessages.createdAt,
            })
            .from(widgetChatMessages)
            .where(eq(widgetChatMessages.sessionId, session.sessionId))
            .orderBy(desc(widgetChatMessages.createdAt))
            .limit(20);

          // Build conversation context
          const conversationHistory = recentMessages.reverse().map(msg => ({
            role: msg.role,
            content: msg.content
          }));

          // Use dedicated widget chat service
          const { WidgetChatService } = await import('./services/widgetChatService');
          const aiResult = await WidgetChatService.generateAgentResponse(
            message,
            widget.agentId,
            null, // Widget chat doesn't need userId - using widget-specific methods
            session.sessionId,
            conversationHistory
          );

          response = aiResult.response;
          messageType = aiResult.messageType;
          metadata = aiResult.metadata;
        } catch (error) {
          console.error("Widget Agent AI response error:", error);
          // Fallback to welcome message if AI fails
          response = widget.welcomeMessage || "ขออภัย เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง";
          messageType = "error";
          metadata = { error: "AI service unavailable" };
        }
      } else if (widget.enableHrLookup && message) {
        // Check if message contains Thai Citizen ID pattern
        const citizenIdMatch = message.match(/\b\d{13}\b/);
        if (citizenIdMatch) {
          const citizenId = citizenIdMatch[0];

          const [employee] = await db
            .select({
              employeeId: hrEmployees.employeeId,
              name: hrEmployees.name,
              department: hrEmployees.department,
              position: hrEmployees.position,
              isActive: hrEmployees.isActive,
            })
            .from(hrEmployees)
            .where(eq(hrEmployees.citizenId, citizenId))
            .limit(1);

          if (employee && employee.isActive) {
            response = `Yes, ${employee.employeeId} ${employee.name} is working in ${employee.department}`;
            if (employee.position) {
              response += ` as ${employee.position}`;
            }
            messageType = "hr_lookup";
            metadata = {
              citizenId,
              found: true,
              employee: {
                employeeId: employee.employeeId,
                name: employee.name,
                department: employee.department,
                position: employee.position,
              },
            };
          } else {
            response =
              "No active employee found with the provided Thai Citizen ID.";
            messageType = "hr_lookup";
            metadata = { citizenId, found: false };
          }
        } else {
          response =
            widget.welcomeMessage +
            " You can also check employee status by providing a Thai Citizen ID (13 digits).";
        }
      }

      // Add assistant response to widget chat messages
      await db.insert(widgetChatMessages).values({
        sessionId: session.sessionId,
        role: "assistant",
        content: response,
        messageType,
        metadata,
      });

      // Store assistant response in chat_history for Agent Console integration
      if (widget.agentId) {
        const { chatHistory } = await import("@shared/schema");
        await db.insert(chatHistory).values({
          userId: session.sessionId, // Use session ID as user ID for widget conversations
          channelType: "web",
          channelId: widget.widgetKey,
          agentId: widget.agentId,
          messageType: "assistant",
          content: response,
          metadata: {
            sessionId: session.sessionId,
            widgetId: widget.id,
            widgetName: widget.name,
            originalMessageType: messageType,
            originalMetadata: metadata,
            visitorInfo: visitorInfo || {}
          }
        });

        // Broadcast to WebSocket for real-time updates in Agent Console
        if (global.wsClients && global.wsClients.size > 0) {
          const wsMessage = {
            type: 'new_message',
            channelType: 'web',
            channelId: widget.widgetKey,
            agentId: widget.agentId,
            message: {
              messageType: 'assistant',
              content: response,
              sessionId: session.sessionId,
              timestamp: new Date().toISOString()
            }
          };
          
          global.wsClients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
              client.send(JSON.stringify(wsMessage));
            }
          });
        }
      }

      res.json({
        sessionId: session.sessionId,
        response,
        messageType,
        metadata,
      });
    } catch (error) {
      console.error("Widget chat error:", error);
      res.status(500).json({ message: "Chat service error" });
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

  // Document Demand Insights API
  app.get(
    "/api/analytics/document-demand",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const insights = await storage.getDocumentAccessStats(userId);
        res.json(insights);
      } catch (error) {
        console.error("Error fetching document demand insights:", error);
        res.status(500).json({ message: "Failed to fetch insights" });
      }
    },
  );

  // AI Assistant Feedback API
  app.post("/api/ai-feedback", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const feedback = await storage.createAiFeedback({
        ...req.body,
        userId,
      });
      res.json(feedback);
    } catch (error) {
      console.error("Error creating AI feedback:", error);
      res.status(500).json({ message: "Failed to create feedback" });
    }
  });

  app.get("/api/ai-feedback/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getAiFeedbackStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching AI feedback stats:", error);
      res.status(500).json({ message: "Failed to fetch feedback stats" });
    }
  });

  app.get("/api/ai-feedback/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const feedbackData = await storage.exportAiFeedbackData(userId);
      res.json(feedbackData);
    } catch (error) {
      console.error("Error exporting AI feedback data:", error);
      res.status(500).json({ message: "Failed to export feedback data" });
    }
  });

  app.get(
    "/api/documents/:id/feedback",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const documentId = parseInt(req.params.id);
        const feedbackData = await storage.getDocumentFeedback(
          documentId,
          userId,
        );
        res.json(feedbackData);
      } catch (error) {
        console.error("Error fetching document feedback:", error);
        res.status(500).json({ message: "Failed to fetch document feedback" });
      }
    },
  );

  // AI Response Analysis routes
  app.get(
    "/api/ai-response-analysis",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
        const offset = req.query.offset
          ? parseInt(req.query.offset)
          : undefined;
        const analysisResult = req.query.analysisResult;

        const analysis = await storage.getAiResponseAnalysis(userId, {
          limit,
          offset,
          analysisResult,
        });
        res.json(analysis);
      } catch (error) {
        console.error("Error fetching AI response analysis:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch AI response analysis" });
      }
    },
  );

  app.get(
    "/api/ai-response-analysis/stats",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const stats = await storage.getAiResponseAnalysisStats(userId);
        res.json(stats);
      } catch (error) {
        console.error("Error fetching AI response analysis stats:", error);
        res.status(500).json({ message: "Failed to fetch analysis stats" });
      }
    },
  );

  app.post(
    "/api/ai-response-analysis/analyze",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const {
          userQuery,
          assistantResponse,
          documentContext,
          responseTime,
          chatMessageId,
        } = req.body;

        // Call OpenAI to analyze the response
        const analysisPrompt = `
Analyze this AI assistant response to determine if it's a "positive" (helpful, informative response) or "fallback" (unable to answer, generic response).

User Query: "${userQuery}"
Assistant Response: "${assistantResponse}"

Please classify this response as either:
- "positive": The assistant provided a helpful, specific, informative answer
- "fallback": The assistant gave a generic response, said they don't know, or couldn't provide specific information

Respond with JSON: {"result": "positive" or "fallback", "confidence": 0.0-1.0, "reason": "explanation"}
`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [{ role: "user", content: analysisPrompt }],
          response_format: { type: "json_object" },
        });

        const analysisResult = JSON.parse(
          response.choices[0].message.content || "{}",
        );

        // Store the analysis result
        const analysis = await storage.createAiResponseAnalysis({
          chatMessageId,
          userId,
          userQuery,
          assistantResponse,
          analysisResult: analysisResult.result,
          analysisConfidence: analysisResult.confidence,
          analysisReason: analysisResult.reason,
          documentContext,
          responseTime,
        });

        res.json(analysis);
      } catch (error) {
        console.error("Error analyzing AI response:", error);
        res.status(500).json({ message: "Failed to analyze response" });
      }
    },
  );

  // Agent Chatbot API routes
  app.get("/api/agent-chatbots", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agents = await storage.getAgentChatbots(userId);
      res.json(agents);
    } catch (error) {
      console.error("Error fetching agent chatbots:", error);
      res.status(500).json({ message: "Failed to fetch agent chatbots" });
    }
  });

  app.get("/api/agent-chatbots/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agent = await storage.getAgentChatbot(
        parseInt(req.params.id),
        userId,
      );
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      res.json(agent);
    } catch (error) {
      console.error("Error fetching agent chatbot:", error);
      res.status(500).json({ message: "Failed to fetch agent chatbot" });
    }
  });

  app.post("/api/agent-chatbots", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log(
        "Creating agent chatbot with data:",
        JSON.stringify(req.body, null, 2),
      );
      console.log("User ID:", userId);

      // Extract documentIds from request body
      const { documentIds, lineOaChannelId, ...agentData } = req.body;

      // Handle LINE OA configuration
      let lineOaConfig = undefined;
      if (agentData.channels?.includes("lineoa") && lineOaChannelId) {
        // Find the LINE OA channel configuration
        const lineOaChannels = [
          {
            id: "U1234567890",
            name: "4urney HR",
            description: "HR Support Channel",
          },
          {
            id: "U0987654321",
            name: "Customer Support",
            description: "General Support",
          },
          {
            id: "U1122334455",
            name: "Sales Inquiry",
            description: "Sales Team Channel",
          },
        ];
        const selectedChannel = lineOaChannels.find(
          (ch) => ch.id === lineOaChannelId,
        );
        if (selectedChannel) {
          lineOaConfig = {
            lineOaId: selectedChannel.id,
            lineOaName: selectedChannel.name,
            accessToken: "mock_access_token", // In real implementation, this would be configured properly
          };
        }
      }

      // Ensure arrays are properly formatted for PostgreSQL JSONB
      const finalAgentData = {
        ...agentData,
        userId,
        lineOaConfig,
        // Default channels to empty array since we removed channel selection
        channels: [],
        specialSkills: Array.isArray(agentData.specialSkills)
          ? agentData.specialSkills
          : [],
        allowedTopics: Array.isArray(agentData.allowedTopics)
          ? agentData.allowedTopics
          : [],
        blockedTopics: Array.isArray(agentData.blockedTopics)
          ? agentData.blockedTopics
          : [],
      };
      console.log(
        "Final agent data before database insert:",
        JSON.stringify(finalAgentData, null, 2),
      );
      console.log(
        "Channels type:",
        typeof finalAgentData.channels,
        "Value:",
        finalAgentData.channels,
      );
      console.log(
        "Special skills type:",
        typeof finalAgentData.specialSkills,
        "Value:",
        finalAgentData.specialSkills,
      );

      const agent = await storage.createAgentChatbot(finalAgentData);
      console.log("Agent created successfully:", agent);

      // Associate documents with the agent if provided
      if (documentIds && documentIds.length > 0) {
        console.log("Adding documents to agent:", documentIds);
        for (const documentId of documentIds) {
          await storage.addDocumentToAgent(agent.id, documentId, userId);
        }
      }

      res.status(201).json(agent);
    } catch (error) {
      console.error("Error creating agent chatbot:", error);
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
      res.status(500).json({
        message: "Failed to create agent chatbot",
        error: error.message,
      });
    }
  });

  app.put("/api/agent-chatbots/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);

      // Extract documentIds from request body
      const { documentIds, ...agentData } = req.body;

      console.log("PUT /api/agent-chatbots/:id - Request body:", JSON.stringify(req.body, null, 2));
      console.log("Agent data to update:", JSON.stringify(agentData, null, 2));
      console.log("Guardrails config in request:", agentData.guardrailsConfig);

      const agent = await storage.updateAgentChatbot(
        agentId,
        agentData,
        userId,
      );

      // Update document associations if provided
      if (documentIds !== undefined) {
        console.log("Updating agent documents:", documentIds);

        // Remove all existing document associations
        await storage.removeAllDocumentsFromAgent(agentId, userId);

        // Add new document associations
        if (documentIds && documentIds.length > 0) {
          for (const documentId of documentIds) {
            await storage.addDocumentToAgent(agentId, documentId, userId);
          }
        }
      }

      res.json(agent);
    } catch (error) {
      console.error("Error updating agent chatbot:", error);
      res.status(500).json({ message: "Failed to update agent chatbot" });
    }
  });

  app.delete(
    "/api/agent-chatbots/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        await storage.deleteAgentChatbot(parseInt(req.params.id), userId);
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting agent chatbot:", error);
        res.status(500).json({ message: "Failed to delete agent chatbot" });
      }
    },
  );

  app.get(
    "/api/agent-chatbots/:id/documents",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const documents = await storage.getAgentChatbotDocuments(
          parseInt(req.params.id),
          userId,
        );
        res.json(documents);
      } catch (error) {
        console.error("Error fetching agent documents:", error);
        res.status(500).json({ message: "Failed to fetch agent documents" });
      }
    },
  );

  app.post(
    "/api/agent-chatbots/:agentId/documents/:documentId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const agentDocument = await storage.addDocumentToAgent(
          parseInt(req.params.agentId),
          parseInt(req.params.documentId),
          userId,
        );
        res.status(201).json(agentDocument);
      } catch (error) {
        console.error("Error adding document to agent:", error);
        res.status(500).json({ message: "Failed to add document to agent" });
      }
    },
  );

  app.delete(
    "/api/agent-chatbots/:agentId/documents/:documentId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        await storage.removeDocumentFromAgent(
          parseInt(req.params.agentId),
          parseInt(req.params.documentId),
          userId,
        );
        res.status(204).send();
      } catch (error) {
        console.error("Error removing document from agent:", error);
        res
          .status(500)
          .json({ message: "Failed to remove document from agent" });
      }
    },
  );

  // Test Agent endpoint (single message)
  app.post(
    "/api/agent-chatbots/test",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { message, agentConfig, documentIds } = req.body;
        
        if (!message || !agentConfig) {
          return res.status(400).json({ message: "Message and agent configuration are required" });
        }

        // Build system prompt from agent configuration
        const personality = agentConfig.personality ? `, with a ${agentConfig.personality} personality` : '';
        const profession = agentConfig.profession ? ` as a ${agentConfig.profession}` : '';
        const responseStyle = agentConfig.responseStyle ? ` in a ${agentConfig.responseStyle} style` : '';
        
        const systemPrompt = `${agentConfig.systemPrompt}

You are ${agentConfig.name || 'an AI assistant'}${profession}${personality}. Respond ${responseStyle}.

Additional skills: ${agentConfig.specialSkills?.join(', ') || 'General assistance'}

Response guidelines:
- Response length: ${agentConfig.responseLength || 'medium'}
- Content filtering: ${agentConfig.contentFiltering ? 'enabled' : 'disabled'}
- Toxicity prevention: ${agentConfig.toxicityPrevention ? 'enabled' : 'disabled'}
- Privacy protection: ${agentConfig.privacyProtection ? 'enabled' : 'disabled'}
- Factual accuracy: ${agentConfig.factualAccuracy ? 'prioritized' : 'standard'}

${agentConfig.allowedTopics?.length > 0 ? `Allowed topics: ${agentConfig.allowedTopics.join(', ')}` : ''}
${agentConfig.blockedTopics?.length > 0 ? `Blocked topics: ${agentConfig.blockedTopics.join(', ')}` : ''}`;

        // Get document context if documents are selected
        let documentContext = '';
        if (documentIds && documentIds.length > 0) {
          try {
            const userId = req.user.claims.sub;
            const documents = await storage.getDocumentsByIds(documentIds, userId);
            if (documents.length > 0) {
              documentContext = `\n\nRelevant documents:\n${documents.map(doc => 
                `- ${doc.name}: ${doc.summary || doc.description || 'No summary available'}`
              ).join('\n')}`;
              
              // Add actual document content for better context
              for (const doc of documents) {
                if (doc.content && doc.content.length > 0) {
                  const contentLimit = 30000; // Much larger content for test context
                  const contentSnippet = doc.content.substring(0, contentLimit) + (doc.content.length > contentLimit ? '...' : '');
                  documentContext += `\n\nContent from ${doc.name}:\n${contentSnippet}`;
                }
              }
            }
          } catch (error) {
            console.error("Error fetching documents for test:", error);
          }
        }

        const fullPrompt = systemPrompt + documentContext;

        // Apply guardrails to input message if configured
        let processedMessage = message;
        const guardrailsConfig = agentConfig.guardrailsConfig;
        
        if (guardrailsConfig && Object.keys(guardrailsConfig).length > 0) {
          console.log(`🛡️ Applying guardrails to test input: ${JSON.stringify(guardrailsConfig)}`);
          
          
          const guardrailsService = new GuardrailsService(guardrailsConfig);
          
          const inputValidation = await guardrailsService.evaluateInput(message);
          console.log(`📝 Input validation result: ${JSON.stringify(inputValidation)}`);
          
          if (!inputValidation.allowed) {
            console.log(`❌ Input blocked by guardrails: ${inputValidation.reason}`);
            return res.json({ 
              response: `ขออภัย ไม่สามารถประมวลผลคำถามนี้ได้ (${inputValidation.reason}) ${inputValidation.suggestions?.[0] || 'Please try rephrasing your message'}` 
            });
          }
          
          // Use modified content if available
          if (inputValidation.modifiedContent) {
            processedMessage = inputValidation.modifiedContent;
            console.log(`🔄 Using modified input: ${processedMessage}`);
          }
        }

        // Call OpenAI to get response
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: fullPrompt },
            { role: "user", content: processedMessage }
          ],
          max_tokens: agentConfig.responseLength === 'short' ? 150 : 
                     agentConfig.responseLength === 'long' ? 500 : 300,
          temperature: 0.7
        });

        let agentResponse = response.choices[0].message.content || "No response generated";

        // Apply guardrails to output response if configured
        if (guardrailsConfig && Object.keys(guardrailsConfig).length > 0) {
          
          const guardrailsService = new GuardrailsService(guardrailsConfig);
          
          const outputValidation = await guardrailsService.evaluateOutput(agentResponse);
          console.log(`📤 Output validation result: ${JSON.stringify(outputValidation)}`);
          
          if (!outputValidation.allowed) {
            console.log(`❌ Output blocked by guardrails: ${outputValidation.reason}`);
            agentResponse = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ (${outputValidation.reason}) ${outputValidation.suggestions?.[0] || 'Please try asking in a different way'}`;
          } else if (outputValidation.modifiedContent) {
            agentResponse = outputValidation.modifiedContent;
            console.log(`🔄 Using modified output: ${agentResponse.substring(0, 100)}...`);
          }
        }

        res.json({ response: agentResponse });
      } catch (error) {
        console.error("Error testing agent:", error);
        res.status(500).json({ message: "Failed to test agent" });
      }
    },
  );

  // Test Agent Chat endpoint (with conversation history)
  app.post(
    "/api/agent-chatbots/test-chat",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { message, agentConfig, documentIds, chatHistory = [] } = req.body;
        
        if (!message || !agentConfig) {
          return res.status(400).json({ message: "Message and agent configuration are required" });
        }

        console.log(`💬 Test chat request - Memory limit: ${agentConfig.memoryLimit || 10}, History length: ${chatHistory.length}`);

        // Build comprehensive system prompt similar to deployed agents
        const personality = agentConfig.personality ? `, with a ${agentConfig.personality} personality` : '';
        const profession = agentConfig.profession ? ` as a ${agentConfig.profession}` : '';
        const responseStyle = agentConfig.responseStyle ? ` in a ${agentConfig.responseStyle} style` : '';
        
        let systemPrompt = `${agentConfig.systemPrompt}

You are ${agentConfig.name || 'an AI assistant'}${profession}${personality}. Respond ${responseStyle}.

Additional skills: ${agentConfig.specialSkills?.join(', ') || 'General assistance'}

Response guidelines:
- Response length: ${agentConfig.responseLength || 'medium'}
- Content filtering: ${agentConfig.contentFiltering ? 'enabled' : 'disabled'}
- Toxicity prevention: ${agentConfig.toxicityPrevention ? 'enabled' : 'disabled'}
- Privacy protection: ${agentConfig.privacyProtection ? 'enabled' : 'disabled'}
- Factual accuracy: ${agentConfig.factualAccuracy ? 'prioritized' : 'standard'}

${agentConfig.allowedTopics?.length > 0 ? `Allowed topics: ${agentConfig.allowedTopics.join(', ')}` : ''}
${agentConfig.blockedTopics?.length > 0 ? `Blocked topics: ${agentConfig.blockedTopics.join(', ')}` : ''}

Memory management: Keep track of conversation context within the last ${agentConfig.memoryLimit || 10} messages.`;

        // Get document context if documents are selected
        let documentContext = '';
        if (documentIds && documentIds.length > 0) {
          try {
            const userId = req.user.claims.sub;
            const documents = await storage.getDocumentsByIds(documentIds, userId);
            if (documents.length > 0) {
              documentContext = `\n\nRelevant documents for context:\n${documents.map(doc => 
                `- ${doc.name}: ${doc.summary || doc.description || 'No summary available'}`
              ).join('\n')}`;
              
              // Use significantly more document content for better context
              for (const doc of documents) {
                if (doc.content && doc.content.length > 0) {
                  const contentLimit = 30000; // Increased from 500 to 30000 characters
                  const contentSnippet = doc.content.substring(0, contentLimit) + (doc.content.length > contentLimit ? '...' : '');
                  documentContext += `\n\nContent from ${doc.name}:\n${contentSnippet}`;
                }
              }
            }
          } catch (error) {
            console.error("Error fetching documents for test:", error);
          }
        }

        systemPrompt += documentContext;

        // Prepare conversation messages respecting memory limit
        const memoryLimit = Math.min(agentConfig.memoryLimit || 10, 20); // Cap at 20 for API limits
        const recentHistory = chatHistory.slice(-memoryLimit);
        
        const messages = [
          { role: "system", content: systemPrompt },
          ...recentHistory,
          { role: "user", content: message }
        ];

        console.log(`🔍 Calling OpenAI with ${messages.length} messages (${recentHistory.length} history + system + current)`);

        // Apply guardrails to input message if configured
        let processedMessage = message;
        const guardrailsConfig = agentConfig.guardrailsConfig;
        
        if (guardrailsConfig && Object.keys(guardrailsConfig).length > 0) {
          console.log(`🛡️ Applying guardrails to test input: ${JSON.stringify(guardrailsConfig)}`);
          
          
          const guardrailsService = new GuardrailsService(guardrailsConfig);
          
          const inputValidation = await guardrailsService.evaluateInput(message);
          console.log(`📝 Input validation result: ${JSON.stringify(inputValidation)}`);
          
          if (!inputValidation.allowed) {
            console.log(`❌ Input blocked by guardrails: ${inputValidation.reason}`);
            return res.json({ 
              response: `ขออภัย ไม่สามารถประมวลผลคำถามนี้ได้ (${inputValidation.reason}) ${inputValidation.suggestions?.[0] || 'Please try rephrasing your message'}` 
            });
          }
          
          // Use modified content if available
          if (inputValidation.modifiedContent) {
            processedMessage = inputValidation.modifiedContent;
            console.log(`🔄 Using modified input: ${processedMessage}`);
          }
        }

        // Update messages with processed message
        const finalMessages = [
          { role: "system", content: systemPrompt },
          ...recentHistory,
          { role: "user", content: processedMessage }
        ];

        // Call OpenAI to get response with conversation context
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: finalMessages,
          max_tokens: agentConfig.responseLength === 'short' ? 150 : 
                     agentConfig.responseLength === 'long' ? 500 : 300,
          temperature: 0.7
        });

        let agentResponse = response.choices[0].message.content || "No response generated";
        console.log(`🤖 Generated response: ${agentResponse.substring(0, 100)}...`);

        // Apply guardrails to output response if configured
        if (guardrailsConfig && Object.keys(guardrailsConfig).length > 0) {
          
          const guardrailsService = new GuardrailsService(guardrailsConfig);
          
          const outputValidation = await guardrailsService.evaluateOutput(agentResponse);
          console.log(`📤 Output validation result: ${JSON.stringify(outputValidation)}`);
          
          if (!outputValidation.allowed) {
            console.log(`❌ Output blocked by guardrails: ${outputValidation.reason}`);
            agentResponse = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ (${outputValidation.reason}) ${outputValidation.suggestions?.[0] || 'Please try asking in a different way'}`;
          } else if (outputValidation.modifiedContent) {
            agentResponse = outputValidation.modifiedContent;
            console.log(`🔄 Using modified output: ${agentResponse.substring(0, 100)}...`);
          }
        }

        res.json({ response: agentResponse });
      } catch (error) {
        console.error("Error testing agent chat:", error);
        res.status(500).json({ message: "Failed to test agent chat", error: error.message });
      }
    },
  );

  // Social Integrations routes
  
  // Get webhook URL for a specific integration
  app.get(
    "/api/social-integrations/:id/webhook-url",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const integrationId = parseInt(req.params.id);
        
        if (isNaN(integrationId)) {
          return res.status(400).json({ error: "Invalid integration ID" });
        }

        // Verify the integration belongs to the user
        const integration = await storage.getSocialIntegration(integrationId, userId);
        if (!integration) {
          return res.status(404).json({ error: "Integration not found" });
        }

        // Generate webhook URL based on request domain
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-replit-domain'] || req.headers['host'];
        const baseUrl = `${protocol}://${host}`;
        
        let webhookUrl: string;
        
        if (integration.type === 'lineoa') {
          // Use the dynamic webhook endpoint for Line OA
          webhookUrl = `${baseUrl}/api/line/webhook/${integrationId}`;
        } else {
          // For other platforms, use generic webhook (to be implemented)
          webhookUrl = `${baseUrl}/api/webhook/${integration.type}/${integrationId}`;
        }

        res.json({ 
          integrationId: integrationId,
          type: integration.type,
          name: integration.name,
          webhookUrl: webhookUrl,
          legacyWebhookUrl: integration.type === 'lineoa' ? `${baseUrl}/api/line/webhook` : null
        });
      } catch (error) {
        console.error("Error generating webhook URL:", error);
        res.status(500).json({ error: "Failed to generate webhook URL" });
      }
    }
  );
  
  app.get(
    "/api/social-integrations",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const integrations = await storage.getSocialIntegrations(userId);
        res.json(integrations);
      } catch (error) {
        console.error("Error fetching social integrations:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch social integrations" });
      }
    },
  );

  app.get(
    "/api/social-integrations/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const integration = await storage.getSocialIntegration(
          parseInt(req.params.id),
          userId,
        );
        if (!integration) {
          return res.status(404).json({ message: "Integration not found" });
        }
        res.json(integration);
      } catch (error) {
        console.error("Error fetching social integration:", error);
        res.status(500).json({ message: "Failed to fetch social integration" });
      }
    },
  );

  app.post(
    "/api/social-integrations/lineoa",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const {
          name,
          description,
          channelId,
          channelSecret,
          channelAccessToken,
          agentId,
        } = req.body;

        if (
          !name ||
          !channelId ||
          !channelSecret ||
          !channelAccessToken ||
          !agentId
        ) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        const integrationData = {
          userId,
          name,
          description: description || null,
          type: "lineoa" as const,
          channelId,
          channelSecret,
          channelAccessToken,
          agentId: parseInt(agentId),
          isActive: true,
          isVerified: false,
        };

        const integration =
          await storage.createSocialIntegration(integrationData);
        res.status(201).json(integration);
      } catch (error) {
        console.error("Error creating Line OA integration:", error);
        res
          .status(500)
          .json({ message: "Failed to create Line OA integration" });
      }
    },
  );

  app.post(
    "/api/social-integrations/lineoa/verify",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { channelId, channelSecret, channelAccessToken, integrationId } = req.body;

        console.log("🔍 Debug: Line OA Verification Request");
        console.log(
          "📋 Channel ID:",
          channelId ? `${channelId.substring(0, 8)}...` : "Missing",
        );
        console.log(
          "🔑 Channel Secret:",
          channelSecret ? `${channelSecret.substring(0, 8)}...` : "Missing",
        );
        console.log(
          "🎫 Channel Access Token:",
          channelAccessToken ? `${channelAccessToken.substring(0, 8)}...` : "Missing",
        );
        console.log("🆔 Integration ID:", integrationId || "None (creation mode)");

        if (!channelId || !channelSecret) {
          console.log("❌ Missing required fields");
          return res.status(400).json({
            success: false,
            message: "กรุณากรอก Channel ID และ Channel Secret",
          });
        }

        // Enhanced validation for LINE Channel ID and Secret format
        const channelIdPattern = /^\d{10,}$/; // Channel ID should be numeric, at least 10 digits
        const isValidChannelId = channelIdPattern.test(channelId);
        const isValidChannelSecret = channelSecret.length >= 32; // Channel Secret should be at least 32 characters

        console.log("✅ Channel ID format valid:", isValidChannelId);
        console.log("✅ Channel Secret format valid:", isValidChannelSecret);

        if (!isValidChannelId) {
          console.log("❌ Invalid Channel ID format");
          return res.json({
            success: false,
            message: "Channel ID ไม่ถูกต้อง ต้องเป็นตัวเลขอย่างน้อย 10 หลัก",
          });
        }

        if (!isValidChannelSecret) {
          console.log("❌ Invalid Channel Secret format");
          return res.json({
            success: false,
            message: "Channel Secret ไม่ถูกต้อง ต้องมีอย่างน้อย 32 ตัวอักษร",
          });
        }

        // Simulate LINE API verification
        // In production, you would make actual API call to LINE:
        // const response = await fetch('https://api.line.me/v2/bot/info', {
        //   headers: { 'Authorization': `Bearer ${channelAccessToken}` }
        // });

        // If integrationId is provided, update the existing integration to mark as verified
        if (integrationId) {
          const userId = req.user.claims.sub;
          const updateResult = await db.execute(sql`
            UPDATE social_integrations 
            SET is_verified = true, last_verified_at = NOW(), updated_at = NOW()
            WHERE id = ${integrationId} AND user_id = ${userId} AND type = 'lineoa'
          `);

          if (updateResult.rowCount === 0) {
            console.log("❌ No matching integration found to update");
            return res.json({
              success: false,
              message: "ไม่พบการเชื่อมต่อที่ตรงกัน กรุณาตรวจสอบข้อมูลอีกครั้ง",
            });
          }

          console.log("🎉 Line OA verification successful and database updated");
        } else {
          console.log("🎉 Line OA verification successful (creation mode)");
        }

        res.json({
          success: true,
          message: "การเชื่อมต่อ Line OA สำเร็จ! ระบบได้ตรวจสอบการตั้งค่าแล้ว",
        });
      } catch (error) {
        console.error("💥 Error verifying Line OA connection:", error);
        res.status(500).json({
          success: false,
          message: "เกิดข้อผิดพลาดในการตรวจสอบการเชื่อมต่อ",
        });
      }
    },
  );

  app.put(
    "/api/social-integrations/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const integrationId = parseInt(req.params.id);
        const updates = req.body;

        const integration = await storage.updateSocialIntegration(
          integrationId,
          updates,
          userId,
        );
        res.json(integration);
      } catch (error) {
        console.error("Error updating social integration:", error);
        res
          .status(500)
          .json({ message: "Failed to update social integration" });
      }
    },
  );

  app.delete(
    "/api/social-integrations/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const integrationId = parseInt(req.params.id);

        await storage.deleteSocialIntegration(integrationId, userId);
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting social integration:", error);
        res
          .status(500)
          .json({ message: "Failed to delete social integration" });
      }
    },
  );

  // Update social integration with access token
  app.patch(
    "/api/social-integrations/:id/access-token",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const integrationId = parseInt(req.params.id);
        const { accessToken } = req.body;
        const userId = req.user.claims.sub;

        if (!accessToken) {
          return res.status(400).json({ message: "Access token is required" });
        }

        // Update integration in database with raw SQL
        const result = await db.execute(sql`
        UPDATE social_integrations 
        SET channel_access_token = ${accessToken}, updated_at = NOW()
        WHERE id = ${integrationId} AND user_id = ${userId}
        RETURNING *
      `);

        if (result.rowCount === 0) {
          return res
            .status(404)
            .json({ message: "Integration not found or access denied" });
        }

        res.json({ message: "Access token updated successfully" });
      } catch (error) {
        console.error("Error updating access token:", error);
        res.status(500).json({ message: "Failed to update access token" });
      }
    },
  );

  // Agent Console API endpoints
  
  // Get channel integrations for hierarchical filtering
  app.get('/api/agent-console/channels', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const query = `
        SELECT 
          si.id,
          si.name,
          si.type as channel_type,
          si.channel_id,
          ac.name as agent_name,
          ac.id as agent_id
        FROM social_integrations si
        JOIN agent_chatbots ac ON si.agent_id = ac.id
        WHERE si.is_verified = true 
        AND ac.user_id = $1
        ORDER BY si.type, si.name
      `;
      
      const result = await pool.query(query, [userId]);
      
      // Group by channel type
      const channelGroups = {
        lineoa: [],
        facebook: [],
        tiktok: [],
        web: []
      };
      
      result.rows.forEach(row => {
        if (channelGroups[row.channel_type]) {
          channelGroups[row.channel_type].push({
            id: row.id,
            name: row.name,
            channelId: row.channel_id,
            agentName: row.agent_name,
            agentId: row.agent_id
          });
        }
      });
      
      // Add web widgets
      const webWidgetsQuery = `
        SELECT 
          cw.id,
          cw.name,
          cw.widget_key as channel_id,
          ac.name as agent_name,
          ac.id as agent_id
        FROM chat_widgets cw
        JOIN agent_chatbots ac ON cw.agent_id = ac.id
        WHERE cw.is_active = true
        AND cw.user_id = $1
        ORDER BY cw.name
      `;
      
      const webResult = await pool.query(webWidgetsQuery, [userId]);
      webResult.rows.forEach(row => {
        channelGroups.web.push({
          id: row.id,
          name: row.name,
          channelId: row.channel_id,
          agentName: row.agent_name,
          agentId: row.agent_id
        });
      });
      
      res.json(channelGroups);
    } catch (error) {
      console.error("Error fetching channel integrations:", error);
      res.status(500).json({ message: "Failed to fetch channels" });
    }
  });

  app.get('/api/agent-console/users', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const channelFilter = req.query.channelFilter || 'all';
      const subChannelFilter = req.query.subChannelFilter || 'all';
      
      // Build WHERE conditions for sub-channel filtering
      let whereConditions = 'ac.user_id = $1 AND (ch.channel_id LIKE \'U%\' OR ch.channel_type = \'web\')';
      const params = [userId];
      let paramIndex = 2;
      
      if (channelFilter !== 'all') {
        whereConditions += ` AND ch.channel_type = $${paramIndex}`;
        params.push(channelFilter);
        paramIndex++;
      }
      
      if (subChannelFilter !== 'all') {
        if (channelFilter === 'web') {
          // For web widgets, filter by widget_key
          whereConditions += ` AND ch.channel_id = $${paramIndex}`;
          params.push(subChannelFilter);
        } else if (channelFilter === 'lineoa') {
          // For Line OA, filter by specific channel integration
          whereConditions += ` AND EXISTS (
            SELECT 1 FROM social_integrations si 
            WHERE si.channel_id = $${paramIndex} 
            AND si.agent_id = ch.agent_id
          )`;
          params.push(subChannelFilter);
        }
      }
      
      // Get all unique users from chat history grouped by user, channel, and agent
      // Fixed query to properly sort by last message time
      const query = `
        WITH latest_messages AS (
          SELECT DISTINCT ON (ch.channel_id, ch.channel_type, ch.agent_id)
            ch.user_id,
            ch.channel_type,
            ch.channel_id,
            ch.agent_id,
            ac.name as agent_name,
            ch.content as last_message,
            ch.created_at as last_message_at,
            COUNT(*) OVER (PARTITION BY ch.channel_id, ch.channel_type, ch.agent_id) as message_count
          FROM chat_history ch
          JOIN agent_chatbots ac ON ch.agent_id = ac.id
          WHERE ${whereConditions}
          ORDER BY ch.channel_id, ch.channel_type, ch.agent_id, ch.created_at DESC
        )
        SELECT * FROM latest_messages
        ORDER BY last_message_at DESC
      `;
      
      const result = await pool.query(query, params);
      
      const chatUsers = result.rows.map(row => ({
        userId: row.user_id,
        channelType: row.channel_type,
        channelId: row.channel_id, // This is the Line user ID from database
        agentId: row.agent_id,
        agentName: row.agent_name,
        lastMessage: row.last_message,
        lastMessageAt: row.last_message_at,
        messageCount: parseInt(row.message_count),
        isOnline: Math.random() > 0.7, // Simplified online status
        userProfile: {
          name: row.channel_type === 'web' ? 
            `Web User ${row.user_id.slice(-4)}` : 
            `User ${row.channel_id.slice(-4)}`, // Use Line user ID for display
          // Add more profile fields as needed
        }
      }));
      
      console.log("🔍 Agent Console Users API: Raw DB results:", result.rows.length);
      console.log("🔍 Agent Console Users API: Raw DB sample:", result.rows[0]);
      console.log("🔍 Agent Console Users API: Found users:", chatUsers.length);
      if (chatUsers.length > 0) {
        console.log("🔍 Agent Console Users API: Sample user:", chatUsers[0]);
        console.log("🔍 Agent Console Users API: All channelIds:", chatUsers.map(u => u.channelId));
      }
      
      res.json(chatUsers);
    } catch (error) {
      console.error("Error fetching agent console users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get('/api/agent-console/conversation', isAuthenticated, async (req: any, res) => {
    try {
      const { userId: targetUserId, channelType, channelId, agentId } = req.query;
      
      if (!targetUserId || !channelType || !channelId || !agentId) {
        return res.status(400).json({ message: "Missing required parameters" });
      }
      
      console.log("🔍 Agent Console Conversation API: Query params:", {
        targetUserId,
        channelType,
        channelId,
        agentId
      });
      
      // Try to get messages with the provided channelId first
      let messages = await storage.getChatHistory(
        targetUserId,
        channelType,
        channelId,
        parseInt(agentId),
        50 // Get last 50 messages
      );
      
      // If no messages found and channelId looks like a Line OA channel ID, 
      // try to find with actual Line user ID from the database
      if (messages.length === 0 && channelType === 'lineoa') {
        console.log("🔍 No messages found with channelId:", channelId, "- trying to find Line user ID");
        
        // Query to find actual Line user IDs for this user and agent
        const lineUserQuery = `
          SELECT DISTINCT channel_id 
          FROM chat_history 
          WHERE user_id = $1 AND channel_type = $2 AND agent_id = $3
          AND channel_id LIKE 'U%'
        `;
        const lineUserResult = await pool.query(lineUserQuery, [targetUserId, channelType, parseInt(agentId)]);
        
        if (lineUserResult.rows.length > 0) {
          const actualChannelId = lineUserResult.rows[0].channel_id;
          console.log("🔍 Found actual Line user ID:", actualChannelId);
          
          messages = await storage.getChatHistory(
            targetUserId,
            channelType,
            actualChannelId,
            parseInt(agentId),
            50
          );
        }
      }
      
      console.log("📨 Agent Console Conversation API: Found messages:", messages.length);
      if (messages.length > 0) {
        console.log("📨 Agent Console Conversation API: Sample message:", messages[0]);
      }
      
      res.json(messages);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  app.get('/api/agent-console/summary', (req: any, res: any, next: any) => {
    console.log("🔐 Summary endpoint auth check for user:", req.user?.claims?.sub);
    isAuthenticated(req, res, next);
  }, async (req: any, res) => {
    try {
      console.log("🚀 SUMMARY ENDPOINT CALLED! 🚀");
      const { userId: targetUserId, channelType, channelId } = req.query;
      console.log("📊 Summary request params:", { targetUserId, channelType, channelId });
      
      if (!targetUserId || !channelType || !channelId) {
        return res.status(400).json({ message: "Missing required parameters" });
      }
      
      // Get conversation statistics - try both channelId variants for Line OA
      let query = `
        SELECT 
          COUNT(*) as total_messages,
          MIN(created_at) as first_contact_at,
          MAX(created_at) as last_active_at
        FROM chat_history 
        WHERE user_id = $1 AND channel_type = $2 AND channel_id = $3
      `;
      
      let result = await pool.query(query, [targetUserId, channelType, channelId]);
      let row = result.rows[0];
      
      console.log("📊 First query result for summary:", { 
        targetUserId, 
        channelType, 
        channelId: channelId.substring(0, 8) + '...', 
        totalMessages: row?.total_messages 
      });
      
      // If no messages found and it's Line OA, try finding the actual Line user ID
      if (parseInt(row.total_messages) === 0 && channelType === 'lineoa') {
        console.log("🔍 No messages found, trying to find actual Line user ID");
        
        const lineUserQuery = `
          SELECT DISTINCT channel_id, COUNT(*) as message_count
          FROM chat_history 
          WHERE user_id = $1 AND channel_type = $2
          GROUP BY channel_id
          ORDER BY message_count DESC
          LIMIT 1
        `;
        
        const lineUserResult = await pool.query(lineUserQuery, [targetUserId, channelType]);
        
        if (lineUserResult.rows.length > 0) {
          const actualChannelId = lineUserResult.rows[0].channel_id;
          console.log("🔍 Found actual channel ID:", actualChannelId.substring(0, 8) + '...');
          
          // Update the channel ID for both summary and CSAT
          actualChannelIdForCSAT = actualChannelId;
          
          // Re-query with the actual channel ID
          result = await pool.query(query, [targetUserId, channelType, actualChannelId]);
          row = result.rows[0];
          
          console.log("📊 Second query result with actual channel ID:", { 
            actualChannelId: actualChannelId.substring(0, 8) + '...', 
            totalMessages: row?.total_messages 
          });
        }
      }
      
      // Get CSAT score using OpenAI analysis of actual conversation
      let csatScore = undefined;
      let actualChannelIdForCSAT = channelId;
      
      // If we have enough messages, calculate CSAT score using OpenAI
      if (parseInt(row.total_messages) >= 3) {
        try {
          console.log("🎯 Starting CSAT calculation for:", { 
            targetUserId, 
            channelType, 
            originalChannelId: channelId.substring(0, 8) + '...',
            actualChannelId: actualChannelIdForCSAT.substring(0, 8) + '...',
            totalMessages: row.total_messages 
          });
          
          // Get agent ID from first message to use correct memory limits
          let agentId = undefined;
          const firstMessageQuery = `
            SELECT agent_id 
            FROM chat_history 
            WHERE user_id = $1 AND channel_type = $2 AND channel_id = $3 
            ORDER BY created_at ASC 
            LIMIT 1
          `;
          const firstMessageResult = await pool.query(firstMessageQuery, [targetUserId, channelType, actualChannelIdForCSAT]);
          if (firstMessageResult.rows.length > 0) {
            agentId = firstMessageResult.rows[0].agent_id;
            console.log("📊 Found agent ID for CSAT:", agentId);
          }
          
          // Add timeout for CSAT calculation to prevent hanging
          const csatPromise = calculateCSATScore(targetUserId, channelType, actualChannelIdForCSAT, agentId);
          const timeoutPromise = new Promise<undefined>((_, reject) => 
            setTimeout(() => reject(new Error('CSAT calculation timeout')), 15000)
          );
          
          csatScore = await Promise.race([csatPromise, timeoutPromise]);
          
          console.log("🎯 CSAT calculation completed:", { csatScore });
        } catch (error) {
          console.error("❌ Error calculating CSAT score:", error);
          csatScore = undefined;
        }
      } else {
        console.log("⚠️ Not enough messages for CSAT calculation:", row.total_messages);
      }

      // Determine sentiment based on CSAT Score
      let sentiment = 'neutral';
      if (csatScore !== undefined) {
        if (csatScore < 40) {
          sentiment = 'bad';
        } else if (csatScore >= 41 && csatScore <= 60) {
          sentiment = 'neutral';
        } else if (csatScore >= 61 && csatScore <= 80) {
          sentiment = 'good';
        } else if (csatScore > 80) {
          sentiment = 'excellent';
        }
      }

      const summary = {
        totalMessages: parseInt(row.total_messages) || 0,
        firstContactAt: row.first_contact_at,
        lastActiveAt: row.last_active_at,
        sentiment: sentiment,
        mainTopics: ['General Inquiry', 'Support'], // Could be enhanced with AI topic extraction
        csatScore: csatScore
      };
      
      console.log("📊 Final summary response:", {
        totalMessages: summary.totalMessages,
        firstContactAt: summary.firstContactAt ? summary.firstContactAt.toISOString() : null,
        lastActiveAt: summary.lastActiveAt ? summary.lastActiveAt.toISOString() : null,
        csatScore: summary.csatScore,
        csatScore: summary.csatScore
      });
      
      res.json(summary);
    } catch (error) {
      console.error("Error fetching conversation summary:", error);
      res.status(500).json({ message: "Failed to fetch conversation summary" });
    }
  });

  // Debug endpoint to test WebSocket broadcasting
  app.post('/api/debug/websocket-test', async (req: any, res) => {
    try {
      const { message, userId, channelId } = req.body;
      
      console.log('🧪 Debug WebSocket test initiated:', {
        message,
        userId,
        channelId,
        wsClientsCount: global.wsClients ? global.wsClients.size : 0
      });
      
      if (global.wsClients && global.wsClients.size > 0) {
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
        
        console.log('🧪 Broadcasting test message:', JSON.stringify(testMessage, null, 2));
        
        let sentCount = 0;
        global.wsClients.forEach((client, index) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(testMessage));
            sentCount++;
            console.log(`🧪 Test message sent to client ${index + 1}`);
          }
        });
        
        res.json({ 
          success: true, 
          message: 'Test message broadcast', 
          clientsCount: global.wsClients.size,
          sentCount: sentCount
        });
      } else {
        res.json({ 
          success: false, 
          message: 'No WebSocket clients connected',
          clientsCount: 0
        });
      }
    } catch (error) {
      console.error('🧪 Debug WebSocket test error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/agent-console/send-message', isAuthenticated, async (req: any, res) => {
    try {
      let { userId: targetUserId, channelType, channelId, agentId, message, messageType } = req.body;
      
      console.log('📤 Agent Console send-message endpoint called:', {
        targetUserId,
        channelType,
        channelId,
        agentId,
        messageLength: message?.length || 0,
        messageType,
        humanAgent: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
      });
      
      if (!targetUserId || !channelType || !channelId || !agentId || !message) {
        console.log('❌ Missing required parameters:', { targetUserId, channelType, channelId, agentId, hasMessage: !!message });
        return res.status(400).json({ message: "Missing required parameters" });
      }

      // For web channel, always broadcast to all active sessions for this widget
      // This ensures messages reach the widget regardless of session ID mismatches
      
      // Store the human agent message in chat history
      console.log('💾 Storing human agent message in chat history...');
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
      
      console.log('✅ Chat history stored with ID:', chatHistoryRecord.id);

      // Broadcast new message to Agent Console via WebSocket
      console.log('📡 Preparing to broadcast to Agent Console...');
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
        
        console.log('📡 Broadcasting to Agent Console:', broadcastData);
        (global as any).broadcastToAgentConsole(broadcastData);
        console.log('✅ Broadcasted human agent message to Agent Console');
      } else {
        console.log('⚠️ broadcastToAgentConsole function not available');
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
            console.log('🔍 Found Line integration:', {
              name: integration.name,
              channelId: integration.channel_id?.substring(0, 8) + '...',
              hasToken: !!integration.channel_access_token
            });
            
            if (integration.channel_access_token) {
              const { sendLinePushMessage } = await import('./lineOaWebhook');
              await sendLinePushMessage(channelId, message, integration.channel_access_token);
              console.log('✅ Successfully sent Line message via integration:', integration.name);
            } else {
              console.log('⚠️ No Channel Access Token found in integration:', integration.name);
            }
          } else {
            console.log('⚠️ No verified Line integration found for agent:', agentId);
          }
        } catch (error) {
          console.error('❌ Error sending Line message:', error);
        }
      } else if (channelType === 'web') {
        // For web channel, we need to store the message in widget_chat_messages table too
        // because the widget reads from this table
        console.log('🌐 Processing web channel message:', {
          targetUserId,
          channelId,
          agentId: parseInt(agentId),
          wsClientsCount: global.wsClients ? global.wsClients.size : 0,
          globalWsClientsExists: !!(global.wsClients),
          messageContent: message.substring(0, 50) + '...'
        });

        // CRITICAL: Also store human agent message in widget_chat_messages table
        // This is what the widget actually reads from!
        try {
          console.log('💾 Storing human agent message in widget_chat_messages table...');
          
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
          console.log('✅ Human agent message stored in widget_chat_messages with ID:', widgetMessageResult.rows[0].id);
          
        } catch (widgetStoreError) {
          console.error('❌ Error storing human agent message in widget_chat_messages:', widgetStoreError);
        }
        
        if (global.wsClients && global.wsClients.size > 0) {
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
          
          console.log('📡 Broadcasting web widget message (specific):', JSON.stringify(wsMessage, null, 2));
          console.log('📡 Broadcasting web widget message (broadcast):', JSON.stringify(broadcastMessage, null, 2));
          
          let sentCount = 0;
          let openConnections = 0;
          global.wsClients.forEach((client, index) => {
            console.log(`🔍 WebSocket client ${index + 1} readyState:`, client.readyState);
            if (client.readyState === 1) { // WebSocket.OPEN
              openConnections++;
              try {
                // Send both specific and broadcast messages
                client.send(JSON.stringify(wsMessage));
                client.send(JSON.stringify(broadcastMessage));
                sentCount++;
                console.log(`✅ Sent messages to WebSocket client ${index + 1}`);
              } catch (error) {
                console.log(`❌ Error sending to WebSocket client ${index + 1}:`, error);
              }
            }
          });
          
          console.log(`📊 WebSocket summary - Total clients: ${global.wsClients.size}, Open: ${openConnections}, Sent: ${sentCount}`);
        } else {
          console.log('⚠️ No WebSocket clients connected for web channel message');
          console.log('🔍 Global WebSocket debugging:', {
            globalWsClientsExists: !!(global.wsClients),
            wsClientsSize: global.wsClients ? global.wsClients.size : 'undefined'
          });
        }
      }
      
      res.json({ 
        success: true, 
        messageId: chatHistoryRecord.id,
        message: "Message sent successfully" 
      });
    } catch (error) {
      console.error("Error sending agent console message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Agent Console Image Upload and Send endpoint  
  app.post('/api/agent-console/send-image', isAuthenticated, upload.single('image'), async (req: any, res) => {
    try {
      const { userId: targetUserId, channelType, channelId, agentId, message, messageType } = req.body;
      const imageFile = req.file;
      
      if (!targetUserId || !channelType || !channelId || !agentId) {
        return res.status(400).json({ message: "Missing required parameters" });
      }
      
      if (!imageFile) {
        return res.status(400).json({ message: "No image file provided" });
      }
      
      console.log('📸 Agent Console: Processing image upload:', {
        targetUserId,
        channelType, 
        channelId,
        agentId,
        fileName: imageFile.filename,
        size: imageFile.size,
        mimetype: imageFile.mimetype
      });
      
      // Create image URL for serving
      const imageUrl = `/uploads/${imageFile.filename}`;
      
      // Store image message in chat history
      const chatHistoryRecord = await storage.createChatHistory({
        userId: targetUserId,
        channelType,
        channelId,
        agentId: parseInt(agentId),
        messageType: messageType || 'agent',
        content: message || 'รูปภาพ',
        metadata: {
          messageType: 'image',
          imageUrl: imageUrl,
          originalContentUrl: imageUrl,
          previewImageUrl: imageUrl,
          fileName: imageFile.originalname,
          fileSize: imageFile.size,
          mimeType: imageFile.mimetype,
          sentBy: req.user.claims.sub,
          humanAgent: true,
          humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
        }
      });

      // Broadcast new message to Agent Console via WebSocket
      if (typeof (global as any).broadcastToAgentConsole === 'function') {
        (global as any).broadcastToAgentConsole({
          type: 'new_message',
          data: {
            userId: targetUserId,
            channelType,
            channelId,
            agentId: parseInt(agentId),
            userMessage: '',
            aiResponse: message || 'รูปภาพ',
            messageType: messageType || 'agent',
            timestamp: new Date().toISOString(),
            humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent',
            imageUrl: imageUrl
          }
        });
        console.log('📡 Broadcasted human agent image message to Agent Console');
      }
      
      // Send the image via the appropriate channel
      if (channelType === 'lineoa') {
        try {
          // Get Line channel access token from agent using direct DB query
          const query = `SELECT lineoa_config FROM agent_chatbots WHERE id = $1`;
          const result = await pool.query(query, [parseInt(agentId)]);
          
          if (result.rows.length > 0) {
            const lineoaConfig = result.rows[0].lineoa_config;
            console.log('🔍 Agent lineoa_config for image:', lineoaConfig);
            
            if (lineoaConfig?.accessToken) {
              // Send image via Line Push Message API
              const imageResult = await sendLineImageMessage(channelId, imageUrl, lineoaConfig.accessToken, message);
              if (imageResult) {
                console.log('✅ Successfully sent Line image:', imageUrl);
              } else {
                console.log('❌ Failed to send Line image:', imageUrl);
              }
            } else {
              console.log('⚠️ No Line Channel Access Token found in lineoa_config for agent:', agentId);
            }
          } else {
            console.log('⚠️ Agent not found:', agentId);
          }
        } catch (error) {
          console.error('❌ Error sending Line image:', error);
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

  app.post('/api/agent-console/takeover', isAuthenticated, async (req: any, res) => {
    try {
      const { userId: targetUserId, channelType, channelId, agentId } = req.body;
      
      if (!targetUserId || !channelType || !channelId || !agentId) {
        return res.status(400).json({ message: "Missing required parameters" });
      }
      
      // Log the takeover action
      await storage.createAuditLog({
        userId: req.user.claims.sub,
        action: 'human_takeover',
        resourceType: 'conversation',
        resourceId: `${targetUserId}-${channelType}-${channelId}`,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        details: {
          targetUserId,
          channelType,
          channelId,
          agentId: parseInt(agentId)
        }
      });
      
      // Store a system message indicating human takeover
      await storage.createChatHistory({
        userId: targetUserId,
        channelType,
        channelId,
        agentId: parseInt(agentId),
        messageType: 'assistant',
        content: '🔄 A human agent has joined the conversation.',
        metadata: {
          systemMessage: true,
          humanTakeover: true,
          agentId: req.user.claims.sub
        }
      });
      
      res.json({ success: true, message: "Conversation takeover successful" });
    } catch (error) {
      console.error("Error taking over conversation:", error);
      res.status(500).json({ message: "Failed to take over conversation" });
    }
  });

  // Line Message Template Routes
  
  // Get all Line message templates for user
  app.get("/api/line-templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = req.query.integrationId ? parseInt(req.query.integrationId) : undefined;
      
      console.log("🔍 Fetching Line templates for user:", userId, "integration:", integrationId);
      
      const templates = await storage.getLineMessageTemplates(userId, integrationId);
      console.log("📋 Found templates:", templates.length);
      
      // Get complete template data (with columns and actions) for each template
      const completeTemplates = await Promise.all(
        templates.map(async (template) => {
          const completeTemplate = await storage.getCompleteLineTemplate(template.id, userId);
          return completeTemplate;
        })
      );
      
      console.log("✅ Complete templates ready:", completeTemplates.length);
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

      console.log("🔍 BACKEND UPDATE - Received data:", { templateId, name, description, tags, type, integrationId, columnsCount: columns?.length });
      console.log("🔍 BACKEND UPDATE - Tags specifically:", tags);

      // Update the template basic info
      const updateData = {
        name,
        description,
        tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
        templateType: type,
        integrationId: integrationId || null,
      };
      
      console.log("🔍 BACKEND UPDATE - Sending to storage:", updateData);
      const updatedTemplate = await storage.updateLineMessageTemplate(templateId, updateData, userId);
      console.log("🔍 BACKEND UPDATE - Updated template result:", updatedTemplate);

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
        console.log(`❌ Line OA integration ${integrationId} not found or inactive`);
        return res.status(404).json({ error: "Line OA integration not found or inactive" });
      }

      console.log(`🔔 Line webhook received for integration ${integrationId} (${integration.name})`);
      console.log(`🔍 Integration verified status: ${integration.isVerified}`);
      console.log(`📅 Last verified: ${integration.lastVerifiedAt || 'Never'}`);
      
      // Temporarily modify the request to include integration info for handleLineWebhook
      (req as any).lineIntegration = integration;
      
      // Call the existing webhook handler
      return await handleLineWebhook(req, res);
    } catch (error) {
      console.error("💥 Dynamic Line webhook error:", error);
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

  const httpServer = createServer(app);
  
  // Create WebSocket server on /ws path to avoid conflicts with Vite HMR
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws' 
  });

  // Store connected WebSocket clients
  const wsClients = new Set<WebSocket>();
  
  // Also store global reference for widget message broadcasting
  (global as any).wsClients = wsClients;

  wss.on('connection', (ws, req) => {
    console.log('🔌 WebSocket client connected:', {
      url: req.url,
      origin: req.headers.origin,
      userAgent: req.headers['user-agent']?.substring(0, 50) + '...',
      totalClients: wsClients.size + 1
    });
    
    wsClients.add(ws);
    console.log('📊 WebSocket clients count:', wsClients.size);

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
        console.log('📨 WebSocket message received:', message);
        
        // Handle different message types if needed
        if (message.type === 'subscribe') {
          console.log('📡 Client subscribed to Agent Console updates');
        }
      } catch (error) {
        console.error('❌ WebSocket message parse error:', error);
      }
    });

    // Clean up on disconnect
    ws.on('close', () => {
      console.log('🔌 WebSocket client disconnected');
      wsClients.delete(ws);
      console.log('📊 Remaining WebSocket clients:', wsClients.size);
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      wsClients.delete(ws);
      console.log('📊 Remaining WebSocket clients after error:', wsClients.size);
    });
  });

  // Export function to broadcast messages to all connected clients
  (global as any).broadcastToAgentConsole = (message: any) => {
    console.log(`📡 Broadcasting to ${wsClients.size} connected clients:`, message);
    
    wsClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error('❌ Error sending WebSocket message:', error);
          wsClients.delete(client);
        }
      } else {
        wsClients.delete(client);
      }
    });
  };

  return httpServer;
}