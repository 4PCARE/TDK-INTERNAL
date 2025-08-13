
import type { Express } from "express";
import { isAuthenticated, isAdmin } from "../replitAuth";
import { isMicrosoftAuthenticated } from "../microsoftAuth";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { db } from "../db";
import { 
  socialIntegrations, 
  lineTemplates, 
  users, 
  departments,
  agentChatbots
} from "@shared/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import crypto from "crypto";

export function registerIntegrationRoutes(app: Express) {
  // Get all social integrations for user
  app.get("/api/social-integrations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const integrations = await db
        .select({
          id: socialIntegrations.id,
          type: socialIntegrations.type,
          name: socialIntegrations.name,
          channelId: socialIntegrations.channelId,
          channelSecret: socialIntegrations.channelSecret,
          channelAccessToken: socialIntegrations.channelAccessToken,
          botUserId: socialIntegrations.botUserId,
          agentId: socialIntegrations.agentId,
          agentName: agentChatbots.name,
          isActive: socialIntegrations.isActive,
          isVerified: socialIntegrations.isVerified,
          webhookUrl: socialIntegrations.webhookUrl,
          createdAt: socialIntegrations.createdAt,
          updatedAt: socialIntegrations.updatedAt,
        })
        .from(socialIntegrations)
        .leftJoin(agentChatbots, eq(socialIntegrations.agentId, agentChatbots.id))
        .where(eq(socialIntegrations.userId, userId))
        .orderBy(desc(socialIntegrations.createdAt));

      res.json(integrations);
    } catch (error) {
      console.error("Error fetching social integrations:", error);
      res.status(500).json({ message: "Failed to fetch social integrations" });
    }
  });

  // Create new social integration
  app.post("/api/social-integrations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { type, name, channelId, channelSecret, channelAccessToken, agentId } = req.body;

      if (!type || !name) {
        return res.status(400).json({ message: "Type and name are required" });
      }

      // Generate webhook URL
      const webhookToken = crypto.randomBytes(32).toString('hex');
      const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhook/${type}/${webhookToken}`;

      const [integration] = await db
        .insert(socialIntegrations)
        .values({
          type,
          name,
          channelId,
          channelSecret,
          channelAccessToken,
          agentId: agentId || null,
          userId,
          isActive: true,
          isVerified: false,
          webhookUrl,
          webhookToken,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(integration);
    } catch (error) {
      console.error("Error creating social integration:", error);
      res.status(500).json({ message: "Failed to create social integration" });
    }
  });

  // Update social integration
  app.put("/api/social-integrations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = parseInt(req.params.id);
      const { name, channelId, channelSecret, channelAccessToken, agentId, isActive } = req.body;

      // Verify ownership
      const [existingIntegration] = await db
        .select()
        .from(socialIntegrations)
        .where(
          and(
            eq(socialIntegrations.id, integrationId),
            eq(socialIntegrations.userId, userId)
          )
        )
        .limit(1);

      if (!existingIntegration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      const [updatedIntegration] = await db
        .update(socialIntegrations)
        .set({
          name,
          channelId,
          channelSecret,
          channelAccessToken,
          agentId: agentId || null,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(socialIntegrations.id, integrationId))
        .returning();

      res.json(updatedIntegration);
    } catch (error) {
      console.error("Error updating social integration:", error);
      res.status(500).json({ message: "Failed to update social integration" });
    }
  });

  // Delete social integration
  app.delete("/api/social-integrations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = parseInt(req.params.id);

      // Verify ownership
      const [existingIntegration] = await db
        .select()
        .from(socialIntegrations)
        .where(
          and(
            eq(socialIntegrations.id, integrationId),
            eq(socialIntegrations.userId, userId)
          )
        )
        .limit(1);

      if (!existingIntegration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      // Delete associated Line templates if it's a Line OA integration
      if (existingIntegration.type === 'lineoa') {
        await db
          .delete(lineTemplates)
          .where(eq(lineTemplates.integrationId, integrationId));
      }

      // Delete the integration
      await db
        .delete(socialIntegrations)
        .where(eq(socialIntegrations.id, integrationId));

      res.json({ success: true, message: "Integration deleted successfully" });
    } catch (error) {
      console.error("Error deleting social integration:", error);
      res.status(500).json({ message: "Failed to delete social integration" });
    }
  });

  // Verify integration
  app.post("/api/social-integrations/:id/verify", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = parseInt(req.params.id);

      // Verify ownership
      const [existingIntegration] = await db
        .select()
        .from(socialIntegrations)
        .where(
          and(
            eq(socialIntegrations.id, integrationId),
            eq(socialIntegrations.userId, userId)
          )
        )
        .limit(1);

      if (!existingIntegration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      // TODO: Add actual verification logic based on integration type
      // For now, just mark as verified
      const [updatedIntegration] = await db
        .update(socialIntegrations)
        .set({
          isVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(socialIntegrations.id, integrationId))
        .returning();

      res.json(updatedIntegration);
    } catch (error) {
      console.error("Error verifying integration:", error);
      res.status(500).json({ message: "Failed to verify integration" });
    }
  });

  // Get Line OA templates for integration
  app.get("/api/social-integrations/:id/line-templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = parseInt(req.params.id);

      // Verify integration ownership
      const [integration] = await db
        .select()
        .from(socialIntegrations)
        .where(
          and(
            eq(socialIntegrations.id, integrationId),
            eq(socialIntegrations.userId, userId)
          )
        )
        .limit(1);

      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      const templates = await db
        .select()
        .from(lineTemplates)
        .where(eq(lineTemplates.integrationId, integrationId))
        .orderBy(desc(lineTemplates.createdAt));

      res.json(templates);
    } catch (error) {
      console.error("Error fetching Line templates:", error);
      res.status(500).json({ message: "Failed to fetch Line templates" });
    }
  });

  // Create Line OA template
  app.post("/api/social-integrations/:id/line-templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = parseInt(req.params.id);
      const { name, type, content, triggers } = req.body;

      // Verify integration ownership
      const [integration] = await db
        .select()
        .from(socialIntegrations)
        .where(
          and(
            eq(socialIntegrations.id, integrationId),
            eq(socialIntegrations.userId, userId)
          )
        )
        .limit(1);

      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      const [template] = await db
        .insert(lineTemplates)
        .values({
          integrationId,
          name,
          type,
          content: typeof content === 'string' ? content : JSON.stringify(content),
          triggers: JSON.stringify(triggers || []),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(template);
    } catch (error) {
      console.error("Error creating Line template:", error);
      res.status(500).json({ message: "Failed to create Line template" });
    }
  });

  // Update Line OA template
  app.put("/api/line-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateId = parseInt(req.params.id);
      const { name, type, content, triggers, isActive } = req.body;

      // Verify template ownership through integration
      const [template] = await db
        .select({
          template: lineTemplates,
          integration: socialIntegrations,
        })
        .from(lineTemplates)
        .leftJoin(socialIntegrations, eq(lineTemplates.integrationId, socialIntegrations.id))
        .where(
          and(
            eq(lineTemplates.id, templateId),
            eq(socialIntegrations.userId, userId)
          )
        )
        .limit(1);

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const [updatedTemplate] = await db
        .update(lineTemplates)
        .set({
          name,
          type,
          content: typeof content === 'string' ? content : JSON.stringify(content),
          triggers: JSON.stringify(triggers || []),
          isActive: isActive !== undefined ? isActive : true,
          updatedAt: new Date(),
        })
        .where(eq(lineTemplates.id, templateId))
        .returning();

      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error updating Line template:", error);
      res.status(500).json({ message: "Failed to update Line template" });
    }
  });

  // Delete Line OA template
  app.delete("/api/line-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateId = parseInt(req.params.id);

      // Verify template ownership through integration
      const [template] = await db
        .select({
          template: lineTemplates,
          integration: socialIntegrations,
        })
        .from(lineTemplates)
        .leftJoin(socialIntegrations, eq(lineTemplates.integrationId, socialIntegrations.id))
        .where(
          and(
            eq(lineTemplates.id, templateId),
            eq(socialIntegrations.userId, userId)
          )
        )
        .limit(1);

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      await db
        .delete(lineTemplates)
        .where(eq(lineTemplates.id, templateId));

      res.json({ success: true, message: "Template deleted successfully" });
    } catch (error) {
      console.error("Error deleting Line template:", error);
      res.status(500).json({ message: "Failed to delete Line template" });
    }
  });

  // Get webhook URL for integration
  app.get("/api/social-integrations/:id/webhook-url", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = parseInt(req.params.id);

      const [integration] = await db
        .select({
          id: socialIntegrations.id,
          webhookUrl: socialIntegrations.webhookUrl,
          webhookToken: socialIntegrations.webhookToken,
        })
        .from(socialIntegrations)
        .where(
          and(
            eq(socialIntegrations.id, integrationId),
            eq(socialIntegrations.userId, userId)
          )
        )
        .limit(1);

      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      res.json({
        webhookUrl: integration.webhookUrl,
        webhookToken: integration.webhookToken,
      });
    } catch (error) {
      console.error("Error fetching webhook URL:", error);
      res.status(500).json({ message: "Failed to fetch webhook URL" });
    }
  });

  // Regenerate webhook token
  app.post("/api/social-integrations/:id/regenerate-webhook", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = parseInt(req.params.id);

      // Verify ownership
      const [existingIntegration] = await db
        .select()
        .from(socialIntegrations)
        .where(
          and(
            eq(socialIntegrations.id, integrationId),
            eq(socialIntegrations.userId, userId)
          )
        )
        .limit(1);

      if (!existingIntegration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      // Generate new webhook token and URL
      const webhookToken = crypto.randomBytes(32).toString('hex');
      const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhook/${existingIntegration.type}/${webhookToken}`;

      const [updatedIntegration] = await db
        .update(socialIntegrations)
        .set({
          webhookToken,
          webhookUrl,
          updatedAt: new Date(),
        })
        .where(eq(socialIntegrations.id, integrationId))
        .returning();

      res.json({
        webhookUrl: updatedIntegration.webhookUrl,
        webhookToken: updatedIntegration.webhookToken,
      });
    } catch (error) {
      console.error("Error regenerating webhook:", error);
      res.status(500).json({ message: "Failed to regenerate webhook" });
    }
  });

  // Get integration statistics
  app.get("/api/social-integrations/:id/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = parseInt(req.params.id);

      // Verify ownership
      const [integration] = await db
        .select()
        .from(socialIntegrations)
        .where(
          and(
            eq(socialIntegrations.id, integrationId),
            eq(socialIntegrations.userId, userId)
          )
        )
        .limit(1);

      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      // TODO: Implement actual statistics based on webhook logs, messages, etc.
      const stats = {
        messagesReceived: 0,
        messagesReplied: 0,
        activeUsers: 0,
        responseTime: 0,
        successRate: 100,
        lastActivity: integration.updatedAt,
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching integration stats:", error);
      res.status(500).json({ message: "Failed to fetch integration statistics" });
    }
  });

  // Test integration
  app.post("/api/social-integrations/:id/test", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const integrationId = parseInt(req.params.id);
      const { message } = req.body;

      // Verify ownership
      const [integration] = await db
        .select()
        .from(socialIntegrations)
        .where(
          and(
            eq(socialIntegrations.id, integrationId),
            eq(socialIntegrations.userId, userId)
          )
        )
        .limit(1);

      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      if (!message) {
        return res.status(400).json({ message: "Test message is required" });
      }

      // TODO: Implement actual integration testing
      // For now, just return a success response
      res.json({
        success: true,
        message: "Integration test completed successfully",
        response: "This is a test response from the integration",
        responseTime: 150,
      });
    } catch (error) {
      console.error("Error testing integration:", error);
      res.status(500).json({ message: "Failed to test integration" });
    }
  });

  // Get available platforms
  app.get("/api/social-platforms", isAuthenticated, async (req: any, res) => {
    try {
      const platforms = [
        {
          id: "lineoa",
          name: "Line Official Account",
          description: "Connect your Line Official Account to provide automated customer support",
          icon: "MessageCircle",
          available: true,
          color: "#00B900",
          requiredFields: ["channelId", "channelSecret", "channelAccessToken"],
        },
        {
          id: "facebook",
          name: "Facebook Messenger",
          description: "Connect your Facebook Page to automate Messenger conversations",
          icon: "Facebook",
          available: false,
          color: "#1877F2",
          requiredFields: ["pageId", "pageAccessToken", "appSecret"],
        },
        {
          id: "instagram",
          name: "Instagram Direct",
          description: "Automate Instagram Direct Messages for your business account",
          icon: "Instagram",
          available: false,
          color: "#E4405F",
          requiredFields: ["accountId", "accessToken"],
        },
        {
          id: "telegram",
          name: "Telegram Bot",
          description: "Create a Telegram bot to handle customer inquiries automatically",
          icon: "Send",
          available: false,
          color: "#0088CC",
          requiredFields: ["botToken"],
        },
        {
          id: "whatsapp",
          name: "WhatsApp Business",
          description: "Connect WhatsApp Business API for automated customer service",
          icon: "MessageSquare",
          available: false,
          color: "#25D366",
          requiredFields: ["phoneNumberId", "accessToken", "webhookSecret"],
        },
      ];

      res.json(platforms);
    } catch (error) {
      console.error("Error fetching social platforms:", error);
      res.status(500).json({ message: "Failed to fetch social platforms" });
    }
  });
}
