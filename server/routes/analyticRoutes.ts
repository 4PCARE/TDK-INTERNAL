// Document Demand Insights API
  app.get(
    "/api/analytics/document-demand",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const insights = await storage.getDocumentAccessStats(userId);
        res.json(insights);
      } catch (error) {
        console.error("Error fetching document demand insights:", error);
        res.status(500).json({ message: "Failed to fetch insights" });
      }
    },
  );

  // AI Assistant Feedback API
  app.post("/api/ai-feedback", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const feedback = await storage.createAiFeedback({
        ...req.body,
        userId,
      });
      res.json(feedback);
    } catch (error) {
      console.error("Error creating AI feedback:", error);
      res.status(500).json({ message: "Failed to create feedback" });
    }
  });

  app.get("/api/ai-feedback/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getAiFeedbackStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching AI feedback stats:", error);
      res.status(500).json({ message: "Failed to fetch feedback stats" });
    }
  });

  app.get("/api/ai-feedback/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const feedbackData = await storage.exportAiFeedbackData(userId);
      res.json(feedbackData);
    } catch (error) {
      console.error("Error exporting AI feedback data:", error);
      res.status(500).json({ message: "Failed to export feedback data" });
    }
  });

  app.get(
    "/api/documents/:id/feedback",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const documentId = parseInt(req.params.id);
        const feedbackData = await storage.getDocumentFeedback(
          documentId,
          userId,
        );
        res.json(feedbackData);
      } catch (error) {
        console.error("Error fetching document feedback:", error);
        res.status(500).json({ message: "Failed to fetch document feedback" });
      }
    },
  );

  // AI Response Analysis routes
  app.get(
    "/api/ai-response-analysis",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
        const offset = req.query.offset
          ? parseInt(req.query.offset)
          : undefined;
        const analysisResult = req.query.analysisResult;

        const analysis = await storage.getAiResponseAnalysis(userId, {
          limit,
          offset,
          analysisResult,
        });
        res.json(analysis);
      } catch (error) {
        console.error("Error fetching AI response analysis:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch AI response analysis" });
      }
    },
  );

  app.get(
    "/api/ai-response-analysis/stats",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const stats = await storage.getAiResponseAnalysisStats(userId);
        res.json(stats);
      } catch (error) {
        console.error("Error fetching AI response analysis stats:", error);
        res.status(500).json({ message: "Failed to fetch analysis stats" });
      }
    },
  );

  // Omnichannel Analytics endpoint
  app.get(
    "/api/analytics/omnichannel",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const dateRange = req.query.dateRange || '7d';

        // Get user's social integrations
        const integrations = await storage.getSocialIntegrations(userId);

        // Build analytics data
        const analytics = {
          dateRange,
          platforms: integrations.map((integration: any) => ({
            platform: integration.type,
            name: integration.name,
            isActive: integration.isActive,
            agentId: integration.agentId,
            agentName: integration.agentName
          })),
          lastUpdated: new Date().toISOString()
        };

        res.json(analytics);
      } catch (error) {
        console.error("Error fetching omnichannel analytics:", error);
        res.status(500).json({ message: "Failed to fetch omnichannel analytics" });
      }
    },
  );

  app.post(
    "/api/ai-response-analysis/analyze",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const {
          userQuery,
          assistantResponse,
          documentContext,
          responseTime,
          chatMessageId,
        } = req.body;

        // Call OpenAI to analyze the response
        const analysisPrompt = `
Analyze this AI assistant response to determine if it's a "positive" (helpful, informative response) or "fallback" (unable to answer, generic response).

User Query: "${userQuery}"
Assistant Response: "${assistantResponse}"

Please classify this response as either:
- "positive": The assistant provided a helpful, specific, informative answer
- "fallback": The assistant gave a generic response, said they don't know, or couldn't provide specific information

Respond with JSON: {"result": "positive" or "fallback", "confidence": 0.0-1.0, "reason": "explanation"}
`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [{ role: "user", content: analysisPrompt }],
          response_format: { type: "json_object" },
        });

        const analysisResult = JSON.parse(
          response.choices[0].message.content || "{}",
        );

        // Store the analysis result
        const analysis = await storage.createAiResponseAnalysis({
          chatMessageId,
          userId,
          userQuery,
          assistantResponse,
          analysisResult: analysisResult.result,
          analysisConfidence: analysisResult.confidence,
          analysisReason: analysisResult.reason,
          documentContext,
          responseTime,
        });

        res.json(analysis);
      } catch (error) {
        console.error("Error analyzing AI response:", error);
        res.status(500).json({ message: "Failed to analyze response" });
      }
    },
  );