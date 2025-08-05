import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { llmRouter } from "../services/llmRouter";

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
      const conversation = await storage.createChatConversation(userId, title || "New Conversation");
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

      // Get user's documents for context and conversation history
      const documents = await storage.getDocuments(userId);
      const conversationHistory = await storage.getChatMessages(conversationId, userId);
      const systemMessage = `You are a helpful assistant. You have access to the following documents: ${documents.map(d => d.content).join('\n')}`;


      // Generate AI response using LLM Router
      const chatModel = await llmRouter.getChatModel();

      const messages = [
        {
          role: "system" as const,
          content: systemMessage
        },
        ...conversationHistory.map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        })),
        {
          role: "user" as const,
          content: message
        }
      ];

      const response = await chatModel.invoke(messages);
      const aiResponse = response.content as string;

      // Save AI response
      await storage.saveChatMessage(conversationId, userId, aiResponse, "assistant");

      res.json({ response: aiResponse });
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