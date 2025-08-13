import type { Express } from "express";
import { isAuthenticated, isAdmin } from "../replitAuth";
import { isMicrosoftAuthenticated } from "../microsoftAuth";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { db } from "../db";
import {
  agentChatbots,
  agentChatbotDocuments as agentDocumentsTable,
  users,
  departments,
  documents
} from "@shared/schema";
import { eq, sql, and, desc as descOrder } from "drizzle-orm";

export function registerAgentRoutes(app: Express) {
  // Agent chatbot routes
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
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      const agent = await storage.getAgentChatbot(id, userId);

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
      const { name, description, personality, profession, responseStyle, specialSkills, channels } = req.body;

      // Validate required fields
      if (!name || !name.trim()) {
        return res.status(400).json({ message: "Agent name is required" });
      }

      const agentData = {
        name: name.trim(),
        description: description || "",
        personality: personality || "",
        profession: profession || "",
        responseStyle: responseStyle || "helpful",
        specialSkills: specialSkills || "",
        channels: channels || [],
        userId,
        isPublic: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const agent = await storage.createAgentChatbot(agentData);
      res.json(agent);
    } catch (error) {
      console.error("Error creating agent chatbot:", error);
      res.status(500).json({ message: "Failed to create agent chatbot" });
    }
  });

  app.put("/api/agent-chatbots/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      const agentData = {
        ...req.body,
        updatedAt: new Date()
      };

      const agent = await storage.updateAgentChatbot(id, userId, agentData);

      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      res.json(agent);
    } catch (error) {
      console.error("Error updating agent chatbot:", error);
      res.status(500).json({ message: "Failed to update agent chatbot" });
    }
  });

  app.delete("/api/agent-chatbots/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      await storage.deleteAgentChatbot(id, userId);
      res.json({ success: true, message: "Agent chatbot deleted successfully" });
    } catch (error) {
      console.error("Error deleting agent chatbot:", error);
      res.status(500).json({ message: "Failed to delete agent chatbot" });
    }
  });

  // Agent document associations
  app.get("/api/agent-chatbots/:id/documents", isAuthenticated, async (req: any, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(agentId)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      // Verify agent ownership
      const agent = await storage.getAgentChatbot(agentId, userId);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      console.log(`Fetching documents for agent ${agentId}...`);

      // Use a simpler approach without orderBy to test if that's the issue
      const associatedDocuments = await db
        .select()
        .from(agentDocumentsTable)
        .where(eq(agentDocumentsTable.agentId, agentId));

      // Sort manually to avoid potential SQL issues
      associatedDocuments.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

      console.log(`Found ${associatedDocuments.length} documents for agent ${agentId}`);
      res.json(associatedDocuments);
    } catch (error) {
      console.error(`Error fetching agent documents for agent ${req.params.id}:`, error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      });
      res.status(500).json({ message: "Failed to fetch agent documents" });
    }
  });

  app.post("/api/agent-chatbots/:agentId/documents/:documentId", isAuthenticated, async (req: any, res) => {
    try {
      const agentId = parseInt(req.params.agentId);
      const documentId = parseInt(req.params.documentId);
      const userId = req.user.claims.sub;

      if (isNaN(agentId) || isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid agent or document ID" });
      }

      // Verify agent ownership
      const agent = await storage.getAgentChatbot(agentId, userId);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      // Verify document access
      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found or access denied" });
      }

      // Check if association already exists
      const [existingAssociation] = await db
        .select()
        .from(agentDocumentsTable)
        .where(
          and(
            eq(agentDocumentsTable.agentId, agentId),
            eq(agentDocumentsTable.documentId, documentId)
          )
        )
        .limit(1);

      if (existingAssociation) {
        return res.status(400).json({ message: "Document already associated with agent" });
      }

      // Create association
      const [association] = await db
        .insert(agentDocumentsTable)
        .values({
          agentId,
          documentId,
          addedAt: new Date(),
        })
        .returning();

      res.json(association);
    } catch (error) {
      console.error("Error adding document to agent:", error);
      res.status(500).json({ message: "Failed to add document to agent" });
    }
  });

  app.delete("/api/agent-chatbots/:agentId/documents/:documentId", isAuthenticated, async (req: any, res) => {
    try {
      const agentId = parseInt(req.params.agentId);
      const documentId = parseInt(req.params.documentId);
      const userId = req.user.claims.sub;

      if (isNaN(agentId) || isNaN(documentId)) {
        return res.status(400).json({ message: "Invalid agent or document ID" });
      }

      // Verify agent ownership
      const agent = await storage.getAgentChatbot(agentId, userId);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      // Remove association
      const result = await db
        .delete(agentDocumentsTable)
        .where(
          and(
            eq(agentDocumentsTable.agentId, agentId),
            eq(agentDocumentsTable.documentId, documentId)
          )
        )
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ message: "Document association not found" });
      }

      res.json({ success: true, message: "Document removed from agent" });
    } catch (error) {
      console.error("Error removing document from agent:", error);
      res.status(500).json({ message: "Failed to remove document from agent" });
    }
  });

  // Agent test-chat endpoint (for testing during creation/editing)
  app.post("/api/agent-chatbots/test-chat", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { message, agentConfig, documentIds = [], chatHistory = [] } = req.body;

      if (!message || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }

      if (!agentConfig) {
        return res.status(400).json({ message: "Agent configuration is required" });
      }

      // Validate required agent config fields
      if (!agentConfig.name || !agentConfig.personality || !agentConfig.profession || !agentConfig.responseStyle) {
        return res.status(400).json({ message: "Missing required agent configuration fields" });
      }

      console.log("🧪 Testing agent with config:", {
        name: agentConfig.name,
        personality: agentConfig.personality,
        profession: agentConfig.profession,
        documentsCount: documentIds.length,
        guardrailsEnabled: agentConfig.guardrailsEnabled,
        memoryEnabled: agentConfig.memoryEnabled
      });

      // Import chatService and generate response
      const { chatService } = await import("../services/agentChatService");

      // Use generateResponseWithConfig for testing with agent configuration
      const response = await chatService.generateResponseWithConfig({
        message: message.trim(),
        agentConfig: agentConfig,
        documentIds: documentIds,
        userId: userId,
        sessionId: `test_${Date.now()}`,
        chatHistory: chatHistory,
        isTest: true
      });

      res.json({
        success: true,
        response: response.message,
        sources: response.sources || [],
        responseTime: response.responseTime || 0
      });

    } catch (error) {
      console.error("Error testing agent:", error);
      res.status(500).json({
        message: "Failed to test agent",
        error: error.message
      });
    }
  });

  // Agent testing endpoint
  app.post("/api/agent-chatbots/:id/test", isAuthenticated, async (req: any, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const { message } = req.body;

      if (isNaN(agentId)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      if (!message || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }

      // Verify agent ownership
      const agent = await storage.getAgentChatbot(agentId, userId);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      // Import chatService and generate response
      const { chatService } = await import("../services/agentChatService");

      const response = await chatService.generateAgentResponse(
        message.trim(),
        agentId,
        userId,
        `test_${Date.now()}`,
        []
      );

      res.json({
        success: true,
        response: response.message,
        sources: response.sources || [],
        responseTime: response.responseTime || 0
      });

    } catch (error) {
      console.error("Error testing agent:", error);
      res.status(500).json({
        message: "Failed to test agent",
        error: error.message
      });
    }
  });

  // Agent chat endpoint (public)
  app.post("/api/agent-chatbots/:id/chat", async (req: any, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const { message, sessionId } = req.body;

      if (isNaN(agentId)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      if (!message || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }

      // Get agent (no auth required for public chat)
      const [agent] = await db
        .select()
        .from(agentChatbots)
        .where(eq(agentChatbots.id, agentId))
        .limit(1);

      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      // Import chatService and generate response
      const { chatService } = await import("../services/agentChatService");

      const response = await chatService.generateAgentResponse(
        message.trim(),
        agentId,
        "public_user",
        sessionId || `public_${Date.now()}`,
        []
      );

      res.json({
        success: true,
        response: response.message,
        sources: response.sources || [],
        responseTime: response.responseTime || 0
      });

    } catch (error) {
      console.error("Error in agent chat:", error);
      res.status(500).json({
        message: "Failed to process chat message",
        error: error.message
      });
    }
  });

  // Get agent with documents for chat widget
  app.get("/api/agent-chatbots/:id/public", async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);

      if (isNaN(agentId)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      const [agent] = await db
        .select({
          id: agentChatbots.id,
          name: agentChatbots.name,
          description: agentChatbots.description,
          personality: agentChatbots.personality,
          profession: agentChatbots.profession,
          responseStyle: agentChatbots.responseStyle,
          specialSkills: agentChatbots.specialSkills,
          isPublic: agentChatbots.isPublic,
        })
        .from(agentChatbots)
        .where(
          and(
            eq(agentChatbots.id, agentId),
            eq(agentChatbots.isPublic, true)
          )
        )
        .limit(1);

      if (!agent) {
        return res.status(404).json({ message: "Public agent not found" });
      }

      res.json(agent);
    } catch (error) {
      console.error("Error fetching public agent:", error);
      res.status(500).json({ message: "Failed to fetch agent" });
    }
  });

  // Agent statistics
  app.get("/api/agent-chatbots/:id/stats", isAuthenticated, async (req: any, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(agentId)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      // Verify agent ownership
      const agent = await storage.getAgentChatbot(agentId, userId);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      // Get basic stats
      const stats = {
        totalConversations: 0,
        totalMessages: 0,
        averageResponseTime: 0,
        documentsCount: 0,
        lastUsed: null,
        popularQuestions: []
      };

      // Get document count
      const documentCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(agentDocumentsTable)
        .where(eq(agentDocumentsTable.agentId, agentId));

      stats.documentsCount = documentCount[0]?.count || 0;

      res.json(stats);
    } catch (error) {
      console.error("Error fetching agent stats:", error);
      res.status(500).json({ message: "Failed to fetch agent statistics" });
    }
  });

  // Duplicate agent endpoint
  app.post("/api/agent-chatbots/:id/duplicate", isAuthenticated, async (req: any, res) => {
    try {
      const sourceAgentId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(sourceAgentId)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      // Get source agent
      const sourceAgent = await storage.getAgentChatbot(sourceAgentId, userId);
      if (!sourceAgent) {
        return res.status(404).json({ message: "Source agent not found" });
      }

      // Create duplicate agent data
      const duplicateData = {
        ...sourceAgent,
        name: `${sourceAgent.name} (Copy)`,
        userId: userId,
        isPublic: false, // Always make duplicates private initially
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Remove fields that shouldn't be copied
      delete duplicateData.id;

      // Create new agent
      const newAgent = await storage.createAgentChatbot(duplicateData);

      // Copy document associations
      const sourceDocuments = await db
        .select()
        .from(agentDocumentsTable)
        .where(eq(agentDocumentsTable.agentId, sourceAgentId));

      if (sourceDocuments.length > 0) {
        const documentAssociations = sourceDocuments.map(doc => ({
          agentId: newAgent.id,
          documentId: doc.documentId,
          addedAt: new Date()
        }));

        await db.insert(agentDocumentsTable).values(documentAssociations);
      }

      res.json({
        success: true,
        agent: newAgent,
        message: "Agent duplicated successfully"
      });

    } catch (error) {
      console.error("Error duplicating agent:", error);
      res.status(500).json({ message: "Failed to duplicate agent" });
    }
  });

  // Export agent configuration
  app.get("/api/agent-chatbots/:id/export", isAuthenticated, async (req: any, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const userId = req.user.claims.sub;

      if (isNaN(agentId)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      // Get agent with documents
      const agent = await storage.getAgentChatbot(agentId, userId);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      // Get associated documents
      const associatedDocs = await db
        .select({
          documentId: agentDocumentsTable.documentId,
          documentName: documents.name,
          addedAt: agentDocumentsTable.addedAt
        })
        .from(agentDocumentsTable)
        .leftJoin(documents, eq(agentDocumentsTable.documentId, documents.id))
        .where(eq(agentDocumentsTable.agentId, agentId));

      const exportData = {
        agent: {
          ...agent,
          exportedAt: new Date().toISOString(),
          version: "1.0"
        },
        documents: associatedDocs.map(doc => ({
          name: doc.documentName,
          addedAt: doc.addedAt
        }))
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="agent-${agent.name.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.json"`);
      res.json(exportData);

    } catch (error) {
      console.error("Error exporting agent:", error);
      res.status(500).json({ message: "Failed to export agent" });
    }
  });
}