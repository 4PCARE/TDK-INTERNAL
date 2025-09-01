
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { sqliteService } from "../services/sqliteService";
import multer from "multer";
import path from "path";

const upload = multer({ dest: 'uploads/sqlite-temp/' });

export function registerSQLiteRoutes(app: Express) {
  // Get existing Excel/CSV files
  app.get("/api/sqlite/existing-files", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const files = await sqliteService.getExistingExcelCsvFiles(userId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching existing files:", error);
      res.status(500).json({ message: "Failed to fetch existing files" });
    }
  });

  // Analyze file schema
  app.post("/api/sqlite/analyze-file", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({ message: "File path is required" });
      }

      const analysis = await sqliteService.analyzeFileSchema(filePath);
      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing file:", error);
      res.status(500).json({ 
        message: "Failed to analyze file",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Upload new file for database creation
  app.post("/api/sqlite/upload-file", isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const allowedExtensions = ['.csv', '.xlsx', '.xls'];
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      if (!allowedExtensions.includes(fileExtension)) {
        return res.status(400).json({ 
          message: "Invalid file type. Only CSV and Excel files are allowed." 
        });
      }

      const analysis = await sqliteService.analyzeFileSchema(file.path);
      
      res.json({
        ...analysis,
        filePath: file.path,
        originalName: file.originalname
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ 
        message: "Failed to upload and analyze file",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Create database from file
  app.post("/api/sqlite/create-database", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { 
        filePath, 
        dbName, 
        tableName, 
        description, 
        snippets = [] 
      } = req.body;

      if (!filePath || !dbName || !tableName) {
        return res.status(400).json({ 
          message: "File path, database name, and table name are required" 
        });
      }

      const dbInfo = await sqliteService.createDatabaseFromFile(
        filePath,
        dbName,
        tableName,
        description || '',
        userId,
        snippets
      );

      res.json({
        success: true,
        database: dbInfo,
        message: "Database created successfully"
      });
    } catch (error) {
      console.error("Error creating database:", error);
      res.status(500).json({ 
        message: "Failed to create database",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Test SQL query on database
  app.post("/api/sqlite/test-query", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { connectionId, sql } = req.body;

      if (!connectionId || !sql) {
        return res.status(400).json({ 
          message: "Connection ID and SQL query are required" 
        });
      }

      // Get connection details
      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection) {
        return res.status(404).json({ message: "Database connection not found" });
      }

      // Execute query
      const result = await sqliteService.executeQuery(connection.database!, sql);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ 
        message: "Failed to execute query",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
