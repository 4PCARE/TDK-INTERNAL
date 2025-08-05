
import type { Express } from "express";
import { smartAuth } from "../smartAuth";

export function registerWidgetRoutes(app: Express) {
  // Get widget configuration
  app.get("/api/widget/config", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Widget configuration would be stored in database
      const config = {
        enabled: false,
        title: "AI Assistant",
        subtitle: "How can I help you today?",
        primaryColor: "#3B82F6",
        position: "bottom-right",
        showAvatar: true,
        allowFileUpload: true,
        welcomeMessage: "Hello! How can I assist you?",
      };

      res.json(config);
    } catch (error) {
      console.error("Error fetching widget config:", error);
      res.status(500).json({ message: "Failed to fetch widget config" });
    }
  });

  // Update widget configuration
  app.put("/api/widget/config", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const config = req.body;

      // Save widget configuration to database
      res.json({ success: true, config });
    } catch (error) {
      console.error("Error updating widget config:", error);
      res.status(500).json({ message: "Failed to update widget config" });
    }
  });

  // Get widget analytics
  app.get("/api/widget/analytics", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const analytics = {
        totalSessions: 0,
        totalMessages: 0,
        averageSessionDuration: 0,
        topQuestions: [],
        userSatisfaction: 0,
      };

      res.json(analytics);
    } catch (error) {
      console.error("Error fetching widget analytics:", error);
      res.status(500).json({ message: "Failed to fetch widget analytics" });
    }
  });
}
