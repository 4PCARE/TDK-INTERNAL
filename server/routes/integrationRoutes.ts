
import type { Express } from "express";
import { smartAuth } from "../smartAuth";

export function registerIntegrationRoutes(app: Express) {
  // Get available integrations
  app.get("/api/integrations", smartAuth, async (req: any, res) => {
    try {
      const integrations = [
        {
          id: "line",
          name: "LINE Official Account",
          description: "Connect your LINE OA to provide AI-powered responses",
          enabled: false,
          configurable: true,
        },
        {
          id: "slack",
          name: "Slack",
          description: "Integrate with Slack workspace",
          enabled: false,
          configurable: false,
        },
        {
          id: "teams",
          name: "Microsoft Teams",
          description: "Connect with Microsoft Teams",
          enabled: false,
          configurable: false,
        },
      ];

      res.json(integrations);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  // Configure integration
  app.post("/api/integrations/:id/configure", smartAuth, async (req: any, res) => {
    try {
      const integrationId = req.params.id;
      const config = req.body;

      // Handle different integration configurations
      switch (integrationId) {
        case "line":
          // LINE configuration would be handled here
          res.json({ success: true, message: "LINE integration configured" });
          break;
        default:
          res.status(400).json({ message: "Integration not supported" });
      }
    } catch (error) {
      console.error("Error configuring integration:", error);
      res.status(500).json({ message: "Failed to configure integration" });
    }
  });
}
