
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { WebSearchService } from "../services/webSearchService";

export function registerWebSearchRoutes(app: Express) {
  const webSearchService = WebSearchService.getInstance();

  // Get agent's whitelisted URLs
  app.get("/api/agent-chatbots/:id/whitelist-urls", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);
      
      const urls = await storage.getAgentWhitelistUrls(agentId, userId);
      res.json(urls);
    } catch (error) {
      console.error("Error fetching whitelist URLs:", error);
      res.status(500).json({ message: "Failed to fetch whitelist URLs" });
    }
  });

  // Add URL to whitelist
  app.post("/api/agent-chatbots/:id/whitelist-urls", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);
      const { url, description } = req.body;

      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ message: "Invalid URL format" });
      }

      console.log(`🔍 Extracting details for URL: ${url}`);
      
      // Extract primary details from the URL
      const primaryDetails = await webSearchService.extractUrlDetails(url);
      
      const result = await storage.addUrlToAgentWhitelist(
        agentId, 
        url, 
        description || primaryDetails.description, 
        primaryDetails, 
        userId
      );

      res.status(201).json(result[0]);
    } catch (error) {
      console.error("Error adding URL to whitelist:", error);
      res.status(500).json({ message: "Failed to add URL to whitelist" });
    }
  });

  // Update whitelisted URL
  app.put("/api/agent-chatbots/:agentId/whitelist-urls/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const updates = req.body;

      const result = await storage.updateAgentWhitelistUrl(id, updates, userId);
      
      if (result.length === 0) {
        return res.status(404).json({ message: "Whitelist entry not found" });
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Error updating whitelist URL:", error);
      res.status(500).json({ message: "Failed to update whitelist URL" });
    }
  });

  // Remove URL from whitelist
  app.delete("/api/agent-chatbots/:agentId/whitelist-urls/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);

      await storage.removeUrlFromAgentWhitelist(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing URL from whitelist:", error);
      res.status(500).json({ message: "Failed to remove URL from whitelist" });
    }
  });

  // Update agent web search configuration
  app.put("/api/agent-chatbots/:id/web-search-config", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);
      const config = req.body;

      const result = await storage.updateAgentWebSearchConfig(agentId, config, userId);
      
      if (result.length === 0) {
        return res.status(404).json({ message: "Agent not found" });
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Error updating web search config:", error);
      res.status(500).json({ message: "Failed to update web search config" });
    }
  });

  // Test web search on whitelisted URLs
  app.post("/api/agent-chatbots/:id/test-web-search", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.id);
      const { query } = req.body;

      if (!query) {
        return res.status(400).json({ message: "Query is required" });
      }

      // Get whitelisted URLs for this agent
      const whitelistEntries = await storage.getAgentWhitelistUrls(agentId, userId);
      const urls = whitelistEntries.map(entry => entry.url);

      if (urls.length === 0) {
        return res.json({ 
          results: [], 
          message: "No whitelisted URLs configured for this agent" 
        });
      }

      // Search the whitelisted URLs
      const results = await webSearchService.searchWhitelistedUrls(query, urls, 5);
      
      res.json({ 
        results,
        searchedUrls: urls.length,
        query 
      });
    } catch (error) {
      console.error("Error testing web search:", error);
      res.status(500).json({ message: "Failed to test web search" });
    }
  });
}
