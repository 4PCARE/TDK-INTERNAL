import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { sqliteService } from "../services/sqliteService";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "../storage"; // Use the correct storage import

const upload = multer({ dest: 'uploads/sqlite-temp/' });

export function registerSQLiteRoutes(app: Express) {
  // Get existing Excel/CSV files
  app.get("/api/sqlite/existing-files", isAuthenticated, async (req: any, res: any) => {
    console.log('🔍 SQLite existing-files endpoint hit');
    console.log('🔍 Request headers:', req.headers);
    try {
      const userId = req.user.claims.sub;
      console.log('🔍 User ID from claims:', userId);
      const allFiles = await sqliteService.getExistingExcelCsvFiles(userId);
      
      // Filter out files that don't exist on the filesystem
      const existingFiles = allFiles.filter(file => {
        const exists = fs.existsSync(file.filePath);
        if (!exists) {
          console.log(`🗑️ File no longer exists: ${file.fileName} at ${file.filePath}`);
        }
        return exists;
      });
      
      console.log(`🔍 Found ${allFiles.length} total files, ${existingFiles.length} actually exist`);
      res.json(existingFiles);
    } catch (error) {
      console.error("Error fetching existing files:", error);
      res.status(500).json({ message: "Failed to fetch existing files" });
    }
  });

  // Analyze file schema
  app.post("/api/sqlite/analyze-file", isAuthenticated, async (req: any, res: any) => {
    console.log('🔍 SQLite analyze-file endpoint hit');
    try {
      const userId = req.user.claims.sub;
      const { filePath } = req.body;
      console.log('🔍 User ID:', userId, 'File path:', filePath);

      if (!filePath) {
        console.log('❌ File path missing');
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
  app.post("/api/sqlite/upload-file", isAuthenticated, upload.single('file'), async (req: any, res: any) => {
    console.log('🔍 SQLite upload-file endpoint hit');
    try {
      const userId = req.user.claims.sub;
      const file = req.file;
      console.log('🔍 User ID:', userId, 'Uploaded file:', file?.originalname);

      if (!file) {
        console.log('❌ No file uploaded');
        return res.status(400).json({ message: "No file uploaded" });
      }

      const allowedExtensions = ['.csv', '.xlsx', '.xls'];
      const fileExtension = path.extname(file.originalname).toLowerCase();

      if (!allowedExtensions.includes(fileExtension)) {
        console.log('❌ Invalid file type:', fileExtension);
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
  app.post("/api/sqlite/create-database", isAuthenticated, upload.single('file'), async (req: any, res: any) => {
    console.log('🔍 SQLite create-database endpoint hit');
    try {
      const userId = req.user.claims.sub;
      
      // Handle both JSON and FormData requests
      let filePath, dbName, tableName, description, snippets;
      
      if (req.is('multipart/form-data')) {
        // FormData request
        filePath = req.body.filePath;
        dbName = req.body.dbName;
        tableName = req.body.tableName;
        description = req.body.description || '';
        snippets = req.body.snippets ? JSON.parse(req.body.snippets) : [];
        
        // Handle existing file ID
        if (req.body.existingFileId && !filePath) {
          const existingFiles = await sqliteService.getExistingExcelCsvFiles(userId);
          const selectedFile = existingFiles.find(f => f.id === parseInt(req.body.existingFileId));
          if (selectedFile) {
            // Use the actual file path from the database
            filePath = selectedFile.filePath;
            console.log('🔍 Using existing file:', selectedFile.fileName, 'at path:', filePath);
            
            // Check if file actually exists
            if (!fs.existsSync(filePath)) {
              console.log('❌ File does not exist at path:', filePath);
              console.log('🔍 Available files in selectedFile:', selectedFile);
              return res.status(400).json({ 
                message: `The selected file "${selectedFile.fileName}" no longer exists on the server. Please upload a new file or select a different existing file.`,
                code: 'FILE_NOT_FOUND',
                fileName: selectedFile.fileName
              });
            }
          } else {
            console.log('❌ File not found with ID:', req.body.existingFileId);
            return res.status(400).json({ 
              message: `File with ID ${req.body.existingFileId} not found` 
            });
          }
        }
        
        // Handle uploaded file
        if (req.file && !filePath) {
          filePath = req.file.path;
        }
      } else {
        // JSON request
        ({ filePath, dbName, tableName, description = '', snippets = [] } = req.body);
      }
      
      console.log('🔍 User ID:', userId, 'DB Name:', dbName, 'Table Name:', tableName, 'File Path:', filePath);

      if (!filePath || !dbName || !tableName) {
        console.log('❌ Missing required fields for create-database');
        return res.status(400).json({ 
          message: "File path, database name, and table name are required" 
        });
      }

      const dbInfo = await sqliteService.createDatabaseFromFile(
        filePath,
        dbName,
        tableName,
        description,
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
  app.post("/api/sqlite/test-query", isAuthenticated, async (req: any, res: any) => {
    console.log('🔍 SQLite test-query endpoint hit');
    try {
      const userId = req.user.claims.sub;
      const { connectionId, sql } = req.body;
      console.log('🔍 User ID:', userId, 'Connection ID:', connectionId, 'SQL:', sql?.substring(0, 50) + '...'); // Log first 50 chars of SQL

      if (!connectionId || !sql) {
        console.log('❌ Missing required fields for test-query');
        return res.status(400).json({ 
          message: "Connection ID and SQL query are required" 
        });
      }

      // Get connection details
      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection) {
        console.log('❌ Database connection not found for ID:', connectionId);
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

  // Delete SQLite database
  app.delete("/api/sqlite/delete-database/:connectionId", isAuthenticated, async (req: any, res: any) => {
    console.log('🔍 SQLite delete-database endpoint hit');
    try {
      const userId = req.user.claims.sub;
      const { connectionId } = req.params;
      console.log('🔍 User ID:', userId, 'Connection ID:', connectionId);

      if (!connectionId) {
        console.log('❌ Connection ID missing');
        return res.status(400).json({ message: "Connection ID is required" });
      }

      // Get connection details to verify ownership and get database path
      const connection = await storage.getDataConnection(parseInt(connectionId), userId);
      if (!connection) {
        console.log('❌ Database connection not found for ID:', connectionId);
        return res.status(404).json({ message: "Database connection not found" });
      }

      // Delete the physical database file if it exists
      if (connection.database && fs.existsSync(connection.database)) {
        fs.unlinkSync(connection.database);
        console.log('🗑️ Deleted database file:', connection.database);
      }

      // Delete the connection record
      await storage.deleteDataConnection(parseInt(connectionId), userId);
      console.log('🗑️ Deleted connection record:', connectionId);

      res.json({
        success: true,
        message: "Database deleted successfully"
      });
    } catch (error) {
      console.error("Error deleting database:", error);
      res.status(500).json({ 
        message: "Failed to delete database",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}