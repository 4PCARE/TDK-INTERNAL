
import type { Express } from "express";
import { isAuthenticated, isAdmin } from "../replitAuth";
import { isMicrosoftAuthenticated } from "../microsoftAuth";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { db, pool } from "../db";
import { 
  chatConversations,
  chatMessages,
  chatWidgets,
  widgetChatSessions,
  widgetChatMessages,
  hrEmployees,
  agentChatbots,
  users,
  departments
} from "@shared/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { generateChatResponse } from "../services/openai";
import { WebSocket } from "ws";

export function registerChatRoutes(app: Express) {
  // Chat conversation routes
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

  app.post("/api/chat/conversations", isAuthenticated, async (req: any, res) => {
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
  });

  app.get("/api/chat/conversations/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id);
      const messages = await storage.getChatMessages(conversationId, userId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/chat/conversations/:id/message", isAuthenticated, async (req: any, res) => {
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
  });

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

        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
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

  // Database chat endpoint
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
        "../services/databaseQueryService"
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
      );

      // Use OpenAI to generate a response and SQL query
      const { generateDatabaseResponse } = await import("../services/openai");
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

  // Chat Widget API endpoints
  app.get("/api/chat-widgets", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      const widgets = await db
        .select({
          id: chatWidgets.id,
          userId: chatWidgets.userId,
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
          isPlatformWidget: chatWidgets.isPlatformWidget,
          createdAt: chatWidgets.createdAt,
          updatedAt: chatWidgets.updatedAt,
          agentName: agentChatbots.name,
        })
        .from(chatWidgets)
        .leftJoin(agentChatbots, eq(chatWidgets.agentId, agentChatbots.id))
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

  app.put("/api/chat-widgets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const widgetId = parseInt(req.params.id);
      const updates = req.body;

      console.log(`PUT /api/chat-widgets/${widgetId} - User: ${userId}, Updates:`, updates);

      const widget = await storage.updateChatWidget(widgetId, updates, userId);

      console.log(`PUT /api/chat-widgets/${widgetId} - Success, returning widget:`, widget);

      res.setHeader('Content-Type', 'application/json');
      res.json(widget);
    } catch (error) {
      console.error("Error updating chat widget:", error);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ message: "Failed to update chat widget" });
    }
  });

  // Platform widget management endpoints (Admin only)
  app.put("/api/chat-widgets/:id/set-platform", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const widgetId = parseInt(req.params.id);

      const updatedWidget = await storage.setPlatformWidget(widgetId, userId);
      
      res.json(updatedWidget);
    } catch (error) {
      console.error("Error setting platform widget:", error);
      res.status(500).json({ message: error.message || "Failed to set platform widget" });
    }
  });

  app.put("/api/chat-widgets/:id/unset-platform", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const widgetId = parseInt(req.params.id);

      const updatedWidget = await storage.unsetPlatformWidget(widgetId, userId);
      
      res.json(updatedWidget);
    } catch (error) {
      console.error("Error unsetting platform widget:", error);
      res.status(500).json({ message: error.message || "Failed to unset platform widget" });
    }
  });

  // Widget config endpoint for embed script
  app.get("/api/widget/:widgetKey/config", async (req, res) => {
    try {
      const { widgetKey } = req.params;

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

  // Widget chat history endpoint for public use
  app.get("/api/widget/:widgetKey/chat-history", async (req, res) => {
    try {
      const { widgetKey } = req.params;
      const { sessionId } = req.query;

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

  // Widget chat endpoints - with optional authentication for HR integration
  app.post("/api/widget/:widgetKey/chat", (req, res, next) => {
    // Try to apply authentication, but don't fail if not authenticated
    smartAuth(req, res, (err) => {
      // Continue regardless of authentication status
      next();
    });
  }, async (req: any, res) => {
    try {
      const { widgetKey } = req.params;
      const { sessionId, message, visitorInfo } = req.body;
      
      const { nanoid } = await import("nanoid");

      // Get current user information if authenticated
      let currentUser = null;
      let hrEmployeeData = null;
      
      console.log(`👤 Widget: Checking authentication - req.user exists: ${!!req.user}`);
      console.log(`👤 Widget: req.user structure:`, req.user ? Object.keys(req.user) : 'undefined');
      
      // Try multiple authentication methods
      if (req.user) {
        // Method 1: Check for claims structure (Replit Auth)
        if (req.user.claims && req.user.claims.email) {
          currentUser = req.user.claims;
          console.log(`👤 Widget: Authenticated via claims: ${currentUser.email}`);
        }
        // Method 2: Check for direct email property 
        else if (req.user.email) {
          currentUser = req.user;
          console.log(`👤 Widget: Authenticated via direct email: ${currentUser.email}`);
        }
        // Method 3: Check for profile structure
        else if (req.user.profile && req.user.profile.email) {
          currentUser = req.user.profile;
          console.log(`👤 Widget: Authenticated via profile: ${currentUser.email}`);
        }
        else {
          console.log(`👤 Widget: User exists but no email found in structure:`, JSON.stringify(req.user, null, 2));
        }
      } else {
        console.log(`👤 Widget: No authenticated user found`);
      }
      
      if (currentUser && currentUser.email) {
        // Try to find HR employee data for the authenticated user
        try {
          console.log(`👤 Widget: Looking up HR data for email: ${currentUser.email}`);
          const hrEmployeeQuery = await db.query.hrEmployees.findFirst({
            where: (hrEmployees, { eq }) => eq(hrEmployees.email, currentUser.email),
          });
          
          const employee = hrEmployeeQuery;
          
          if (employee) {
            hrEmployeeData = employee;
            console.log(`👤 Widget: Found HR data for ${employee.name} (${employee.department})`);
          } else {
            console.log(`👤 Widget: No HR data found for email: ${currentUser.email}`);
          }
        } catch (hrError) {
          console.error('👤 Widget: Error looking up HR data:', hrError);
        }
      }

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

      // If widget has an AI agent, use agentBot service for smart responses
      if (widget.agentId) {
        try {
          console.log(`🤖 Widget: Using agentBot service for agent ${widget.agentId}`);
          console.log(`🤖 Widget: Message content: "${message}"`);

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
            .limit(20); // Get more history for better context

          // Build conversation context in the format expected by agentBot
          const conversationHistory = recentMessages.reverse().map(msg => ({
            role: msg.role,
            content: msg.content
          }));

          // Use agentBot service for smart response generation
          const { processMessage, saveAssistantResponse } = await import('../agentBot');

          // Create bot context for agentBot with HR employee data
          const botContext = {
            userId: session.sessionId,
            channelType: 'chat_widget',
            channelId: widget.widgetKey,
            agentId: widget.agentId,
            messageId: `widget_${Date.now()}`,
            lineIntegration: null, // Not needed for widget chat
            hrEmployeeData: hrEmployeeData // Pass HR employee data for personalized responses
          };

          // Create bot message with HR context if available
          let messageContent = message;
          if (hrEmployeeData) {
            // Prefix the message with HR employee context
            const hrContext = `[EMPLOYEE CONTEXT: User is ${hrEmployeeData.name}, Employee ID: ${hrEmployeeData.employeeId}, Department: ${hrEmployeeData.department}, Position: ${hrEmployeeData.position}, Email: ${hrEmployeeData.email}] User asks: ${message}`;
            messageContent = hrContext;
            console.log(`👤 Widget: Added HR context for personalized response`);
          }

          const botMessage = {
            type: 'text',
            content: messageContent
          };

          const agentBotResponse = await processMessage(botMessage, botContext);

          if (agentBotResponse.success) {
            response = agentBotResponse.response;
            messageType = "ai_response";
            metadata = {
              agentId: widget.agentId,
              searchMethod: agentBotResponse.searchMethod || "agent_bot",
              documentsFound: agentBotResponse.documentsFound || 0,
              hasCarousel: agentBotResponse.hasCarousel || false
            };

            console.log(`✅ Widget: Generated agentBot response (${response.length} chars, method: ${agentBotResponse.searchMethod})`);
          } else {
            console.log(`❌ Widget: AgentBot failed - ${agentBotResponse.error}`);
            response = widget.welcomeMessage || "ขออภัย ไม่สามารถเชื่อมต่อกับระบบได้ในขณะนี้";
            messageType = "error";
            metadata = { error: agentBotResponse.error };
          }
        } catch (error) {
          console.error("Widget agentBot integration error:", error);
          // Fallback to welcome message if agentBot fails
          response = widget.welcomeMessage || "ขออภัย เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง";
          messageType = "error";
          metadata = { error: "AgentBot service unavailable" };
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
}
