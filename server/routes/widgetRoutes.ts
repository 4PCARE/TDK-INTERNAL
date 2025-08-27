import type { Express } from "express";
import { db, pool } from "../db";
import { isAuthenticated } from "../replitAuth";
import { isMicrosoftAuthenticated } from "../microsoftAuth";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { eq, desc, and } from "drizzle-orm";
import {
  chatWidgets,
  widgetChatSessions,
  widgetChatMessages,
  hrEmployees,
  agentChatbots,
  chatHistory,
} from "@shared/schema";
import { nanoid } from "nanoid";

export function registerWidgetRoutes(app: Express) {
  // Serve widget embed script
  app.get("/widget/:widgetKey/embed.js", async (req, res) => {
    try {
      const { widgetKey } = req.params;

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

      console.log(`Retrieved ${messages.rows.length} messages for session ${sessionId}`);

      res.json({ messages: messages.rows });
    } catch (error) {
      console.error("Error fetching widget chat history:", error);
      res.status(500).json({ message: "Failed to fetch chat history" });
    }
  });

  // Widget chat endpoints - with optional authentication for HR integration
  app.post("/api/widget/:widgetKey/chat", (req: any, res: any, next: any) => {
    // Try to apply authentication, but don't fail if not authenticated
    smartAuth(req, res, (err: any) => {
      // Continue regardless of authentication status
      next();
    });
  }, async (req: any, res) => {
    try {
      const { widgetKey } = req.params;
      const { sessionId, message, visitorInfo } = req.body;

      // Get current user information if authenticated
      let currentUser = null;
      let hrEmployeeData = null;

      console.log(`Processing chat request for widget ${widgetKey}`);

      // Check if user is authenticated (optional for widget)
      if (req.user) {
        // Method 1: Check for claims structure (Replit Auth)
        if (req.user.claims && req.user.claims.email) {
          currentUser = req.user.claims;
          console.log(`Authenticated via claims: ${currentUser.email}`);
        }
        // Method 2: Check for direct email property
        else if (req.user.email) {
          currentUser = req.user;
          console.log(`Authenticated via direct email: ${currentUser.email}`);
        }
        // Method 3: Check for profile structure
        else if (req.user.profile && req.user.profile.email) {
          currentUser = req.user.profile;
          console.log(`Authenticated via profile: ${currentUser.email}`);
        }
      } else {
        console.log(`No authentication found - proceeding as anonymous user`);
      }

      if (currentUser && currentUser.email) {
        // Try to find HR employee data for the authenticated user
        try {
          console.log(`Looking up HR data for email: ${currentUser.email}`);
          const hrEmployeeQuery = await db.query.hrEmployees.findFirst({
            where: (hrEmployees, { eq }) => eq(hrEmployees.email, currentUser.email),
          });

          const employee = hrEmployeeQuery;

          if (employee) {
            hrEmployeeData = employee;
            console.log(`Found HR data for ${employee.name} (${employee.department})`);
          } else {
            console.log(`No HR data found for email: ${currentUser.email}`);
          }
        } catch (hrError) {
          console.error('Error looking up HR data:', hrError);
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
        if ((global as any).wsClients && (global as any).wsClients.size > 0) {
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

          (global as any).wsClients.forEach((client: any) => {
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
          console.log(`Using agentBot service for agent ${widget.agentId}`);
          console.log(`Message content: "${message}"`);

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
            console.log(`Added HR context for personalized response`);
          }

          const botMessage = {
            type: 'text',
            content: messageContent
          };

          // Placeholder for agentBot response
          let agentBotResponse = {
            success: false,
            error: 'AgentBot integration is currently incomplete.',
            response: widget.welcomeMessage || "ขออภัย ไม่สามารถเชื่อมต่อกับระบบได้ในขณะนี้",
          };

          if (agentBotResponse.success) {
            response = agentBotResponse.response;
            messageType = "ai_response";
            metadata = {
              agentId: widget.agentId,
              searchMethod: agentBotResponse.searchMethod || "agent_bot",
              documentsFound: agentBotResponse.documentsFound || 0,
              hasCarousel: agentBotResponse.hasCarousel || false
            };

            console.log(`Generated agentBot response (${response.length} chars, method: ${agentBotResponse.searchMethod})`);
          } else {
            console.log(`AgentBot failed - ${agentBotResponse.error}`);
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
        await db.insert(chatHistory).values({
          userId: session.sessionId, // Use session ID as user ID for widget conversations
          channelType: 'web',
          channelId: widget.widgetKey,
          agentId: widget.agentId,
          messageType: 'assistant',
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
        if ((global as any).wsClients && (global as any).wsClients.size > 0) {
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

          (global as any).wsClients.forEach((client: any) => {
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
}