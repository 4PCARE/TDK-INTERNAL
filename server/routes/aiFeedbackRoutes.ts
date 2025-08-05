
import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";

export function registerAiFeedbackRoutes(app: Express) {
  // Submit AI feedback
  app.post("/api/ai/feedback", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { responseId, rating, feedback, context } = req.body;
      
      const feedbackData = {
        userId,
        responseId,
        rating,
        feedback,
        context,
        submittedAt: new Date(),
      };
      
      const savedFeedback = await storage.saveAiFeedback(feedbackData);
      res.json(savedFeedback);
    } catch (error) {
      console.error("Error saving AI feedback:", error);
      res.status(500).json({ message: "Failed to save AI feedback" });
    }
  });

  // Get AI feedback analytics
  app.get("/api/ai/feedback/analytics", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const analytics = await storage.getAiFeedbackAnalytics(userId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching AI feedback analytics:", error);
      res.status(500).json({ message: "Failed to fetch AI feedback analytics" });
    }
  });

  // Get feedback history
  app.get("/api/ai/feedback/history", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { limit = 50, offset = 0 } = req.query;
      
      const history = await storage.getAiFeedbackHistory(userId, {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
      
      res.json(history);
    } catch (error) {
      console.error("Error fetching AI feedback history:", error);
      res.status(500).json({ message: "Failed to fetch AI feedback history" });
    }
  });
}
