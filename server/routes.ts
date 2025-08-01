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
import { GuardrailsService } from "./services/guardrails";
import { db, pool } from "./db";
import { eq, sql, and, gte, getTableColumns, or, ilike } from "drizzle-orm";
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
  agentChatbots,
  agentChatbotDocuments,
  chatHistory,
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
import { documentNamePrioritySearchService } from "./services/documentNamePrioritySearch";

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
    const messages = await storage.getChatHistoryWithMemoryStrategy(userId, channelType, channelId, agentId || 0, messageLimit);

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

  // ============================
  // AUTHENTICATION ROUTES
  // ============================

  // Auth status check endpoint
  app.get("/api/auth/user", async (req: any, res) => {
    try {
      // Check Microsoft auth first
      if (req.isAuthenticated() && req.user) {
        const user = req.user as any;
        if (user.claims?.sub) {
          console.log("Microsoft auth successful for:", user.claims.email);
          return res.json({
            id: user.claims.sub,
            email: user.claims.email,
            firstName: user.claims.given_name || user.claims.first_name || '',
            lastName: user.claims.family_name || user.claims.last_name || '',
            profileImageUrl: user.claims.picture || user.claims.profile_image_url || null,
            role: 'user', // Default role, will be updated from database
            isAuthenticated: true,
            provider: 'microsoft'
          });
        }
      }

      // Check session user (Microsoft fallback)
      const sessionUser = (req.session as any)?.user;
      if (sessionUser && sessionUser.claims?.sub) {
        console.log("Microsoft session auth successful for:", sessionUser.claims.email);
        return res.json({
          id: sessionUser.claims.sub,
          email: sessionUser.claims.email,
          firstName: sessionUser.claims.given_name || sessionUser.claims.first_name || '',
          lastName: sessionUser.claims.family_name || sessionUser.claims.last_name || '',
          profileImageUrl: sessionUser.claims.picture || sessionUser.claims.profile_image_url || null,
          role: 'user',
          isAuthenticated: true,
          provider: 'microsoft'
        });
      }

      // Check Replit auth
      const replitUser = (req.session as any)?.passport?.user;
      if (replitUser && replitUser.claims?.sub) {
        console.log("Replit auth successful for:", replitUser.claims.email);
        return res.json({
          id: replitUser.claims.sub,
          email: replitUser.claims.email,
          firstName: replitUser.claims.first_name || '',
          lastName: replitUser.claims.last_name || '',
          profileImageUrl: replitUser.claims.profile_image_url || null,
          role: 'user',
          isAuthenticated: true,
          provider: 'replit'
        });
      }

      console.log("No authentication found");
      res.status(401).json({ message: "Unauthorized", isAuthenticated: false });
    } catch (error) {
      console.error("Error checking auth status:", error);
      res.status(500).json({ message: "Auth check failed", isAuthenticated: false });
    }
  });

  // ============================
  // AUDIT & MONITORING ROUTES
  // ============================

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
      if (limit) options.limit = parseInt(limit as string);
      if (offset) options.offset = parseInt(offset as string);
      if (action && action !== "all") options.action = action;
      if (resourceType && resourceType !== "all")
        options.resourceType = resourceType;
      if (filterUserId && filterUserId !== "all") options.userId = filterUserId;
      if (dateFrom) options.dateFrom = new Date(dateFrom as string);
      if (dateTo) options.dateTo = new Date(dateTo as string);

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
      if (dateFrom) options.dateFrom = new Date(dateFrom as string);
      if (dateTo) options.dateTo = new Date(dateTo as string);

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

  // ============================
  // WIDGET EMBED ROUTES
  // ============================

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
      const embedScript = fsSync.readFileSync(
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

  // ============================
  // AGENT CHATBOT ROUTES
  // ============================

  app.get("/api/agent-chatbots", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ message: "User ID required" });
      }

      // Get agent chatbots from database
      const agents = await db
        .select()
        .from(agentChatbots)
        .where(eq(agentChatbots.userId, userId))
        .orderBy(sql`${agentChatbots.createdAt} desc`);

      res.json(agents || []);
    } catch (error) {
      console.error("Error fetching agent chatbots:", error);
      res.status(500).json({ message: "Failed to fetch agent chatbots" });
    }
  });

  // Get single agent chatbot
  app.get("/api/agent-chatbots/:id", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const agentId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ message: "User ID required" });
      }

      if (isNaN(agentId)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      // Get specific agent chatbot
      const [agent] = await db
        .select()
        .from(agentChatbots)
        .where(and(
          eq(agentChatbots.id, agentId),
          eq(agentChatbots.userId, userId)
        ))
        .limit(1);

      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      res.json(agent);
    } catch (error) {
      console.error("Error fetching agent chatbot:", error);
      res.status(500).json({ message: "Failed to fetch agent chatbot" });
    }
  });

  // Get agent chatbot documents - FIXED: Missing route that was causing bot details malfunction
  app.get("/api/agent-chatbots/:id/documents", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const agentId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ message: "User ID required" });
      }

      if (isNaN(agentId)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      // First verify the agent belongs to the user
      const [agent] = await db
        .select()
        .from(agentChatbots)
        .where(and(
          eq(agentChatbots.id, agentId),
          eq(agentChatbots.userId, userId)
        ))
        .limit(1);

      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      // Fetch agent documents with document details using proper join
      const agentDocuments = await db
        .select({
          id: agentChatbotDocuments.id,
          documentId: agentChatbotDocuments.documentId,
          agentId: agentChatbotDocuments.agentId,
          addedAt: agentChatbotDocuments.createdAt,
          // Include document details
          documentName: documents.name,
          documentDescription: documents.description,
          documentFileName: documents.fileName,
          documentMimeType: documents.mimeType,
          documentSummary: documents.summary,
          documentTags: documents.tags,
          documentIsPublic: documents.isPublic,
          documentCreatedAt: documents.createdAt,
        })
        .from(agentChatbotDocuments)
        .innerJoin(documents, eq(agentChatbotDocuments.documentId, documents.id))
        .where(and(
          eq(agentChatbotDocuments.agentId, agentId),
          eq(agentChatbotDocuments.userId, userId)
        ))
        .orderBy(sql`${agentChatbotDocuments.createdAt} desc`);

      res.json(agentDocuments || []);
    } catch (error) {
      console.error("Error fetching agent chatbot documents:", error);
      res.status(500).json({ message: "Failed to fetch agent documents" });
    }
  });

  // ============================
  // USER PROFILE ROUTES
  // ============================

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
      
      // Get user from database
      const [user] = await db
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
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get department name if user has one
      let departmentName = null;
      if (user.departmentId) {
        const [dept] = await db
          .select({ name: departments.name })
          .from(departments)
          .where(eq(departments.id, user.departmentId))
          .limit(1);
        departmentName = dept?.name || null;
      }

      const profile = {
        id: user.id,
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        role: user.role,
        department: departmentName,
        departmentId: user.departmentId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        preferences: {
          notifications: true, // Default preferences
          emailUpdates: true,
          theme: 'light'
        }
      };

      res.json(profile);
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
      const { name, firstName, lastName, department, preferences } = req.body;

      // Parse name into first and last name if provided
      let updateData: any = {
        updatedAt: new Date(),
      };

      if (firstName !== undefined) updateData.firstName = firstName || null;
      if (lastName !== undefined) updateData.lastName = lastName || null;
      
      // If name is provided but not firstName/lastName, try to split
      if (name && !firstName && !lastName) {
        const nameParts = name.trim().split(' ');
        updateData.firstName = nameParts[0] || null;
        updateData.lastName = nameParts.slice(1).join(' ') || null;
      }

      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ 
        message: "Profile updated successfully",
        user: updatedUser 
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update user profile" });
    }
  });

  // ============================
  // ADMIN ROUTES
  // ============================

  // Admin User Management Routes
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req: any, res) => {
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
  });

  app.get("/api/admin/departments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const allDepartments = await db.select().from(departments);
      res.json(allDepartments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

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

  app.put("/api/admin/users/:userId/department", isAuthenticated, async (req: any, res) => {
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
  app.put("/api/admin/users/:userId/role", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const adminUserId = req.user.claims.sub;

      if (!["admin", "user", "viewer"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Prevent admin from demoting themselves
      if (userId === adminUserId && role !== "admin") {
        return res.status(400).json({ 
          message: "Cannot change your own admin role" 
        });
      }

      await db
        .update(users)
        .set({
          role,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      res.json({ message: "User role updated successfully" });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Get admin settings
  app.get("/api/admin/settings", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, isAdmin, async (req: any, res) => {
    try {
      // Return default system settings
      const settings = {
        maxFileSize: 25, // MB
        allowedFileTypes: [
          "pdf", "docx", "xlsx", "pptx", "txt", "csv", "json",
          "jpg", "jpeg", "png", "gif", "webp"
        ],
        retentionDays: 365,
        autoBackup: false,
        enableAnalytics: true
      };

      res.json(settings);
    } catch (error) {
      console.error("Error fetching admin settings:", error);
      res.status(500).json({ message: "Failed to fetch admin settings" });
    }
  });

  // Update admin settings
  app.put("/api/admin/settings", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, isAdmin, async (req: any, res) => {
    try {
      // For now, just acknowledge the update
      // In a real implementation, you'd save these to a settings table
      const { maxFileSize, allowedFileTypes, retentionDays, autoBackup, enableAnalytics } = req.body;

      console.log("Admin settings update:", {
        maxFileSize,
        allowedFileTypes,
        retentionDays,
        autoBackup,
        enableAnalytics
      });

      res.json({ 
        message: "Settings updated successfully",
        settings: req.body
      });
    } catch (error) {
      console.error("Error updating admin settings:", error);
      res.status(500).json({ message: "Failed to update admin settings" });
    }
  });

  // ============================
  // CATEGORY ROUTES
  // ============================

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

  app.post("/api/categories", (req: any, res: any, next: any) => {
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
      const categoryData = insertCategorySchema.parse({
        ...req.body,
        userId,
      });

      const category = await storage.createCategory(categoryData);
      res.status(201).json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid category data",
          errors: error.errors 
        });
      }
      console.error("Error creating category:", error);
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.put("/api/categories/:id", (req: any, res: any, next: any) => {
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
      const categoryId = parseInt(req.params.id);

      if (isNaN(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }

      const updateData = {
        name: req.body.name,
        description: req.body.description,
        color: req.body.color,
      };

      const category = await storage.updateCategory(categoryId, updateData);

      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json(category);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete("/api/categories/:id", (req: any, res: any, next: any) => {
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
      const categoryId = parseInt(req.params.id);

      if (isNaN(categoryId)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }

      await storage.deleteCategory(categoryId, userId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // ============================
  // STATS ROUTES
  // ============================

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
      
      // Get actual document count from database
      const [docCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(documents)
        .where(eq(documents.userId, userId));

      // Get documents processed today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const [todayCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(documents)
        .where(and(
          eq(documents.userId, userId),
          gte(documents.createdAt, today)
        ));

      // Calculate approximate storage used (sum of file sizes)
      const [storageResult] = await db
        .select({ 
          total: sql<number>`COALESCE(sum(${documents.fileSize}), 0)` 
        })
        .from(documents)
        .where(eq(documents.userId, userId));

      const stats = {
        totalDocuments: Number(docCount?.count || 0),
        processedToday: Number(todayCount?.count || 0),
        storageUsed: Number(storageResult?.total || 0)
      };

      console.log(`📊 User stats for ${userId.substring(0, 8)}...:`, stats);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      // Return default stats on error instead of failing
      res.json({
        totalDocuments: 0,
        processedToday: 0,
        storageUsed: 0
      });
    }
  });

  // Category statistics endpoint
  app.get("/api/stats/categories", (req: any, res: any, next: any) => {
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
      
      // Get category statistics from documents
      const categoryStats = await db
        .select({
          category: sql<string>`COALESCE(${documents.aiCategory}, 'Uncategorized')`,
          count: sql<number>`count(*)`
        })
        .from(documents)
        .where(eq(documents.userId, userId))
        .groupBy(sql`COALESCE(${documents.aiCategory}, 'Uncategorized')`)
        .orderBy(sql`count(*) desc`);

      console.log(`📊 Category stats for ${userId.substring(0, 8)}...:`, categoryStats);
      res.json(categoryStats || []);
    } catch (error) {
      console.error("Error fetching category stats:", error);
      // Return empty array on error instead of failing
      res.json([]);
    }
  });

  // ============================
  // DOCUMENT PERMISSION ROUTES
  // ============================

  app.get("/api/documents/:id/permissions", isAuthenticated, async (req: any, res) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const userPermissions = await db
        .select({
          id: documentUserPermissions.id,
          userId: documentUserPermissions.userId,
          permissionType: documentUserPermissions.permissionType,
          grantedBy: documentUserPermissions.grantedBy,
          grantedAt: documentUserPermissions.grantedAt,
          userEmail: users.email,
        })
        .from(documentUserPermissions)
        .leftJoin(users, eq(documentUserPermissions.userId, users.id))
        .where(eq(documentUserPermissions.documentId, documentId));

      const departmentPermissions = await db
        .select({
          id: documentDepartmentPermissions.id,
          departmentId: documentDepartmentPermissions.departmentId,
          permissionType: documentDepartmentPermissions.permissionType,
          grantedBy: documentDepartmentPermissions.grantedBy,
          grantedAt: documentDepartmentPermissions.grantedAt,
          departmentName: departments.name,
        })
        .from(documentDepartmentPermissions)
        .leftJoin(departments, eq(documentDepartmentPermissions.departmentId, departments.id))
        .where(eq(documentDepartmentPermissions.documentId, documentId));

      res.json({
        userPermissions,
        departmentPermissions,
      });
    } catch (error) {
      console.error("Error fetching document permissions:", error);
      res.status(500).json({ message: "Failed to fetch document permissions" });
    }
  });

  app.post("/api/documents/:id/permissions/user", isAuthenticated, async (req: any, res) => {
    try {
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
  });

  app.post("/api/documents/:id/permissions/department", isAuthenticated, async (req: any, res) => {
    try {
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
      res.status(500).json({ message: "Failed to grant department permission" });
    }
  });

  app.delete("/api/documents/permissions/user/:permissionId", isAuthenticated, async (req: any, res) => {
    try {
      const permissionId = parseInt(req.params.permissionId);

      await db
        .delete(documentUserPermissions)
        .where(eq(documentUserPermissions.id, permissionId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error removing user permission:", error);
      res.status(500).json({ message: "Failed to remove user permission" });
    }
  });

  app.delete("/api/documents/permissions/department/:permissionId", isAuthenticated, async (req: any, res) => {
    try {
      const permissionId = parseInt(req.params.permissionId);

      await db
        .delete(documentDepartmentPermissions)
        .where(eq(documentDepartmentPermissions.id, permissionId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error removing department permission:", error);
      res.status(500).json({ message: "Failed to remove department permission" });
    }
  });

  // ============================
  // DOCUMENT ROUTES
  // ============================

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
      
      // Ensure we always return an array
      const documentsArray = Array.isArray(documents) ? documents : [];
      res.json(documentsArray);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Enhanced document search with semantic capabilities and document name priority
  // IMPORTANT: This must come BEFORE the /api/documents/:id route to prevent conflicts
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
      const query = (req.query.q as string) || "";
      const type = (req.query.type as string) || "keyword-name-priority";
      const massPercentage = parseFloat(req.query.massPercentage as string) || 0.5;

      // Extract search control parameters with proper defaults
      const searchFileName = req.query.fileName !== "false" && req.query.fileName !== false;
      const searchKeyword = req.query.keyword !== "false" && req.query.keyword !== false;
      const searchMeaning = req.query.meaning === "true" || req.query.meaning === true;

      console.log("🔍 Document search:", { query, type, userId: userId.substring(0, 8) + '...' });

      if (!query.trim()) {
        return res.json({ results: [], count: 0 });
      }

      let searchResults: any[] = [];

      // Determine search strategy
      switch (type) {
        case "keyword-name-priority":
          const massPercentageOverride = Math.max(0.1, massPercentage);
          searchResults = await documentNamePrioritySearchService.searchDocuments(
            query,
            userId,
            {
              limit: 100,
              massSelectionPercentage: massPercentageOverride,
              enableNameSearch: searchFileName !== false,
              enableKeywordSearch: searchKeyword !== false,
              enableSemanticSearch: searchMeaning === true
            }
          );
          break;

        case "keyword":
          searchResults = await semanticSearchServiceV2.searchDocuments(
            query,
            userId,
            { limit: Math.min(50, Math.floor(100 * massPercentage)), searchType: "keyword" }
          );
          break;

        case "semantic":
          searchResults = await semanticSearchServiceV2.searchDocuments(
            query,
            userId,
            { limit: Math.min(50, Math.floor(100 * massPercentage)), searchType: "semantic" }
          );
          break;

        case "hybrid":
        default:
          searchResults = await semanticSearchServiceV2.searchDocuments(
            query,
            userId,
            { limit: Math.min(50, Math.floor(100 * massPercentage)), searchType: "hybrid" }
          );
          break;
      }

      // Ensure we have valid results and convert them to proper document format
      if (!Array.isArray(searchResults)) {
        console.log("❌ Search service returned non-array:", typeof searchResults);
        return res.json({ results: [], count: 0 });
      }

      // Additional safety check for undefined/null results
      if (!searchResults) {
        console.log("❌ Search service returned null/undefined results");
        return res.json({ results: [], count: 0 });
      }

      // Filter out invalid results and ensure proper document IDs
      const validResults = searchResults
        .filter(result => {
          // Ensure result has required properties
          if (!result || typeof result !== 'object') return false;
          
          // Check for valid document ID
          const hasValidId = result.id && !isNaN(Number(result.id)) && Number(result.id) > 0;
          const hasValidDocId = result.documentId && !isNaN(Number(result.documentId)) && Number(result.documentId) > 0;
          
          return hasValidId || hasValidDocId;
        })
        .map(result => {
          // Normalize the result to ensure consistent format
          const documentId = result.documentId || result.id;
          
          return {
            id: Number(documentId),
            name: result.name || result.documentName || `Document ${documentId}`,
            description: result.description || '',
            similarity: result.similarity || result.score || 0,
            fileName: result.fileName || '',
            createdAt: result.createdAt || new Date().toISOString(),
            // Include any other relevant fields
            ...result
          };
        });

      console.log(`✅ Search complete: ${validResults.length} valid results`);

      res.json({ 
        results: validResults, 
        count: validResults.length 
      });

    } catch (error) {
      console.error("❌ Document search error:", error);
      res.json({ 
        results: [],
        count: 0
      });
    }
  });

  // Get individual document details
  // IMPORTANT: This must come AFTER the /api/documents/search route to prevent conflicts
  app.get("/api/documents/:id", (req: any, res: any, next: any) => {
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
      const documentId = parseInt(req.params.id);

      console.log(`📄 Fetching document details for ID: ${documentId}, User: ${userId}`);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const document = await storage.getDocumentById(documentId, userId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  // Document upload
  app.post("/api/documents", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = req.user.claims.sub;

      const documentData = {
        name: req.body.name || req.file.originalname,
        description: req.body.description || "",
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        categoryId: req.body.categoryId ? parseInt(req.body.categoryId) : null,
        userId,
        isPublic: req.body.isPublic === "true",
      };

      const document = await storage.createDocument(documentData);

      // Process document in background
      processDocument(document.filePath, document.mimeType).catch(
        (error) => {
          console.error(`Background processing failed for document ${document.id}:`, error);
        }
      );

      res.status(201).json(document);
    } catch (error) {
      // Clean up uploaded file if document creation fails
      if (req.file) {
        fsSync.unlink(req.file.path, (unlinkError) => {
          if (unlinkError) {
            console.error("Error cleaning up uploaded file:", unlinkError);
          }
        });
      }

      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Update document
  app.put("/api/documents/:id", (req: any, res: any, next: any) => {
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
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const updateData = {
        name: req.body.name,
        description: req.body.description,
        categoryId: req.body.categoryId ? parseInt(req.body.categoryId) : null,
        isPublic: req.body.isPublic,
        isFavorite: req.body.isFavorite,
      };

      const document = await storage.updateDocument(documentId, updateData, userId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json(document);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  // Delete document
  app.delete("/api/documents/:id", (req: any, res: any, next: any) => {
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
      const documentId = parseInt(req.params.id);

      if (isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      await storage.deleteDocument(documentId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // ============================
  // CHAT ROUTES
  // ============================

  // Chat message endpoint
  app.post("/api/chat/message", (req: any, res: any, next: any) => {
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
      const { message, channelType = "web", channelId = "default", agentId } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ message: "Message content is required" });
      }

      // Store user message - Note: Using simplified format for storage compatibility
      const userMessageData = {
        role: "user",
        content: message.trim(),
        conversationId: 1, // Default conversation ID
      };

      const userMessage = await storage.createChatMessage(userMessageData);

      try {
        // Generate AI response
        const aiResponse = await generateChatResponse(
          message, 
          userId, 
          channelType, 
          channelId,
          agentId ? parseInt(agentId) : undefined
        );

        // Store AI message - Note: Using simplified format for storage compatibility
        const aiMessageData = {
          role: "assistant",
          content: aiResponse,
          conversationId: 1, // Default conversation ID
        };

        const aiMessage = await storage.createChatMessage(aiMessageData);

        console.log("✅ Chat response generated successfully");
        res.json({ userMessage, aiMessage });
      } catch (aiError) {
        console.error("Error generating AI response:", aiError);
        // Still return the user message even if AI response fails
        res.json({ userMessage, error: "Failed to generate AI response" });
      }
    } catch (error) {
      console.error("Error in chat message endpoint:", error);
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  // ============================
  // AGENT CONSOLE ROUTES
  // ============================

  app.get("/api/agent-console/users", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, async (req: any, res) => {
    try {
      const { search, channelFilter } = req.query;
      console.log("🔍 Agent Console: Fetching users with filters:", { search, channelFilter });

      // Build base query to get conversation summaries
      let baseQuery = db
        .select({
          userId: chatHistory.userId,
          channelType: chatHistory.channelType,
          channelId: chatHistory.channelId,
          agentId: chatHistory.agentId,
          messageCount: sql<number>`count(*)`,
          lastMessageAt: sql<Date>`max(${chatHistory.createdAt})`,
          lastMessage: sql<string>`(
            array_agg(${chatHistory.content} ORDER BY ${chatHistory.createdAt} DESC)
          )[1]`,
        })
        .from(chatHistory);

      // Apply filters
      let whereConditions = [];
      if (channelFilter && channelFilter !== 'all') {
        whereConditions.push(eq(chatHistory.channelType, channelFilter));
      }
      if (search) {
        whereConditions.push(
          or(
            ilike(chatHistory.userId, `%${search}%`),
            ilike(chatHistory.content, `%${search}%`)
          )
        );
      }

      // Complete query building
      if (whereConditions.length > 0) {
        baseQuery = baseQuery.where(and(...whereConditions));
      }

      const chatUsers = await baseQuery
        .groupBy(chatHistory.userId, chatHistory.channelType, chatHistory.channelId, chatHistory.agentId)
        .orderBy(sql`max(${chatHistory.createdAt}) desc`)
        .limit(100);

      // Get unique user IDs and agent IDs for batch lookup
      const userIds = [...new Set(chatUsers.map(u => u.userId))];
      const agentIds = [...new Set(chatUsers.map(u => u.agentId).filter(id => id && id > 0))];

      // Fetch user profiles
      const userProfiles = userIds.length > 0 ? await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(sql`${users.id} IN ${sql`(${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`}`) : [];

      // Fetch agent information
      const agents = agentIds.length > 0 ? await db
        .select({
          id: agentChatbots.id,
          name: agentChatbots.name,
        })
        .from(agentChatbots)
        .where(sql`${agentChatbots.id} IN ${sql`(${sql.join(agentIds.map(id => sql`${id}`), sql`, `)})`}`) : [];

      // Create lookup maps
      const userProfileMap = new Map(userProfiles.map(u => [u.id, u]));
      const agentMap = new Map(agents.map(a => [a.id, a]));

      // Format users for the agent console with proper AgentUser interface
      const formattedUsers = chatUsers.map(user => {
        const userProfile = userProfileMap.get(user.userId);
        const agent = agentMap.get(user.agentId || 0);
        
        // Generate display name
        let displayName = 'Unknown User';
        if (userProfile) {
          const fullName = `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim();
          displayName = fullName || userProfile.email || user.userId;
        } else if (user.userId.startsWith('U')) {
          displayName = `Line User ${user.userId.slice(-6)}`;
        } else {
          displayName = user.userId;
        }

        return {
          userId: user.userId,
          channelType: user.channelType,
          channelId: user.channelId,
          agentId: user.agentId || 0,
          agentName: agent?.name || 'Default Agent',
          lastMessage: user.lastMessage || 'No message',
          lastMessageAt: new Date(user.lastMessageAt).toISOString(),
          messageCount: Number(user.messageCount),
          isOnline: false, // Default to false, could be enhanced with real-time presence
          userProfile: {
            name: displayName,
          },
        };
      });

      console.log("📋 Agent Console: Returning", formattedUsers.length, "users");
      res.json(formattedUsers);
    } catch (error) {
      console.error("❌ Error fetching agent console users:", error);
      // Return empty array on error instead of error response
      res.json([]);
    }
  });

  // Get conversation messages
  app.get("/api/agent-console/conversation", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, async (req: any, res) => {
    try {
      const { userId, channelType, channelId, agentId } = req.query;
      console.log("🔍 Agent Console: Fetching conversation for:", { userId, channelType, channelId, agentId });

      if (!userId || !channelType || !channelId) {
        console.log("❌ Missing required parameters for conversation");
        return res.status(400).json({ message: "Missing required parameters: userId, channelType, channelId" });
      }

      try {
        const messages = await storage.getChatHistory(
          userId as string, 
          channelType as string, 
          channelId as string, 
          agentId ? parseInt(agentId as string) : 0
        );

        // Ensure we always return an array and format messages properly
        const messageArray = Array.isArray(messages) ? messages : [];
        
        // Format messages to match the expected Message interface
        const formattedMessages = messageArray.map((msg: any, index: number) => ({
          id: msg.id || index,
          userId: msg.userId || userId,
          channelType: msg.channelType || channelType,
          channelId: msg.channelId || channelId,
          agentId: msg.agentId || (agentId ? parseInt(agentId as string) : 0),
          messageType: msg.messageType || msg.role || 'user',
          content: msg.content || '',
          metadata: msg.metadata || null,
          createdAt: msg.createdAt || new Date().toISOString(),
        }));

        console.log("📨 Agent Console: Returning", formattedMessages.length, "formatted messages");
        res.json(formattedMessages);
      } catch (storageError) {
        console.error("❌ Storage error fetching conversation:", storageError);
        res.json([]);
      }
    } catch (error) {
      console.error("❌ Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Get conversation summary
  app.get("/api/agent-console/summary", (req: any, res: any, next: any) => {
    // Try Microsoft auth first, then fallback to Replit auth
    isMicrosoftAuthenticated(req, res, (err: any) => {
      if (!err) {
        return next();
      }
      isAuthenticated(req, res, next);
    });
  }, async (req: any, res) => {
    try {
      const { userId, channelType, channelId } = req.query;
      console.log("📊 Agent Console: Fetching summary for:", { userId, channelType, channelId });

      if (!userId || !channelType || !channelId) {
        return res.json(null);
      }

      // Get conversation statistics
      const [stats] = await db
        .select({
          totalMessages: sql<number>`count(*)`,
          firstContactAt: sql<Date>`min(${chatHistory.createdAt})`,
          lastActiveAt: sql<Date>`max(${chatHistory.createdAt})`,
        })
        .from(chatHistory)
        .where(and(
          eq(chatHistory.userId, userId as string),
          eq(chatHistory.channelType, channelType as string),
          eq(chatHistory.channelId, channelId as string)
        ));

      if (!stats || stats.totalMessages === 0) {
        return res.json(null);
      }

      // Calculate CSAT score if we have enough messages
      let csatScore = undefined;
      if (stats.totalMessages >= 3) {
        try {
          csatScore = await calculateCSATScore(
            userId as string, 
            channelType as string, 
            channelId as string
          );
        } catch (error) {
          console.error("❌ Error calculating CSAT:", error);
        }
      }

      const summary = {
        totalMessages: Number(stats.totalMessages),
        firstContactAt: stats.firstContactAt,
        lastActiveAt: stats.lastActiveAt,
        sentiment: 'neutral', // Default sentiment
        mainTopics: [], // Could be enhanced with topic analysis
        csatScore
      };

      console.log("📊 Agent Console: Returning summary:", summary);
      res.json(summary);
    } catch (error) {
      console.error("❌ Error fetching summary:", error);
      res.json(null);
    }
  });

  // Create WebSocket server for real-time communication
  const server = createServer(app);
  return server;
}