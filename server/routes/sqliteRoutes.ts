import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { sqliteService } from "../services/sqliteService";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "../storage"; // Use the correct storage import
import { db } from "../db";
import { documents, dataConnections } from "../../shared/schema";
import { eq, desc, and, inArray } from "drizzle-orm";

const upload = multer({ dest: 'uploads/sqlite-temp/' });

import { smartAuth as isAuthenticated } from '../smartAuth';

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

  // Diagnose file problems
  app.post("/api/sqlite/diagnose-file", isAuthenticated, async (req: any, res: any) => {
    console.log('🔍 SQLite diagnose-file endpoint hit');
    try {
      const userId = req.user.claims.sub;
      const { filePath } = req.body;
      console.log('🔍 User ID:', userId, 'File path:', filePath);

      if (!filePath) {
        console.log('❌ File path missing');
        return res.status(400).json({ message: "File path is required" });
      }

      const diagnosis = await sqliteService.diagnoseFileProblems(filePath);
      res.json(diagnosis);
    } catch (error) {
      console.error("Error diagnosing file:", error);
      res.status(500).json({
        message: "Failed to diagnose file",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Clean problematic file
  app.post("/api/sqlite/clean-file", isAuthenticated, async (req: any, res: any) => {
    console.log('🔍 SQLite clean-file endpoint hit');
    try {
      const userId = req.user.claims.sub;
      const { filePath } = req.body;
      console.log('🔍 User ID:', userId, 'File path:', filePath);

      if (!filePath) {
        console.log('❌ File path missing');
        return res.status(400).json({ message: "File path is required" });
      }

      const result = await sqliteService.createCleanedFile(filePath, userId);

      // Now analyze the cleaned file
      const analysis = await sqliteService.analyzeFileSchema(result.cleanedFilePath);

      res.json({
        ...result,
        analysis,
        message: 'File cleaned successfully'
      });
    } catch (error) {
      console.error("Error cleaning file:", error);
      res.status(500).json({
        message: "Failed to clean file",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Upload new file for database creation (direct upload without document processing)
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
        // Clean up the uploaded file
        fs.unlinkSync(file.path);
        return res.status(400).json({
          message: "Invalid file type. Only CSV and Excel files are allowed."
        });
      }

      // Create a new file path with the correct extension
      const fileWithExtension = file.path + fileExtension;
      
      // Move the file to include the extension
      fs.renameSync(file.path, fileWithExtension);
      
      console.log('🔄 Renamed file from:', file.path, 'to:', fileWithExtension);

      // Store file reference for SQLite use (no document processing)
      const fileInfo = await sqliteService.registerDirectUpload(userId, {
        originalName: file.originalname,
        filePath: fileWithExtension, // Use the new path with extension
        fileSize: file.size,
        mimeType: file.mimetype
      });

      const analysis = await sqliteService.analyzeFileSchema(fileWithExtension);

      res.json({
        ...analysis,
        fileId: fileInfo.id,
        filePath: fileWithExtension,
        originalName: file.originalname,
        fileSize: file.size
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      // Clean up file if analysis failed
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
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

        // Handle existing file ID - check both existingFileId and selectedFileId
        const fileId = req.body.existingFileId || req.body.selectedFileId;
        if (fileId && !filePath) {
          const existingFiles = await sqliteService.getExistingExcelCsvFiles(userId);
          const selectedFile = existingFiles.find(f => f.id === parseInt(fileId));
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
            console.log('❌ File not found with ID:', fileId);
            return res.status(400).json({
              message: `File with ID ${fileId} not found`
            });
          }
        }

        // Handle uploaded file (direct upload)
        if (req.file && !filePath) {
          filePath = req.file.path;
          console.log('🔍 Using newly uploaded file:', filePath);
        }

        // Handle direct upload file ID
        if (req.body.directFileId && !filePath) {
          const directFile = await sqliteService.getDirectUpload(req.body.directFileId, userId);
          if (directFile) {
            filePath = directFile.filePath;
            console.log('🔍 Using direct upload file:', directFile.originalName, 'at path:', filePath);

            // Verify file still exists
            if (!fs.existsSync(filePath)) {
              console.log('❌ Direct upload file no longer exists:', filePath);
              return res.status(400).json({
                message: `The uploaded file "${directFile.originalName}" is no longer available. Please upload again.`,
                code: 'FILE_NOT_FOUND',
                fileName: directFile.originalName
              });
            }
          } else {
            console.log('❌ Direct upload file not found with ID:', req.body.directFileId);
            return res.status(400).json({
              message: `Direct upload file with ID ${req.body.directFileId} not found`
            });
          }
        }
      } else {
        // JSON request
        ({ filePath, dbName, tableName, description = '', snippets = [] } = req.body);
      }

      console.log('🔍 User ID:', userId, 'DB Name:', dbName, 'Table Name:', tableName, 'File Path:', filePath);
      console.log('🔍 Request body keys:', Object.keys(req.body));
      console.log('🔍 Request body:', JSON.stringify(req.body, null, 2));

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

      // Check if connection already exists before creating database
      const existingConnection = await db
        .select()
        .from(dataConnections)
        .where(
          and(
            eq(dataConnections.userId, userId),
            eq(dataConnections.name, dbName),
            eq(dataConnections.type, 'database')
          )
        )
        .limit(1);

      if (existingConnection.length === 0) {
        // Store database connection in existing system only if it doesn't exist
        const connectionData = {
          name: dbName,
          description,
          type: 'database' as const,
          dbType: 'sqlite',
          host: 'localhost',
          port: 0,
          database: dbInfo.filePath, // Use the actual path from dbInfo
          username: '',
          password: '',
          isActive: true,
          userId
        };

        await storage.saveDataConnection(connectionData);
        console.log('💾 Saved new connection details for database:', dbName);
      } else {
        console.log('🔄 Database connection already exists for:', dbName, '- skipping creation');
      }

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

  // Get all database connections for this user
  app.get("/api/database-connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Remove duplicates first (keep the most recent one for each unique name+type combination)
      const allConnections = await db
        .select({
          id: dataConnections.id,
          name: dataConnections.name,
          type: dataConnections.type,
          createdAt: dataConnections.createdAt
        })
        .from(dataConnections)
        .where(eq(dataConnections.userId, userId))
        .orderBy(desc(dataConnections.createdAt));

      // Group by name+type and keep only the newest
      const uniqueConnections = new Map();
      const duplicateIds = [];

      for (const conn of allConnections) {
        const key = `${conn.name.toLowerCase()}-${conn.type}`;
        if (uniqueConnections.has(key)) {
          // This is a duplicate, mark for deletion
          duplicateIds.push(conn.id);
          console.log(`🔍 Found duplicate connection: ${conn.name} (${conn.type}) - marking for deletion`);
        } else {
          uniqueConnections.set(key, conn);
        }
      }

      // Delete duplicates if any found
      if (duplicateIds.length > 0) {
        await db
          .delete(dataConnections)
          .where(
            and(
              eq(dataConnections.userId, userId),
              inArray(dataConnections.id, duplicateIds)
            )
          );
        console.log(`🗑️ Removed ${duplicateIds.length} duplicate database connections`);
      }

      // Get cleaned connections
      const connections = await db
        .select()
        .from(dataConnections)
        .where(eq(dataConnections.userId, userId))
        .orderBy(desc(dataConnections.createdAt));

      res.json(connections);
    } catch (error) {
      console.error("Error fetching database connections:", error);
      res.status(500).json({ message: "Failed to fetch database connections" });
    }
  });
}