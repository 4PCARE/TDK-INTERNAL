
import type { Express } from "express";
import { smartAuth as isAuthenticated } from "../smartAuth";
import { storage } from "../storage";
import { databaseConnector } from "../services/databaseConnector";

export function registerDatabaseConnectionRoutes(app: Express) {
  // Get all database connections for user
  app.get("/api/database-connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connections = await storage.getUserDatabaseConnections(userId);
      res.json(connections);
    } catch (error) {
      console.error("Error fetching database connections:", error);
      res.status(500).json({ message: "Failed to fetch database connections" });
    }
  });

  // Test database connection
  app.post("/api/database-connections/:id/test", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connectionId = parseInt(req.params.id);
      
      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection) {
        return res.status(404).json({ message: "Database connection not found" });
      }

      const result = await databaseConnector.testConnection(connection);
      res.json(result);
    } catch (error) {
      console.error("Error testing database connection:", error);
      res.status(500).json({ message: "Failed to test database connection" });
    }
  });

  // Execute query on database connection
  app.post("/api/database-connections/:id/query", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connectionId = parseInt(req.params.id);
      const { sql, maxRows = 100 } = req.body;

      if (!sql || !sql.trim()) {
        return res.status(400).json({ message: "SQL query is required" });
      }

      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection) {
        return res.status(404).json({ message: "Database connection not found" });
      }

      const result = await databaseConnector.executeQuery(connectionId, sql.trim());
      
      // Limit rows if specified
      if (result.data && maxRows && result.data.length > maxRows) {
        result.data = result.data.slice(0, maxRows);
      }

      res.json(result);
    } catch (error) {
      console.error("Error executing database query:", error);
      res.status(500).json({ 
        message: "Failed to execute query",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get database connection details
  app.get("/api/database-connections/:id/details", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connectionId = parseInt(req.params.id);
      
      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection) {
        return res.status(404).json({ message: "Database connection not found" });
      }

      // Return safe connection details (no passwords)
      const safeConnection = {
        ...connection,
        password: undefined,
        connectionString: connection.connectionString || `${connection.type}://${connection.host}:${connection.port}/${connection.database}`
      };

      res.json(safeConnection);
    } catch (error) {
      console.error("Error fetching database connection details:", error);
      res.status(500).json({ message: "Failed to fetch connection details" });
    }
  });

  // Get database schema
  app.get("/api/database-connections/:id/schema", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connectionId = parseInt(req.params.id);
      
      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection) {
        return res.status(404).json({ message: "Database connection not found" });
      }

      // For now, use the existing schema discovery service
      const { schemaDiscovery } = await import("../services/schemaDiscovery");
      const schema = await schemaDiscovery.getConnectionSchema(connectionId, userId);
      
      res.json(schema);
    } catch (error) {
      console.error("Error fetching database schema:", error);
      res.status(500).json({ message: "Failed to fetch database schema" });
    }
  });

  // Create PostgreSQL connection
  app.post("/api/database-connections/postgresql", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, host, port, database, username, password, description } = req.body;

      const connection = await storage.createDatabaseConnection({
        userId,
        name,
        type: 'postgresql',
        host,
        port: parseInt(port) || 5432,
        database,
        username,
        password,
        description: description || null
      });

      res.status(201).json(connection);
    } catch (error) {
      console.error("Error creating PostgreSQL connection:", error);
      res.status(500).json({ message: "Failed to create PostgreSQL connection" });
    }
  });

  // Create MySQL connection
  app.post("/api/database-connections/mysql", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, host, port, database, username, password, description } = req.body;

      const connection = await storage.createDatabaseConnection({
        userId,
        name,
        type: 'mysql',
        host,
        port: parseInt(port) || 3306,
        database,
        username,
        password,
        description: description || null
      });

      res.status(201).json(connection);
    } catch (error) {
      console.error("Error creating MySQL connection:", error);
      res.status(500).json({ message: "Failed to create MySQL connection" });
    }
  });

  // Update database connection
  app.put("/api/database-connections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connectionId = parseInt(req.params.id);
      const updates = req.body;

      const connection = await storage.updateDatabaseConnection(connectionId, updates, userId);
      res.json(connection);
    } catch (error) {
      console.error("Error updating database connection:", error);
      res.status(500).json({ message: "Failed to update database connection" });
    }
  });

  // Delete database connection
  app.delete("/api/database-connections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connectionId = parseInt(req.params.id);

      await storage.deleteDatabaseConnection(connectionId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting database connection:", error);
      res.status(500).json({ message: "Failed to delete database connection" });
    }
  });
}
