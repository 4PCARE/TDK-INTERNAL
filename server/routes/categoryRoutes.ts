import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { insertCategorySchema } from "@shared/schema";

export function registerCategoryRoutes(app: Express) {
  // Main categories endpoint
  app.get("/api/categories", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const userId = req.user.claims.sub;
      const categories = await storage.getCategories(userId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Stats categories endpoint  
  app.get("/api/stats/categories", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const userId = req.user.claims.sub;
      const categories = await storage.getCategories(userId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const userId = req.user.claims.sub;
      const categoryData = insertCategorySchema.parse({ ...req.body, userId });
      const category = await storage.createCategory(categoryData);
      res.json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.put("/api/categories/:id", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const id = parseInt(req.params.id);
      const categoryData = insertCategorySchema.partial().parse(req.body);
      const category = await storage.updateCategory(id, categoryData);
      res.json(category);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete("/api/categories/:id", smartAuth, async (req: any, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      await storage.deleteCategory(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });
}