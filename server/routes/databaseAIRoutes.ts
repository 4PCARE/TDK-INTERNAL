
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { aiDatabaseAgent } from "../services/aiDatabaseAgent";
import { storage } from "../storage";

export function registerDatabaseAIRoutes(app: Express) {
  // Generate and execute AI SQL query
  app.post("/api/database/ai-query", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { userQuery, connectionId, maxRows = 50 } = req.body;

      if (!userQuery || !connectionId) {
        return res.status(400).json({ 
          message: "User query and connection ID are required" 
        });
      }

      // Generate and execute SQL
      const result = await aiDatabaseAgent.generateSQL(
        userQuery,
        connectionId,
        userId,
        maxRows
      );

      // Save query history
      await storage.saveAIDatabaseQuery({
        userId,
        connectionId,
        userQuery,
        generatedSql: result.sql,
        executionResult: {
          data: result.data,
          columns: result.columns,
          rowCount: result.data?.length || 0,
        },
        success: result.success,
        executionTime: result.executionTime,
      });

      res.json(result);
    } catch (error) {
      console.error("Error in AI database query:", error);
      res.status(500).json({ 
        message: "Failed to process AI database query",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get AI query history
  app.get("/api/database/:connectionId/ai-history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connectionId = parseInt(req.params.connectionId);
      const limit = parseInt(req.query.limit as string) || 50;

      const history = await storage.getAIDatabaseQueryHistory(connectionId, userId, limit);
      res.json(history);
    } catch (error) {
      console.error("Error fetching AI query history:", error);
      res.status(500).json({ message: "Failed to fetch query history" });
    }
  });

  // SQL Snippets CRUD operations
  app.get("/api/database/:connectionId/snippets", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connectionId = parseInt(req.params.connectionId);

      const snippets = await aiDatabaseAgent.getSQLSnippets(connectionId, userId);
      res.json(snippets);
    } catch (error) {
      console.error("Error fetching SQL snippets:", error);
      res.status(500).json({ message: "Failed to fetch SQL snippets" });
    }
  });

  app.post("/api/database/:connectionId/snippets", isAuthenticated, async (req: any, res) => {
    try {
      // Set content type to ensure JSON response
      res.setHeader('Content-Type', 'application/json');
      
      const userId = req.user.claims.sub;
      const connectionId = parseInt(req.params.connectionId);
      const { name, sql, description } = req.body;

      console.log('📝 Creating SQL snippet:', { name, sql, description, connectionId, userId });
      console.log('📝 Request body:', req.body);
      console.log('📝 Connection ID parsed:', connectionId);

      if (!name || !sql) {
        return res.status(400).json({ message: "Name and SQL are required" });
      }

      if (isNaN(connectionId)) {
        return res.status(400).json({ message: "Invalid connection ID" });
      }

      // Ensure description is always a string (never null/undefined)
      const cleanDescription = typeof description === 'string' ? description : '';

      const snippet = await aiDatabaseAgent.createSQLSnippet({
        name: String(name),
        sql: String(sql),
        description: cleanDescription,
        connectionId,
        userId,
      });

      console.log('✅ SQL snippet created successfully:', snippet);
      return res.status(201).json(snippet);
    } catch (error) {
      console.error("💥 Error creating SQL snippet:", error);
      
      // Ensure JSON error response
      res.setHeader('Content-Type', 'application/json');
      
      // Return JSON error response, not HTML
      if (error.message?.includes('sql_snippets') && error.message?.includes('does not exist')) {
        return res.status(500).json({ 
          message: "SQL snippets table not found. Database migration required.",
          error: "MISSING_TABLE"
        });
      }
      
      return res.status(500).json({ 
        message: "Failed to create SQL snippet",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.put("/api/database/snippets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const snippetId = parseInt(req.params.id);
      const { name, sql, description } = req.body;

      const snippet = await aiDatabaseAgent.updateSQLSnippet(
        snippetId,
        { name, sql, description },
        userId
      );

      res.json(snippet);
    } catch (error) {
      console.error("Error updating SQL snippet:", error);
      res.status(500).json({ message: "Failed to update SQL snippet" });
    }
  });

  app.delete("/api/database/snippets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const snippetId = parseInt(req.params.id);

      await aiDatabaseAgent.deleteSQLSnippet(snippetId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting SQL snippet:", error);
      res.status(500).json({ message: "Failed to delete SQL snippet" });
    }
  });
}
