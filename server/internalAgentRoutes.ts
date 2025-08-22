
import type { Express } from "express";
import { isAuthenticated } from "./replitAuth";
import { storage } from "./storage";

export function registerInternalAgentRoutes(app: Express) {
  // Create new internal chat session
  app.post("/api/internal-chat/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const { agentId, title } = req.body;
      const userId = req.user.claims.sub;

      console.log("Creating internal chat session:", { agentId, title, userId });

      if (!agentId) {
        console.log("❌ Missing agentId in request body");
        return res.status(400).json({ error: "Agent ID is required" });
      }

      // Parse and validate agent ID
      const parsedAgentId = parseInt(agentId);
      if (isNaN(parsedAgentId)) {
        console.log("❌ Invalid agentId format:", agentId);
        return res.status(400).json({ error: "Invalid agent ID format" });
      }

      console.log(`🔍 Verifying agent ${parsedAgentId} for user ${userId}`);

      // Verify user owns the agent with better error handling
      let agent;
      try {
        agent = await storage.getAgentChatbot(parsedAgentId, userId);
      } catch (dbError) {
        console.error("❌ Database error fetching agent:", dbError);
        return res.status(500).json({ error: "Database error while verifying agent" });
      }

      if (!agent) {
        console.log(`❌ Agent ${parsedAgentId} not found or access denied for user ${userId}`);
        return res.status(404).json({ error: "Agent not found or access denied" });
      }

      console.log(`✅ Agent verified: ${agent.name} (ID: ${agent.id})`);

      // Create new session
      const sessionId = `internal_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      
      // Create session object
      const session = {
        id: sessionId,
        agentId: parsedAgentId,
        agentName: agent.name,
        userId,
        title: title || `Chat with ${agent.name}`,
        createdAt: new Date().toISOString(),
        messageCount: 0,
      };

      console.log("✅ Internal chat session created successfully:", { 
        sessionId: session.id, 
        agentName: session.agentName,
        title: session.title 
      });

      res.setHeader('Content-Type', 'application/json');
      res.json(session);
    } catch (error) {
      console.error("❌ Error creating internal chat session:", error);
      console.error("❌ Error stack:", error);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ 
        error: "Failed to create chat session", 
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Get all internal chat sessions for user (without specific agent filter)
  app.get("/api/internal-chat/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      console.log(`🔍 Fetching all internal chat sessions for user ${userId}`);

      // Get all internal chat sessions across all agents
      const { chatHistory, agentChatbots } = await import("@shared/schema");
      const { eq, desc, sql, and } = await import('drizzle-orm');
      const { db } = await import("./db");

      const sessions = await db
        .select({
          sessionId: chatHistory.channelId,
          agentId: chatHistory.agentId,
          agentName: agentChatbots.name,
          createdAt: sql<string>`MIN(${chatHistory.createdAt})`.as('createdAt'),
          messageCount: sql<number>`COUNT(*)`.as('messageCount'),
        })
        .from(chatHistory)
        .leftJoin(agentChatbots, eq(chatHistory.agentId, agentChatbots.id))
        .where(and(
          eq(chatHistory.userId, userId),
          eq(chatHistory.channelType, "internal_chat")
        ))
        .groupBy(chatHistory.channelId, chatHistory.agentId, agentChatbots.name)
        .orderBy(desc(sql`MIN(${chatHistory.createdAt})`));

      const formattedSessions = sessions.map(session => ({
        id: session.sessionId,
        agentId: session.agentId,
        agentName: session.agentName || 'Unknown Agent',
        createdAt: session.createdAt,
        messageCount: Number(session.messageCount),
      }));

      console.log(`📋 Returning ${formattedSessions.length} total sessions`);

      res.setHeader('Content-Type', 'application/json');
      res.json(formattedSessions);
    } catch (error) {
      console.error("❌ Error fetching all internal chat sessions:", error);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: "Failed to fetch chat sessions" });
    }
  });

  // Get internal chat sessions for specific agent
  app.get("/api/internal-chat/sessions/:agentId", isAuthenticated, async (req: any, res) => {
    try {
      const { agentId } = req.params;
      const userId = req.user.claims.sub;

      console.log(`🔍 [DEBUG] Route hit: /api/internal-chat/sessions/${agentId}`);
      console.log(`🔍 [DEBUG] User ID: ${userId}`);
      console.log(`🔍 [DEBUG] Agent ID param: ${agentId}`);

      // Parse and validate agent ID
      const parsedAgentId = parseInt(agentId);
      if (isNaN(parsedAgentId)) {
        console.log("❌ Invalid agentId format:", agentId);
        return res.status(400).json({ error: "Invalid agent ID format" });
      }

      // Verify user owns the agent
      const agent = await storage.getAgentChatbot(parsedAgentId, userId);
      if (!agent) {
        console.log(`❌ Agent ${parsedAgentId} not found or access denied for user ${userId}`);
        return res.status(404).json({ error: "Agent not found or access denied" });
      }

      console.log(`✅ Agent verified: ${agent.name} (ID: ${agent.id})`);

      // Get unique chat sessions for this user and agent from chat_history
      const sessions = await storage.getInternalChatSessions(userId, parsedAgentId);

      console.log(`📋 Returning ${sessions.length} sessions for agent ${parsedAgentId}`);

      res.setHeader('Content-Type', 'application/json');
      res.json(sessions);
    } catch (error) {
      console.error("❌ Error fetching internal chat sessions:", error);
      console.error("❌ Error stack:", error.stack);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: "Failed to fetch chat sessions" });
    }
  });

  // Get messages for a specific internal chat session (simplified endpoint)
  app.get("/api/internal-chat/messages/:sessionId", isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user.claims.sub;

      console.log(`📚 Fetching messages for session ${sessionId}, user ${userId}`);

      // Get chat history for this session
      const chatHistory = await storage.getChatHistory(
        userId,
        "internal_chat",
        sessionId,
        undefined, // agentId not required for this query
        100 // Get up to 100 messages
      );

      console.log(`📚 Retrieved ${chatHistory.length} messages for session ${sessionId}`);

      res.setHeader('Content-Type', 'application/json');
      res.json(chatHistory);
    } catch (error) {
      console.error("❌ Error fetching chat messages:", error);
      console.error("❌ Error stack:", error.stack);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: "Failed to fetch chat messages" });
    }
  });

  // Get chat history for a specific internal chat session
  app.get("/api/internal-chat/sessions/:agentId/:sessionId/history", isAuthenticated, async (req: any, res) => {
    try {
      const { agentId, sessionId } = req.params;
      const userId = req.user.claims.sub;

      console.log(`📚 Fetching chat history for session ${sessionId}, agent ${agentId}, user ${userId}`);

      // Parse and validate agent ID
      const parsedAgentId = parseInt(agentId);
      if (isNaN(parsedAgentId)) {
        console.log("❌ Invalid agentId format:", agentId);
        return res.status(400).json({ error: "Invalid agent ID format" });
      }

      // Verify user owns the agent
      const agent = await storage.getAgentChatbot(parsedAgentId, userId);
      if (!agent) {
        console.log(`❌ Agent ${parsedAgentId} not found or access denied for user ${userId}`);
        return res.status(404).json({ error: "Agent not found or access denied" });
      }

      // Get chat history for this session
      const chatHistory = await storage.getChatHistory(
        userId,
        "internal_chat",
        sessionId,
        parsedAgentId,
        100 // Get up to 100 messages
      );

      console.log(`📚 Retrieved ${chatHistory.length} messages for session ${sessionId}`);

      res.setHeader('Content-Type', 'application/json');
      res.json(chatHistory);
    } catch (error) {
      console.error("❌ Error fetching chat history:", error);
      console.error("❌ Error stack:", error.stack);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: "Failed to fetch chat history" });
    }
  });

  // Send message to internal chat
  app.post("/api/internal-chat/message", isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId, agentId, content } = req.body;
      const userId = req.user.claims.sub;

      console.log(`🤖 Internal Chat: Received request - sessionId: ${sessionId}, agentId: ${agentId}, userId: ${userId}`);
      console.log(`🤖 Internal Chat: Message content: "${content}"`);

      // Validate required fields
      if (!sessionId || !agentId || !content) {
        console.log(`❌ Internal Chat: Missing required fields - sessionId: ${!!sessionId}, agentId: ${!!agentId}, content: ${!!content}`);
        return res.status(400).json({ error: "Missing required fields: sessionId, agentId, and content are required" });
      }

      // Verify user owns the agent
      const agent = await storage.getAgentChatbot(parseInt(agentId), userId);
      if (!agent) {
        console.log(`❌ Internal Chat: Agent ${agentId} not found or access denied for user ${userId}`);
        return res.status(404).json({ error: "Agent not found or access denied" });
      }

      console.log(`✅ Internal Chat: Agent ${agent.name} verified for user ${userId}`);

      // Save user message to chat history
      const userChatHistory = await storage.createChatHistory({
        userId: userId,
        channelType: "internal_chat",
        channelId: sessionId,
        agentId: parseInt(agentId),
        messageType: "user",
        content: content,
        metadata: {
          messageType: "text",
          timestamp: new Date().toISOString(),
        },
      });

      console.log(`💾 Internal Chat: Saved user message with ID ${userChatHistory.id}`);

      // Import the agent bot functionality
      const { processMessage } = await import("./agentBot");

      // Create bot context for internal chat
      const botContext = {
        userId: userId,
        channelType: "internal_chat",
        channelId: sessionId,
        agentId: parseInt(agentId),
        messageId: `internal_${Date.now()}`,
        lineIntegration: null, // Not needed for internal chat
      };

      // Create bot message
      const botMessage = {
        type: "text",
        content: content,
        metadata: {},
      };

      console.log(`🤖 Internal Chat: Processing message with agentBot...`);

      // Process message with agent bot
      const botResponse = await processMessage(botMessage, botContext);

      console.log(`🤖 Internal Chat: AgentBot response:`, botResponse);

      if (!botResponse.success) {
        console.log(`❌ Internal Chat: AgentBot failed - ${botResponse.error}`);
        return res.status(500).json({ error: botResponse.error || "Failed to process message" });
      }

      // Save assistant response to chat history
      const assistantChatHistory = await storage.createChatHistory({
        userId: userId,
        channelType: "internal_chat",
        channelId: sessionId,
        agentId: parseInt(agentId),
        messageType: "assistant",
        content: botResponse.response,
        metadata: {
          messageType: "text",
          timestamp: new Date().toISOString(),
          ...(botResponse.metadata || {}),
        },
      });

      console.log(`💾 Internal Chat: Saved assistant response with ID ${assistantChatHistory.id}`);

      console.log(`✅ Internal Chat: Agent ${agentId} response: "${botResponse.response.substring(0, 100)}..."`);

      res.setHeader('Content-Type', 'application/json');
      res.json({
        response: botResponse.response,
        sessionId: sessionId,
        metadata: botResponse.metadata || {},
        userMessageId: userChatHistory.id,
        assistantMessageId: assistantChatHistory.id,
      });
    } catch (error) {
      console.error("❌ Error in internal chat message:", error);
      console.error("❌ Error stack:", error.stack);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: "Failed to send message", details: error.message });
    }
  });
}
