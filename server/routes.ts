import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import path from "path";
import * as fsSync from "fs";
import { registerAuthRoutes } from "./routes/auth";
import { registerDocumentRoutes } from "./routes/documents";
import { registerAgentRoutes } from "./routes/agents";
import { registerIntegrationRoutes } from "./routes/integrations";
import { registerAnalyticsRoutes } from "./routes/analytics";
import { registerChatRoutes } from "./routes/chat";
import { registerAdminRoutes } from "./routes/admin";
import { registerHrApiRoutes } from "./hrApi";
import { handleLineWebhook } from "./lineOaWebhook";
import { isAuthenticated, isAdmin } from "./replitAuth";
import { isMicrosoftAuthenticated } from "./microsoftAuth";
import { smartAuth } from "./smartAuth";
import { storage } from "./storage";
import { db } from "./db";
import pkg from 'pg';
const { Pool } = pkg;
import OpenAI from 'openai';

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

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
        const { agentChatbots } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');
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
      - 71-85: ลูกค้าพอใจ (แสดงความขอบคุณ หรือความพอใจเบื้องต้น)
      - 86-100: ลูกค้าพอใจมาก (แสดงความขอบคุณมาก พอใจการบริการ หรือชื่นชม)

      ตอบเป็นตัวเลขเดียวเท่านั้น ไม่ต้องมีข้อความอธิบาย
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
      temperature: 0.1,
    });

    const response = completion.choices[0]?.message?.content?.trim();
    const score = response ? parseInt(response) : undefined;

    if (score !== undefined && score >= 0 && score <= 100) {
      console.log(`🎯 CSAT Score calculated: ${score}/100`);
      return score;
    } else {
      console.log("⚠️ Invalid CSAT score response:", response);
      return undefined;
    }
  } catch (error) {
    console.error("❌ Error calculating CSAT score:", error);
    return undefined;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
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

  // Register all route modules
  try {
    registerAuthRoutes(app);
    registerDocumentRoutes(app);
    registerAgentRoutes(app);
    registerIntegrationRoutes(app);
    registerAnalyticsRoutes(app);
    registerChatRoutes(app);
    registerAdminRoutes(app);
    console.log("All routes registered successfully");
  } catch (error) {
    console.error("Error registering routes:", error);
    throw error;
  }

  // Agent Console Routes
  app.get('/api/agent-console/users', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const channelFilter = req.query.channelFilter || 'all';
      const searchQuery = req.query.search || '';

      console.log('🔍 Agent Console Users API: Query params:', {
        userId,
        channelFilter,
        searchQuery
      });

      // Get all unique conversations from chat history
      const query = `
        WITH latest_conversations AS (
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
          WHERE ac.user_id = $1
            AND ($2 = 'all' OR ch.channel_type = $2)
            AND ($3 = '' OR ch.content ILIKE $4)
          ORDER BY ch.channel_id, ch.channel_type, ch.agent_id, ch.created_at DESC
        )
        SELECT * FROM latest_conversations
        ORDER BY last_message_at DESC
        LIMIT 50
      `;

      const params = [
        userId,
        channelFilter,
        searchQuery,
        searchQuery ? `%${searchQuery}%` : ''
      ];

      const result = await pool.query(query, params);

      const chatUsers = result.rows.map(row => ({
        userId: row.user_id,
        channelType: row.channel_type,
        channelId: row.channel_id,
        agentId: row.agent_id,
        agentName: row.agent_name,
        lastMessage: row.last_message,
        lastMessageAt: row.last_message_at,
        messageCount: parseInt(row.message_count),
        isOnline: false, // Default to offline for now
        userProfile: {
          name: row.channel_type === 'web' 
            ? `Web User ${(row.user_id || 'unknown').slice(-4)}`
            : `User ${(row.channel_id || 'unknown').slice(-4)}`
        }
      }));

      console.log('🔍 Agent Console Users API: Found users:', chatUsers.length);
      res.json(chatUsers);
    } catch (error) {
      console.error('❌ Error fetching agent console users:', error);
      res.status(500).json({ 
        message: 'Failed to fetch users',
        error: error.message 
      });
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

      const messages = await storage.getChatHistory(targetUserId, channelType, channelId, parseInt(agentId));

      console.log(`📨 Conversation response: ${messages.length} messages`);
      res.json(messages);
    } catch (error) {
      console.error("❌ Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  app.get('/api/agent-console/summary', isAuthenticated, async (req: any, res) => {
    try {
      const { userId: targetUserId, channelType, channelId } = req.query;

      if (!targetUserId || !channelType || !channelId) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      // Get basic conversation summary
      const query = `
        SELECT 
          COUNT(*) as total_messages,
          MIN(created_at) as first_contact_at,
          MAX(created_at) as last_active_at
        FROM chat_history 
        WHERE channel_id = $1 AND channel_type = $2
      `;

      const result = await pool.query(query, [channelId, channelType]);
      const row = result.rows[0];

      // Calculate CSAT score if there are enough messages
      let csatScore = null;
      if (parseInt(row.total_messages) >= 3) {
        try {
          // Get agent ID from first message to use correct memory limits
          const firstMessageQuery = `
            SELECT agent_id
            FROM chat_history
            WHERE user_id = $1 AND channel_type = $2 AND channel_id = $3
            ORDER BY created_at ASC
            LIMIT 1
          `;
          const firstMessageResult = await pool.query(firstMessageQuery, [targetUserId, channelType, channelId]);
          let agentId = firstMessageResult.rows.length > 0 ? Number(firstMessageResult.rows[0].agent_id) : null;

          if (agentId) {
            csatScore = await calculateCSATScore(targetUserId, channelType, channelId, agentId);
          }
        } catch (error) {
          console.error("Error calculating CSAT score:", error);
        }
      }

      const summary = {
        totalMessages: parseInt(row.total_messages),
        firstContactAt: row.first_contact_at,
        lastActiveAt: row.last_active_at,
        sentiment: 'neutral',
        mainTopics: [],
        csatScore: csatScore
      };

      console.log("📊 Summary response:", summary);
      res.json(summary);
    } catch (error) {
      console.error("❌ Error fetching conversation summary:", error);
      res.status(500).json({ message: "Failed to fetch conversation summary" });
    }
  });

  app.post('/api/agent-console/send-message', isAuthenticated, async (req: any, res) => {
    try {
      const { userId: targetUserId, channelType, channelId, agentId, message, messageType = 'agent' } = req.body;

      if (!targetUserId || !channelType || !channelId || !agentId || !message) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      console.log("📤 Sending message:", {
        targetUserId,
        channelType,
        channelId,
        agentId,
        messageLength: message.length
      });

      // Store the message in chat history
      await storage.saveChatMessage(channelId, channelType, parseInt(agentId), {
        messageType,
        content: message,
        timestamp: new Date().toISOString(),
        sentBy: req.user.claims.sub,
        humanAgent: true,
        humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
      });

      // Broadcast via WebSocket if available
      if (typeof (global as any).broadcastToAgentConsole === 'function') {
        (global as any).broadcastToAgentConsole({
          type: 'new_message',
          data: {
            userId: targetUserId,
            channelType,
            channelId,
            agentId: parseInt(agentId),
            message,
            messageType,
            timestamp: new Date().toISOString(),
            humanAgentName: req.user.claims.first_name || req.user.claims.email || 'Human Agent'
          }
        });
      }

      res.json({ 
        success: true, 
        message: "Message sent successfully" 
      });

    } catch (error) {
      console.error("❌ Error sending message:", error);
      res.status(500).json({ 
        message: "Failed to send message",
        error: error.message 
      });
    }
  });

  // Serve widget embed script
  app.get("/widget/:widgetKey/embed.js", async (req, res) => {
    try {
      const { widgetKey } = req.params;
      const { chatWidgets } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");

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

  // Line OA webhook route
  app.post("/api/webhook/lineoa/:token", handleLineWebhook);

  // Category routes
  app.get("/api/categories", async (req: any, res: any, next: any) => {
    const { isMicrosoftAuthenticated } = await import("./microsoftAuth");
    const { isAuthenticated } = await import("./replitAuth");

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
      const { storage } = await import("./storage");
      const categories = await storage.getCategories(userId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", async (req: any, res) => {
    const { isAuthenticated } = await import("./replitAuth");

    isAuthenticated(req, res, async () => {
      try {
        const userId = req.user.claims.sub;
        const { storage } = await import("./storage");
        const { insertCategorySchema } = await import("@shared/schema");

        const categoryData = insertCategorySchema.parse({ ...req.body, userId });
        const category = await storage.createCategory(categoryData);
        res.json(category);
      } catch (error) {
        console.error("Error creating category:", error);
        res.status(500).json({ message: "Failed to create category" });
      }
    });
  });

  app.put("/api/categories/:id", async (req: any, res) => {
    const { isAuthenticated } = await import("./replitAuth");

    isAuthenticated(req, res, async () => {
      try {
        const id = parseInt(req.params.id);
        const { storage } = await import("./storage");
        const { insertCategorySchema } = await import("@shared/schema");

        const categoryData = insertCategorySchema.partial().parse(req.body);
        const category = await storage.updateCategory(id, categoryData);
        res.json(category);
      } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ message: "Failed to update category" });
      }
    });
  });

  app.delete("/api/categories/:id", async (req: any, res) => {
    const { isAuthenticated } = await import("./replitAuth");

    isAuthenticated(req, res, async () => {
      try {
        const userId = req.user.claims.sub;
        const id = parseInt(req.params.id);
        const { storage } = await import("./storage");

        await storage.deleteCategory(id, userId);
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ message: "Failed to delete category" });
      }
    });
  });

  // Category statistics endpoint
  app.get("/api/stats/categories", async (req: any, res) => {
    const { isAuthenticated } = await import("./replitAuth");

    isAuthenticated(req, res, async () => {
      try {
        const userId = req.user.claims.sub;
        const { documents } = await import("@shared/schema");
        const { db } = await import("./db");
        const { sql, eq } = await import("drizzle-orm");

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
  });

  // Tag statistics endpoint
  app.get("/api/stats/tags", async (req: any, res) => {
    const { isAuthenticated } = await import("./replitAuth");

    isAuthenticated(req, res, async () => {
      try {
        const userId = req.user.claims.sub;
        const { documents } = await import("@shared/schema");
        const { db } = await import("./db");
        const { eq } = await import("drizzle-orm");

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
  });

  // Vector database management routes
  app.get("/api/vector/stats", async (req: any, res) => {
    const { isAuthenticated } = await import("./replitAuth");

    isAuthenticated(req, res, async () => {
      try {
        const userId = req.user.claims.sub;
        const { vectorService } = await import("./services/vectorService");

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
  });

  // Re-vectorize all documents endpoint
  app.post("/api/vector/reindex-all", async (req: any, res: any, next: any) => {
    const { isMicrosoftAuthenticated } = await import("./microsoftAuth");
    const { isAuthenticated } = await import("./replitAuth");

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
      const { preserveExistingEmbeddings = true } = req.body; // Default to preserving for re-indexing
      const { storage } = await import("./storage");
      const { vectorService } = await import("./services/vectorService");

      const documents = await storage.getDocuments(userId);

      let processedCount = 0;
      let errorCount = 0;
      const results: any[] = [];

      console.log(`Re-indexing ${documents.length} documents with preserve mode: ${preserveExistingEmbeddings}`);

      for (const document of documents) {
        if (document.content && document.content.trim().length > 0) {
          try {
            const result = await vectorService.addDocument(
              document.id.toString(),
              document.content,
              {
                userId,
                documentName: document.name,
                mimeType: document.mimeType,
                tags: document.tags || [],
              },
              document.mimeType,
              preserveExistingEmbeddings
            );

            processedCount++;
            results.push({
              id: document.id,
              name: document.name,
              status: "success",
              result: result
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
        message: `Re-indexing completed. Processed: ${processedCount}, Errors: ${errorCount}${preserveExistingEmbeddings ? ' (preserved existing embeddings)' : ''}`,
        processed: processedCount,
        errors: errorCount,
        total: documents.length,
        preservedExistingEmbeddings: preserveExistingEmbeddings,
        results,
      });
    } catch (error) {
      console.error("Error re-indexing documents:", error);
      res.status(500).json({ message: "Failed to re-index documents" });
    }
  });

  // Test Gemini embeddings endpoint
  app.post("/api/test/gemini-embedding", async (req: any, res: any, next: any) => {
    const { isMicrosoftAuthenticated } = await import("./microsoftAuth");
    const { isAuthenticated } = await import("./replitAuth");

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
  });

  // Data connection management routes
  app.get("/api/data-connections", async (req: any, res) => {
    const { isAuthenticated } = await import("./replitAuth");

    isAuthenticated(req, res, async () => {
      try {
        const userId = req.user.claims.sub;
        const { storage } = await import("./storage");
        const connections = await storage.getDataConnections(userId);
        res.json(connections);
      } catch (error) {
        console.error("Error fetching data connections:", error);
        res.status(500).json({ message: "Failed to fetch data connections" });
      }
    });
  });

  app.post("/api/data-connections", async (req: any, res) => {
    const { isAuthenticated } = await import("./replitAuth");

    isAuthenticated(req, res, async () => {
      try {
        const userId = req.user.claims.sub;
        const { storage } = await import("./storage");
        const { insertDataConnectionSchema } = await import("@shared/schema");

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
  });

  // Create HTTP server
  const server = createServer(app);

  // Setup WebSocket server for real-time features on a separate port in development
  const wsPort = process.env.NODE_ENV === 'development' ? 5001 : server;
  const wss = new WebSocketServer({ 
    port: typeof wsPort === 'number' ? wsPort : undefined,
    server: typeof wsPort === 'number' ? undefined : wsPort
  });

  // Global WebSocket clients storage
  if (!global.wsClients) {
    global.wsClients = new Set();
  }

  wss.on('connection', (ws: WebSocket, req) => {
    console.log('🔌 WebSocket client connected:', {
      url: req.url,
      origin: req.headers.origin,
      userAgent: req.headers['user-agent']?.substring(0, 50) + '...',
      totalClients: global.wsClients.size + 1
    });

    // Add client to global set
    global.wsClients.add(ws);
    console.log('📊 WebSocket clients count:', global.wsClients.size);

    // Handle client messages
    ws.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('📨 WebSocket message received:', data.type || 'unknown');

        // Echo back for testing
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (error) {
        console.error('❌ WebSocket message error:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      global.wsClients.delete(ws);
      console.log('🔌 WebSocket client disconnected, remaining clients:', global.wsClients.size);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('🔌 WebSocket error:', error);
      global.wsClients.delete(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to AI-KMS WebSocket server',
      timestamp: Date.now()
    }));
  });

  return server;
}