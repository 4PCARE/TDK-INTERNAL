
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
}
