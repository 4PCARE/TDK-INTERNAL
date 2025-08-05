
import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";

export function registerAiResponseAnalysisRoutes(app: Express) {
  // Get AI response analysis
  app.get("/api/ai/analysis/responses", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate, limit = 100 } = req.query;
      
      const analysis = await storage.getAiResponseAnalysis(userId, {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: parseInt(limit as string),
      });
      
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching AI response analysis:", error);
      res.status(500).json({ message: "Failed to fetch AI response analysis" });
    }
  });

  // Get response quality metrics
  app.get("/api/ai/analysis/quality", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const metrics = await storage.getAiResponseQualityMetrics(userId);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching AI response quality metrics:", error);
      res.status(500).json({ message: "Failed to fetch AI response quality metrics" });
    }
  });

  // Get response topics analysis
  app.get("/api/ai/analysis/topics", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const topics = await storage.getAiResponseTopicsAnalysis(userId);
      res.json(topics);
    } catch (error) {
      console.error("Error fetching AI response topics analysis:", error);
      res.status(500).json({ message: "Failed to fetch AI response topics analysis" });
    }
  });
}
