
import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { generateChatResponse } from "../services/openai";
import { storage } from "../storage";

export function registerChatRoutes(app: Express) {
  // Get chat conversations
  app.get("/api/chat/conversations", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversations = await storage.getChatConversations(userId);
      res.json(conversations || []);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Create new conversation
  app.post("/api/chat/conversations", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { title } = req.body;
      const conversationTitle = title || `New Chat ${new Date().toLocaleTimeString()}`;
      
      const conversation = await storage.createChatConversation({
        userId: userId,
        title: conversationTitle,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // Get messages for a conversation
  app.get("/api/chat/conversations/:id/messages", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id);
      const messages = await storage.getChatMessages(conversationId, userId);
      res.json(messages || []);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Send message
  app.post("/api/chat/conversations/:id/messages", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id);
      const { message } = req.body;

      // Save user message
      await storage.saveChatMessage(conversationId, userId, message, "user");

      // Get user's documents for context
      const documents = await storage.getDocuments(userId);

      // Generate AI response with userId for tool binding
      const aiResponse = await generateChatResponse(message, documents, userId);

      // Save AI response
      await storage.saveChatMessage(conversationId, userId, aiResponse, "assistant");

      res.json({ response: aiResponse });
    } catch (error) {
      console.error("Error processing chat message:", error);
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  // Send message (for FloatingAIWidget)
  app.post("/api/chat/send", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { message, conversationId, source } = req.body;

      let targetConversationId = conversationId;

      // If no conversation ID provided, create a new conversation
      if (!targetConversationId) {
        const newConversation = await storage.createChatConversation({
          userId: userId,
          title: `Chat ${new Date().toLocaleTimeString()}`,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        targetConversationId = newConversation.id;
      }

      // Save user message
      await storage.createChatMessage({
        conversationId: targetConversationId,
        role: "user",
        content: message,
        createdAt: new Date()
      });

      // Get user's documents for context
      const documents = await storage.getDocuments(userId);

      // Generate AI response with userId for tool binding
      const { generateChatResponse } = await import("../services/openai");
      const aiResponse = await generateChatResponse(message, documents, userId);

      // Save AI response
      await storage.createChatMessage({
        conversationId: targetConversationId,
        role: "assistant", 
        content: aiResponse,
        createdAt: new Date()
      });

      res.json({ 
        response: aiResponse,
        conversationId: targetConversationId
      });
    } catch (error) {
      console.error("Error processing chat message:", error);
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  // Delete conversation
  app.delete("/api/chat/conversations/:id", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id);
      await storage.deleteChatConversation(conversationId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });
}
