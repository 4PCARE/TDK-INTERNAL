
import type { Express } from "express";
import { isAuthenticated, isAdmin } from "../replitAuth";
import { isMicrosoftAuthenticated } from "../microsoftAuth";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { db } from "../db";
import { 
  aiResponseAnalysis,
  auditLogs,
  documentAccess,
  documents,
  users,
  aiAssistantFeedback,
  chatMessages,
  chatConversations,
  socialIntegrations,
  agentChatbots
} from "@shared/schema";
import { eq, sql, and, desc, gte, lte, count, avg, sum } from "drizzle-orm";

export function registerAnalyticsRoutes(app: Express) {
  // AI Response Analysis routes
  app.get("/api/ai-response-analysis", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset) : undefined;
      const analysisResult = req.query.analysisResult;

      const analysis = await storage.getAiResponseAnalysis(userId, {
        limit,
        offset,
        analysisResult,
      });
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching AI response analysis:", error);
      res.status(500).json({ message: "Failed to fetch AI response analysis" });
    }
  });

  app.get("/api/ai-response-analysis/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dateRange = req.query.dateRange || '7d';
      
      let startDate = new Date();
      switch (dateRange) {
        case '1d':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      const stats = await db
        .select({
          totalResponses: count(),
          positiveResponses: sum(sql`CASE WHEN ${aiResponseAnalysis.analysisResult} = 'positive' THEN 1 ELSE 0 END`),
          fallbackResponses: sum(sql`CASE WHEN ${aiResponseAnalysis.analysisResult} = 'fallback' THEN 1 ELSE 0 END`),
          avgResponseTime: avg(aiResponseAnalysis.responseTime),
          avgConfidence: avg(aiResponseAnalysis.analysisConfidence),
        })
        .from(aiResponseAnalysis)
        .where(
          and(
            eq(aiResponseAnalysis.userId, userId),
            gte(aiResponseAnalysis.createdAt, startDate)
          )
        );

      const dailyStats = await db
        .select({
          date: sql`DATE(${aiResponseAnalysis.createdAt}) as date`,
          total: count(),
          positive: sum(sql`CASE WHEN ${aiResponseAnalysis.analysisResult} = 'positive' THEN 1 ELSE 0 END`),
          fallback: sum(sql`CASE WHEN ${aiResponseAnalysis.analysisResult} = 'fallback' THEN 1 ELSE 0 END`),
        })
        .from(aiResponseAnalysis)
        .where(
          and(
            eq(aiResponseAnalysis.userId, userId),
            gte(aiResponseAnalysis.createdAt, startDate)
          )
        )
        .groupBy(sql`DATE(${aiResponseAnalysis.createdAt})`)
        .orderBy(sql`DATE(${aiResponseAnalysis.createdAt})`);

      res.json({
        summary: stats[0] || {
          totalResponses: 0,
          positiveResponses: 0,
          fallbackResponses: 0,
          avgResponseTime: 0,
          avgConfidence: 0,
        },
        daily: dailyStats,
      });
    } catch (error) {
      console.error("Error fetching AI response analysis stats:", error);
      res.status(500).json({ message: "Failed to fetch AI response analysis stats" });
    }
  });

  // Omnichannel Analytics
  app.get("/api/analytics/omnichannel", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dateRange = req.query.dateRange || '7d';
      
      let startDate = new Date();
      switch (dateRange) {
        case '1d':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Get social integrations
      const integrations = await db
        .select({
          id: socialIntegrations.id,
          type: socialIntegrations.type,
          name: socialIntegrations.name,
          isActive: socialIntegrations.isActive,
          isVerified: socialIntegrations.isVerified,
          agentId: socialIntegrations.agentId,
          agentName: agentChatbots.name,
          createdAt: socialIntegrations.createdAt,
        })
        .from(socialIntegrations)
        .leftJoin(agentChatbots, eq(socialIntegrations.agentId, agentChatbots.id))
        .where(eq(socialIntegrations.userId, userId))
        .orderBy(desc(socialIntegrations.createdAt));

      // Mock analytics data for demonstration
      const analyticsData = {
        totalMessages: Math.floor(Math.random() * 1000) + 500,
        totalUsers: Math.floor(Math.random() * 200) + 100,
        avgResponseTime: Math.random() * 2 + 0.5,
        successRate: Math.floor(Math.random() * 20) + 80,
        platforms: integrations.map(integration => ({
          platform: integration.type,
          name: integration.name,
          messages: integration.isActive ? Math.floor(Math.random() * 200) + 50 : 0,
          users: integration.isActive ? Math.floor(Math.random() * 50) + 20 : 0,
          responseTime: integration.isActive ? Math.random() * 2 + 0.5 : 0,
          successRate: integration.isActive ? Math.floor(Math.random() * 20) + 80 : 0,
          isActive: integration.isActive,
        })),
        topTopics: [
          { topic: 'Product Info', count: Math.floor(Math.random() * 100) + 50 },
          { topic: 'Support', count: Math.floor(Math.random() * 80) + 40 },
          { topic: 'Pricing', count: Math.floor(Math.random() * 60) + 30 },
          { topic: 'FAQ', count: Math.floor(Math.random() * 40) + 20 },
          { topic: 'Technical', count: Math.floor(Math.random() * 30) + 15 },
        ],
      };

      res.json(analyticsData);
    } catch (error) {
      console.error("Error fetching omnichannel analytics:", error);
      res.status(500).json({ message: "Failed to fetch omnichannel analytics" });
    }
  });

  // Document Analytics
  app.get("/api/analytics/documents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dateRange = req.query.dateRange || '7d';
      
      let startDate = new Date();
      switch (dateRange) {
        case '1d':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Get document access analytics
      const accessStats = await db
        .select({
          totalAccess: count(),
          uniqueDocuments: count(sql`DISTINCT ${documentAccess.documentId}`),
          viewCount: sum(sql`CASE WHEN ${documentAccess.accessType} = 'view' THEN 1 ELSE 0 END`),
          downloadCount: sum(sql`CASE WHEN ${documentAccess.accessType} = 'download' THEN 1 ELSE 0 END`),
        })
        .from(documentAccess)
        .innerJoin(documents, eq(documentAccess.documentId, documents.id))
        .where(
          and(
            eq(documents.userId, userId),
            gte(documentAccess.createdAt, startDate)
          )
        );

      // Get top accessed documents
      const topDocuments = await db
        .select({
          documentId: documentAccess.documentId,
          documentName: documents.name,
          accessCount: count(),
          lastAccessed: sql`MAX(${documentAccess.createdAt})`,
        })
        .from(documentAccess)
        .innerJoin(documents, eq(documentAccess.documentId, documents.id))
        .where(
          and(
            eq(documents.userId, userId),
            gte(documentAccess.createdAt, startDate)
          )
        )
        .groupBy(documentAccess.documentId, documents.name)
        .orderBy(desc(count()))
        .limit(10);

      // Get daily access trends
      const dailyAccess = await db
        .select({
          date: sql`DATE(${documentAccess.createdAt}) as date`,
          views: sum(sql`CASE WHEN ${documentAccess.accessType} = 'view' THEN 1 ELSE 0 END`),
          downloads: sum(sql`CASE WHEN ${documentAccess.accessType} = 'download' THEN 1 ELSE 0 END`),
        })
        .from(documentAccess)
        .innerJoin(documents, eq(documentAccess.documentId, documents.id))
        .where(
          and(
            eq(documents.userId, userId),
            gte(documentAccess.createdAt, startDate)
          )
        )
        .groupBy(sql`DATE(${documentAccess.createdAt})`)
        .orderBy(sql`DATE(${documentAccess.createdAt})`);

      res.json({
        summary: accessStats[0] || {
          totalAccess: 0,
          uniqueDocuments: 0,
          viewCount: 0,
          downloadCount: 0,
        },
        topDocuments,
        dailyTrends: dailyAccess,
      });
    } catch (error) {
      console.error("Error fetching document analytics:", error);
      res.status(500).json({ message: "Failed to fetch document analytics" });
    }
  });

  // User Activity Analytics
  app.get("/api/analytics/user-activity", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dateRange = req.query.dateRange || '7d';
      
      let startDate = new Date();
      switch (dateRange) {
        case '1d':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Get audit log statistics
      const activityStats = await db
        .select({
          totalActions: count(),
          logins: sum(sql`CASE WHEN ${auditLogs.action} = 'login' THEN 1 ELSE 0 END`),
          uploads: sum(sql`CASE WHEN ${auditLogs.action} = 'upload' THEN 1 ELSE 0 END`),
          downloads: sum(sql`CASE WHEN ${auditLogs.action} = 'download' THEN 1 ELSE 0 END`),
          searches: sum(sql`CASE WHEN ${auditLogs.action} = 'search' THEN 1 ELSE 0 END`),
          apiCalls: sum(sql`CASE WHEN ${auditLogs.action} = 'api_call' THEN 1 ELSE 0 END`),
        })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, userId),
            gte(auditLogs.createdAt, startDate)
          )
        );

      // Get daily activity trends
      const dailyActivity = await db
        .select({
          date: sql`DATE(${auditLogs.createdAt}) as date`,
          logins: sum(sql`CASE WHEN ${auditLogs.action} = 'login' THEN 1 ELSE 0 END`),
          uploads: sum(sql`CASE WHEN ${auditLogs.action} = 'upload' THEN 1 ELSE 0 END`),
          downloads: sum(sql`CASE WHEN ${auditLogs.action} = 'download' THEN 1 ELSE 0 END`),
          searches: sum(sql`CASE WHEN ${auditLogs.action} = 'search' THEN 1 ELSE 0 END`),
          totalActions: count(),
        })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, userId),
            gte(auditLogs.createdAt, startDate)
          )
        )
        .groupBy(sql`DATE(${auditLogs.createdAt})`)
        .orderBy(sql`DATE(${auditLogs.createdAt})`);

      // Get action breakdown
      const actionBreakdown = await db
        .select({
          action: auditLogs.action,
          count: count(),
        })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, userId),
            gte(auditLogs.createdAt, startDate)
          )
        )
        .groupBy(auditLogs.action)
        .orderBy(desc(count()));

      res.json({
        summary: activityStats[0] || {
          totalActions: 0,
          logins: 0,
          uploads: 0,
          downloads: 0,
          searches: 0,
          apiCalls: 0,
        },
        dailyTrends: dailyActivity,
        actionBreakdown,
      });
    } catch (error) {
      console.error("Error fetching user activity analytics:", error);
      res.status(500).json({ message: "Failed to fetch user activity analytics" });
    }
  });

  // AI Interaction Analytics
  app.get("/api/analytics/ai-interactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dateRange = req.query.dateRange || '7d';
      
      let startDate = new Date();
      switch (dateRange) {
        case '1d':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Get chat conversation statistics
      const conversationStats = await db
        .select({
          totalConversations: count(sql`DISTINCT ${chatConversations.id}`),
          totalMessages: count(chatMessages.id),
          userMessages: sum(sql`CASE WHEN ${chatMessages.role} = 'user' THEN 1 ELSE 0 END`),
          assistantMessages: sum(sql`CASE WHEN ${chatMessages.role} = 'assistant' THEN 1 ELSE 0 END`),
        })
        .from(chatConversations)
        .leftJoin(chatMessages, eq(chatConversations.id, chatMessages.conversationId))
        .where(
          and(
            eq(chatConversations.userId, userId),
            gte(chatConversations.createdAt, startDate)
          )
        );

      // Get daily conversation trends
      const dailyConversations = await db
        .select({
          date: sql`DATE(${chatConversations.createdAt}) as date`,
          conversations: count(sql`DISTINCT ${chatConversations.id}`),
          messages: count(chatMessages.id),
        })
        .from(chatConversations)
        .leftJoin(chatMessages, eq(chatConversations.id, chatMessages.conversationId))
        .where(
          and(
            eq(chatConversations.userId, userId),
            gte(chatConversations.createdAt, startDate)
          )
        )
        .groupBy(sql`DATE(${chatConversations.createdAt})`)
        .orderBy(sql`DATE(${chatConversations.createdAt})`);

      // Get feedback statistics
      const feedbackStats = await db
        .select({
          totalFeedback: count(),
          helpfulFeedback: sum(sql`CASE WHEN ${aiAssistantFeedback.feedbackType} = 'helpful' THEN 1 ELSE 0 END`),
          notHelpfulFeedback: sum(sql`CASE WHEN ${aiAssistantFeedback.feedbackType} = 'not_helpful' THEN 1 ELSE 0 END`),
        })
        .from(aiAssistantFeedback)
        .where(
          and(
            eq(aiAssistantFeedback.userId, userId),
            gte(aiAssistantFeedback.createdAt, startDate)
          )
        );

      res.json({
        conversations: conversationStats[0] || {
          totalConversations: 0,
          totalMessages: 0,
          userMessages: 0,
          assistantMessages: 0,
        },
        feedback: feedbackStats[0] || {
          totalFeedback: 0,
          helpfulFeedback: 0,
          notHelpfulFeedback: 0,
        },
        dailyTrends: dailyConversations,
      });
    } catch (error) {
      console.error("Error fetching AI interaction analytics:", error);
      res.status(500).json({ message: "Failed to fetch AI interaction analytics" });
    }
  });

  // System Health Analytics
  app.get("/api/analytics/system-health", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dateRange = req.query.dateRange || '7d';
      
      let startDate = new Date();
      switch (dateRange) {
        case '1d':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Get error statistics from audit logs
      const errorStats = await db
        .select({
          totalErrors: sum(sql`CASE WHEN ${auditLogs.success} = false THEN 1 ELSE 0 END`),
          totalRequests: count(),
          successRate: sql`ROUND((SUM(CASE WHEN ${auditLogs.success} = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate`,
          avgDuration: avg(auditLogs.duration),
        })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, userId),
            gte(auditLogs.createdAt, startDate)
          )
        );

      // Get error breakdown by action type
      const errorBreakdown = await db
        .select({
          action: auditLogs.action,
          errors: sum(sql`CASE WHEN ${auditLogs.success} = false THEN 1 ELSE 0 END`),
          total: count(),
          errorRate: sql`ROUND((SUM(CASE WHEN ${auditLogs.success} = false THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as error_rate`,
        })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, userId),
            gte(auditLogs.createdAt, startDate)
          )
        )
        .groupBy(auditLogs.action)
        .orderBy(desc(sql`SUM(CASE WHEN ${auditLogs.success} = false THEN 1 ELSE 0 END)`));

      // Get daily error trends
      const dailyErrors = await db
        .select({
          date: sql`DATE(${auditLogs.createdAt}) as date`,
          errors: sum(sql`CASE WHEN ${auditLogs.success} = false THEN 1 ELSE 0 END`),
          total: count(),
          successRate: sql`ROUND((SUM(CASE WHEN ${auditLogs.success} = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate`,
        })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, userId),
            gte(auditLogs.createdAt, startDate)
          )
        )
        .groupBy(sql`DATE(${auditLogs.createdAt})`)
        .orderBy(sql`DATE(${auditLogs.createdAt})`);

      res.json({
        summary: errorStats[0] || {
          totalErrors: 0,
          totalRequests: 0,
          successRate: 100,
          avgDuration: 0,
        },
        errorBreakdown,
        dailyTrends: dailyErrors,
      });
    } catch (error) {
      console.error("Error fetching system health analytics:", error);
      res.status(500).json({ message: "Failed to fetch system health analytics" });
    }
  });

  // Export analytics data
  app.get("/api/analytics/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const type = req.query.type || 'all';
      const format = req.query.format || 'json';
      const dateRange = req.query.dateRange || '7d';

      let startDate = new Date();
      switch (dateRange) {
        case '1d':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      let exportData: any = {};

      if (type === 'all' || type === 'ai-responses') {
        const aiResponses = await db
          .select()
          .from(aiResponseAnalysis)
          .where(
            and(
              eq(aiResponseAnalysis.userId, userId),
              gte(aiResponseAnalysis.createdAt, startDate)
            )
          )
          .orderBy(desc(aiResponseAnalysis.createdAt));
        
        exportData.aiResponses = aiResponses;
      }

      if (type === 'all' || type === 'user-activity') {
        const userActivity = await db
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.userId, userId),
              gte(auditLogs.createdAt, startDate)
            )
          )
          .orderBy(desc(auditLogs.createdAt));
        
        exportData.userActivity = userActivity;
      }

      if (type === 'all' || type === 'document-access') {
        const documentAccess = await db
          .select({
            id: documentAccess.id,
            documentId: documentAccess.documentId,
            documentName: documents.name,
            accessType: documentAccess.accessType,
            createdAt: documentAccess.createdAt,
          })
          .from(documentAccess)
          .innerJoin(documents, eq(documentAccess.documentId, documents.id))
          .where(
            and(
              eq(documents.userId, userId),
              gte(documentAccess.createdAt, startDate)
            )
          )
          .orderBy(desc(documentAccess.createdAt));
        
        exportData.documentAccess = documentAccess;
      }

      if (format === 'csv') {
        // Convert to CSV format (simplified)
        let csvContent = '';
        Object.keys(exportData).forEach(key => {
          csvContent += `\n\n${key.toUpperCase()}\n`;
          const data = exportData[key];
          if (data.length > 0) {
            const headers = Object.keys(data[0]).join(',');
            csvContent += headers + '\n';
            data.forEach((row: any) => {
              const values = Object.values(row).map(v => 
                typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v
              ).join(',');
              csvContent += values + '\n';
            });
          }
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=analytics-${type}-${dateRange}.csv`);
        res.send(csvContent);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=analytics-${type}-${dateRange}.json`);
        res.json(exportData);
      }
    } catch (error) {
      console.error("Error exporting analytics data:", error);
      res.status(500).json({ message: "Failed to export analytics data" });
    }
  });
}
