
import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { insertAgentChatbotSchema } from "@shared/schema";

export function registerAgentRoutes(app: Express) {
  // Get all agent chatbots
  app.get("/api/agents", smartAuth, async (req: any, res) => {
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
  app.post("/api/agents", smartAuth, async (req: any, res) => {
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
  app.get("/api/agents/:id", smartAuth, async (req: any, res) => {
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
  app.put("/api/agents/:id", smartAuth, async (req: any, res) => {
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
  app.delete("/api/agents/:id", smartAuth, async (req: any, res) => {
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
  app.patch("/api/agents/:id/toggle", smartAuth, async (req: any, res) => {
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
}
