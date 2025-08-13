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