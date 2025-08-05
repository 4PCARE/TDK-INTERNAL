
import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";

export function registerLineTemplateRoutes(app: Express) {
  // Get LINE templates
  app.get("/api/line/templates", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templates = await storage.getLineTemplates(userId);
      res.json(templates || []);
    } catch (error) {
      console.error("Error fetching LINE templates:", error);
      res.status(500).json({ message: "Failed to fetch LINE templates" });
    }
  });

  // Create LINE template
  app.post("/api/line/templates", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateData = { ...req.body, userId };
      const template = await storage.createLineTemplate(templateData);
      res.json(template);
    } catch (error) {
      console.error("Error creating LINE template:", error);
      res.status(500).json({ message: "Failed to create LINE template" });
    }
  });

  // Update LINE template
  app.put("/api/line/templates/:id", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateId = parseInt(req.params.id);
      const updateData = req.body;
      
      const template = await storage.updateLineTemplate(templateId, userId, updateData);
      res.json(template);
    } catch (error) {
      console.error("Error updating LINE template:", error);
      res.status(500).json({ message: "Failed to update LINE template" });
    }
  });

  // Delete LINE template
  app.delete("/api/line/templates/:id", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateId = parseInt(req.params.id);
      
      await storage.deleteLineTemplate(templateId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting LINE template:", error);
      res.status(500).json({ message: "Failed to delete LINE template" });
    }
  });

  // Get LINE template usage analytics
  app.get("/api/line/templates/analytics", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const analytics = await storage.getLineTemplateAnalytics(userId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching LINE template analytics:", error);
      res.status(500).json({ message: "Failed to fetch LINE template analytics" });
    }
  });
}
