
import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";

export function registerAnalyticsRoutes(app: Express) {
  // Get analytics dashboard data
  app.get("/api/analytics/dashboard", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const analytics = await storage.getAnalyticsDashboard(userId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics dashboard:", error);
      res.status(500).json({ message: "Failed to fetch analytics dashboard" });
    }
  });

  // Get user activity analytics
  app.get("/api/analytics/user-activity", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      const activity = await storage.getUserActivityAnalytics(userId, {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });
      
      res.json(activity);
    } catch (error) {
      console.error("Error fetching user activity analytics:", error);
      res.status(500).json({ message: "Failed to fetch user activity analytics" });
    }
  });

  // Get document usage analytics
  app.get("/api/analytics/document-usage", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const usage = await storage.getDocumentUsageAnalytics(userId);
      res.json(usage);
    } catch (error) {
      console.error("Error fetching document usage analytics:", error);
      res.status(500).json({ message: "Failed to fetch document usage analytics" });
    }
  });

  // Get search analytics
  app.get("/api/analytics/search", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const searchAnalytics = await storage.getSearchAnalytics(userId);
      res.json(searchAnalytics);
    } catch (error) {
      console.error("Error fetching search analytics:", error);
      res.status(500).json({ message: "Failed to fetch search analytics" });
    }
  });
}
