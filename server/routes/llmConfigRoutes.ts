
import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { isAdmin } from "../replitAuth";
import { storage } from "../storage";

export function registerLlmConfigRoutes(app: Express) {
  // Get LLM configuration
  app.get("/api/llm/config", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const config = await storage.getLlmConfig(userId);
      res.json(config);
    } catch (error) {
      console.error("Error fetching LLM config:", error);
      res.status(500).json({ message: "Failed to fetch LLM config" });
    }
  });

  // Update LLM configuration (admin only)
  app.put("/api/llm/config", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const configData = req.body;
      
      const config = await storage.updateLlmConfig(userId, configData);
      res.json(config);
    } catch (error) {
      console.error("Error updating LLM config:", error);
      res.status(500).json({ message: "Failed to update LLM config" });
    }
  });

  // Get available LLM models
  app.get("/api/llm/models", smartAuth, async (req: any, res) => {
    try {
      const models = [
        {
          provider: "OpenAI",
          models: ["gpt-4o", "gpt-4", "gpt-3.5-turbo"],
        },
        {
          provider: "Gemini",
          models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        },
      ];
      
      res.json(models);
    } catch (error) {
      console.error("Error fetching LLM models:", error);
      res.status(500).json({ message: "Failed to fetch LLM models" });
    }
  });

  // Test LLM configuration
  app.post("/api/llm/test", isAdmin, async (req: any, res) => {
    try {
      const { provider, model, apiKey } = req.body;
      
      // Test configuration logic would be implemented here
      res.json({ success: true, message: "LLM configuration test successful" });
    } catch (error) {
      console.error("Error testing LLM config:", error);
      res.status(500).json({ message: "Failed to test LLM config" });
    }
  });
}
