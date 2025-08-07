import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { insertAgentChatbotSchema } from "@shared/schema";

export function registerAgentRoutes(app: Express) {
  // Get all agent chatbots
  app.get("/api/agent-chatbots", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agents = await storage.getAgentChatbots(userId);
      res.json(agents);
    } catch (error) {
      console.error("Error fetching agents:", error);
      res.status(500).json({ message: "Failed to fetch agents" });
    }
  });

  // Create new agent chatbot
  app.post("/api/agent-chatbots", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentData = insertAgentChatbotSchema.parse({ ...req.body, userId });
      const agent = await storage.createAgentChatbot(agentData);
      res.json(agent);
    } catch (error) {
      console.error("Error creating agent:", error);
      res.status(500).json({ message: "Failed to create agent" });
    }
  });

  // Get specific agent chatbot
  app.get("/api/agent-chatbots/:id", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);
      const agent = await storage.getAgentChatbot(agentId, userId);

      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      res.json(agent);
    } catch (error) {
      console.error("Error fetching agent:", error);
      res.status(500).json({ message: "Failed to fetch agent" });
    }
  });

  // Update agent chatbot
  app.put("/api/agent-chatbots/:id", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);
      const updateData = insertAgentChatbotSchema.partial().parse(req.body);

      const agent = await storage.updateAgentChatbot(agentId, userId, updateData);
      res.json(agent);
    } catch (error) {
      console.error("Error updating agent:", error);
      res.status(500).json({ message: "Failed to update agent" });
    }
  });

  // Delete agent chatbot
  app.delete("/api/agent-chatbots/:id", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);

      await storage.deleteAgentChatbot(agentId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting agent:", error);
      res.status(500).json({ message: "Failed to delete agent" });
    }
  });

  // Toggle agent active status
  app.patch("/api/agent-chatbots/:id/toggle", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);

      const agent = await storage.toggleAgentChatbotStatus(agentId, userId);
      res.json(agent);
    } catch (error) {
      console.error("Error toggling agent status:", error);
      res.status(500).json({ message: "Failed to toggle agent status" });
    }
  });

  // Agent Console - Get active users
  app.get("/api/agent-console/users", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const userId = req.user.claims.sub;
      const searchQuery = req.query.search as string;
      const channelFilter = req.query.channelFilter as string;

      const users = await storage.getAgentConsoleUsers(userId, { searchQuery, channelFilter });
      res.json(users);
    } catch (error) {
      console.error("Error fetching agent console users:", error);
      res.status(500).json({ message: "Failed to fetch agent console users" });
    }
  });

  // Agent Console - Get conversation
  app.get("/api/agent-console/conversation", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const userId = req.query.userId as string;
      const channelType = req.query.channelType as string;
      const channelId = req.query.channelId as string;
      const agentId = parseInt(req.query.agentId as string);

      const messages = await storage.getAgentConsoleConversation(userId, channelType, channelId, agentId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // Agent Console - Send message
  app.post("/api/agent-console/send-message", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const { userId, channelType, channelId, agentId, message } = req.body;

      const result = await storage.sendAgentConsoleMessage({
        userId,
        channelType,
        channelId,
        agentId,
        message,
        messageType: 'agent'
      });

      res.json(result);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Agent Console - Get conversation summary
  app.get("/api/agent-console/summary", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const userId = req.query.userId as string;
      const channelType = req.query.channelType as string;
      const channelId = req.query.channelId as string;

      const summary = await storage.getAgentConsoleSummary(userId, channelType, channelId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching summary:", error);
      res.status(500).json({ message: "Failed to fetch summary" });
    }
  });

  // Get agent chatbot documents
  app.get("/api/agent-chatbots/:id/documents", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);
      const documents = await storage.getAgentChatbotDocuments(agentId, userId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching agent documents:", error);
      res.status(500).json({ message: "Failed to fetch agent documents" });
    }
  });

  // Add document to agent chatbot
  app.post("/api/agent-chatbots/:id/documents/:documentId", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);
      const documentId = parseInt(req.params.documentId);

      const result = await storage.addDocumentToAgentChatbot(agentId, documentId, userId);
      res.json(result);
    } catch (error) {
      console.error("Error adding document to agent:", error);
      res.status(500).json({ message: "Failed to add document to agent" });
    }
  });

  // Remove document from agent chatbot
  app.delete("/api/agent-chatbots/:id/documents/:documentId", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);
      const documentId = parseInt(req.params.documentId);

      await storage.removeDocumentFromAgentChatbot(agentId, documentId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing document from agent:", error);
      res.status(500).json({ message: "Failed to remove document from agent" });
    }
  });

  // Get social integrations
  app.get("/api/social-integrations", smartAuth, async (req: any, res) => {
    try {
      console.log("🔍 Fetching social integrations for user:", req.user?.id);

      // Ensure we have a valid user
      if (!req.user?.id) {
        return res.status(401).json({ 
          error: "Unauthorized", 
          message: "User not authenticated" 
        });
      }

      const integrations = await storage.getSocialIntegrations(req.user.id);
      console.log("✅ Found", integrations.length, "social integrations");

      // Explicitly set JSON content type
      res.setHeader('Content-Type', 'application/json');
      res.json(integrations);
    } catch (error) {
      console.error("💥 Error fetching social integrations:", error);
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ 
        error: "Internal Server Error",
        message: "Failed to fetch social integrations" 
      });
    }
  });
}