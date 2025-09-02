
import express from "express";
import { storage } from "../storage";
import { WebSearchTool } from "../services/webSearchTool";
import { authenticateUser } from "../smartAuth";

export function setupWebSearchRoutes(app: express.Application) {
  // Get agent web search configuration
  app.get("/api/agents/:agentId/web-search-config", authenticateUser, async (req, res) => {
    try {
      const agentId = parseInt(req.params.agentId);
      const userId = req.user.id;

      const config = await storage.getAgentWebSearchConfig(agentId, userId);
      res.json(config);
    } catch (error) {
      console.error("Error fetching web search config:", error);
      res.status(500).json({ message: "Failed to fetch web search configuration" });
    }
  });

  // Update agent web search configuration
  app.put("/api/agents/:agentId/web-search-config", authenticateUser, async (req, res) => {
    try {
      const agentId = parseInt(req.params.agentId);
      const userId = req.user.id;
      const configData = req.body;

      const config = await storage.updateAgentWebSearchConfig(agentId, userId, configData);
      res.json(config);
    } catch (error) {
      console.error("Error updating web search config:", error);
      res.status(500).json({ message: "Failed to update web search configuration" });
    }
  });

  // Test web search for a domain
  app.post("/api/web-search/test", authenticateUser, async (req, res) => {
    try {
      const { domain, query } = req.body;
      const userId = req.user.id;

      // Create a test configuration
      const testConfig = {
        whitelistedDomains: [{
          domain,
          description: "Test domain",
          searchKeywords: [],
          priority: 1
        }],
        maxResultsPerDomain: 3,
        enableAutoTrigger: true
      };

      const webSearchTool = new WebSearchTool(userId, testConfig);
      const tool = webSearchTool.createSearchTool();
      const results = await tool.func(query);

      res.json({ results });
    } catch (error) {
      console.error("Error testing web search:", error);
      res.status(500).json({ message: "Failed to test web search" });
    }
  });

  // Check if query should trigger web search
  app.post("/api/web-search/should-trigger", authenticateUser, async (req, res) => {
    try {
      const { query, chatHistory = [] } = req.body;

      const analysis = await WebSearchTool.shouldTriggerWebSearch(query, chatHistory);
      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing search trigger:", error);
      res.status(500).json({ message: "Failed to analyze search trigger" });
    }
  });

  // Get web search logs for an agent
  app.get("/api/agents/:agentId/web-search-logs", authenticateUser, async (req, res) => {
    try {
      const agentId = parseInt(req.params.agentId);
      const userId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;

      const logs = await storage.getWebSearchLogs(agentId, userId, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching web search logs:", error);
      res.status(500).json({ message: "Failed to fetch web search logs" });
    }
  });

  // Auto-detect domain information for whitelisting
  app.post("/api/web-search/analyze-domain", authenticateUser, async (req, res) => {
    try {
      const { domain } = req.body;
      
      // This would analyze the domain and suggest configuration
      const analysis = await analyzeDomainForWhitelisting(domain);
      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing domain:", error);
      res.status(500).json({ message: "Failed to analyze domain" });
    }
  });
}

async function analyzeDomainForWhitelisting(domain: string) {
  try {
    // This could scrape the domain's homepage, analyze meta tags, etc.
    // For now, return a basic analysis
    return {
      domain,
      suggestedDescription: `Content from ${domain}`,
      suggestedKeywords: [domain.split('.')[0]],
      recommendedPriority: 5,
      isReachable: true,
      hasRobotsTxt: true,
      estimatedRelevance: 0.8
    };
  } catch (error) {
    return {
      domain,
      error: "Failed to analyze domain",
      isReachable: false
    };
  }
}
