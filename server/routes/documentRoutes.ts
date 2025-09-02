import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { isMicrosoftAuthenticated } from "../microsoftAuth";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { semanticSearchServiceV2 } from "../services/semanticSearchV2";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import * as fsSync from "fs";
import { processDocument, generateChatResponse } from "../services/openai";
import { insertChatConversationSchema, insertChatMessageSchema } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { users, departments } from "@shared/schema";
import { vectorService } from "../services/vectorService";
import { documentProcessor } from "../services/documentProcessor";
import { pool, db } from "../db";
import { registerFolderRoutes } from "./folderRoutes";

// Define a multer storage for handling file uploads
const uploadStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Save files to the 'uploads' directory
  },
  filename: function (req, file, cb) {
    // Fix Thai filename encoding if needed
    let correctedFileName = file.originalname;
    try {
      // Check if filename contains Thai characters that are garbled
      if (
        file.originalname.includes("à¸") ||
        file.originalname.includes("à¹")
      ) {
        // Try to decode and re-encode properly
        const buffer = Buffer.from(file.originalname, "latin1");
        correctedFileName = buffer.toString("utf8");
      }
    } catch (error) {
      console.warn("Failed to fix filename encoding:", error);
      // Keep original filename if encoding fix fails
    }

    const timestamp = Date.now();
    const extension = path.extname(correctedFileName);
    const nameWithoutExt = path.basename(correctedFileName, extension);
    
    // Limit the base filename to prevent filesystem errors
    // Account for timestamp (13 chars) + dash (1 char) + extension
    const maxBaseLength = 240 - timestamp.toString().length - 1 - extension.length;
    const truncatedName = nameWithoutExt.length > maxBaseLength 
      ? nameWithoutExt.substring(0, maxBaseLength) 
      : nameWithoutExt;
    
    const finalFilename = `${timestamp}-${truncatedName}${extension}`;
    
    cb(null, finalFilename);
  },
});

// Initialize multer with the storage configuration
const upload = multer({ storage: uploadStorage });

export function registerDocumentRoutes(app: Express) {
  // Register folder routes
  registerFolderRoutes(app);
  
  app.post(
    "/api/documents/:id/permissions/user",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { documentUserPermissions } = await import("@shared/schema");
        const documentId = parseInt(req.params.id);
        const { userId, permissionType = "read" } = req.body;
        const grantedBy = req.user.claims.sub;

        const [permission] = await db
          .insert(documentUserPermissions)
          .values({ documentId, userId, permissionType, grantedBy })
          .returning();

        res.json(permission);
      } catch (error) {
        console.error("Error granting user permission:", error);
        res.status(500).json({ message: "Failed to grant user permission" });
      }
    },
  );

  app.post(
    "/api/documents/:id/permissions/department",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { documentDepartmentPermissions } = await import(
          "@shared/schema"
        );
        const documentId = parseInt(req.params.id);
        const { departmentId, permissionType = "read" } = req.body;
        const grantedBy = req.user.claims.sub;

        const [permission] = await db
          .insert(documentDepartmentPermissions)
          .values({ documentId, departmentId, permissionType, grantedBy })
          .returning();

        res.json(permission);
      } catch (error) {
        console.error("Error granting department permission:", error);
        res
          .status(500)
          .json({ message: "Failed to grant department permission" });
      }
    },
  );

  app.delete(
    "/api/documents/permissions/user/:permissionId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { documentUserPermissions } = await import("@shared/schema");
        const permissionId = parseInt(req.params.permissionId);

        await db
          .delete(documentUserPermissions)
          .where(eq(documentUserPermissions.id, permissionId));

        res.json({ success: true });
      } catch (error) {
        console.error("Error removing user permission:", error);
        res.status(500).json({ message: "Failed to remove user permission" });
      }
    },
  );

  app.delete(
    "/api/documents/permissions/department/:permissionId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { documentDepartmentPermissions } = await import(
          "@shared/schema"
        );
        const permissionId = parseInt(req.params.permissionId);

        await db
          .delete(documentDepartmentPermissions)
          .where(eq(documentDepartmentPermissions.id, permissionId));

        res.json({ success: true });
      } catch (error) {
        console.error("Error removing department permission:", error);
        res
          .status(500)
          .json({ message: "Failed to remove department permission" });
      }
    },
  );

  // Document routes
  app.get("/api/documents", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const categoryId = req.query.categoryId
        ? parseInt(req.query.categoryId as string)
        : undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string)
        : undefined;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : undefined;

      console.log(`📊 Document API called with limit: ${limit}, userId: ${userId}`);

      // For agent creation, we need all documents - override default limits
      // If no limit specified or a high limit is requested, fetch ALL documents
      const effectiveLimit = (!limit || limit >= 1000) ? null : limit;
      
      console.log(`📊 Using effective limit: ${effectiveLimit} (null means no limit)`);

      const documents = await storage.getDocuments(userId, {
        categoryId,
        limit: effectiveLimit,
        offset,
      });

      console.log(`📊 Storage returned ${documents.length} documents`);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/search", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const query = req.query.query as string;
      const searchType = req.query.type as string || "hybrid";
      const searchFileName = req.query.fileName === "true";
      const searchKeyword = req.query.keyword === "true";
      const searchMeaning = req.query.meaning === "true";

      console.log(
        `Search request - User: ${userId}, Query: "${query}", Type: ${searchType}, FileName: ${searchFileName}, Keyword: ${searchKeyword}, Meaning: ${searchMeaning}`,
      );

      if (!query || query.trim().length === 0) {
        console.log("Empty query, returning empty results");
        return res.json([]);
      }

      let results = [];
      let filenameResults = [];
      let keywordResults = [];
      let semanticResults = [];

      // Filename search
      if (searchFileName) {
        console.log("Performing filename search...");
        try {
          const allDocs = await storage.getDocuments(userId);
          filenameResults = allDocs.filter(doc =>
            (doc.name || doc.originalName || "").toLowerCase().includes(query.toLowerCase())
          ).map(doc => ({
            ...doc,
            searchScore: 100, // Highest priority for filename matches
            searchType: "filename"
          }));
          console.log(`Filename search returned ${filenameResults.length} results`);
        } catch (error) {
          console.error("Filename search failed:", error);
        }
      }

      // Keyword search
      if (searchKeyword) {
        console.log("Performing keyword search...");
        try {
          const { advancedKeywordSearchService } = await import('../services/advancedKeywordSearch');
          const advancedResults = await advancedKeywordSearchService.searchDocuments(query, userId, 50);

          keywordResults = advancedResults.map(result => ({
            ...result,
            searchScore: 50 + (result.similarity * 30), // Medium priority with similarity boost
            searchType: "keyword"
          }));

          console.log(`Keyword search returned ${keywordResults.length} results`);
        } catch (error) {
          console.error("Keyword search failed, falling back to basic:", error);
          const basicResults = await storage.searchDocuments(userId, query);
          keywordResults = basicResults.map(doc => ({
            ...doc,
            searchScore: 40,
            searchType: "keyword"
          }));
        }
      }

      // Semantic search
      if (searchMeaning) {
        console.log("Performing semantic search...");
        try {
          const semanticDocs = await semanticSearchServiceV2.searchDocuments(
            query,
            userId,
            { searchType: "semantic" },
          );

          semanticResults = semanticDocs.map(doc => ({
            ...doc,
            searchScore: 20 + (doc.similarity || 0) * 25, // Lower priority but similarity-based
            searchType: "semantic"
          }));

          console.log(`Semantic search returned ${semanticResults.length} results`);
        } catch (error) {
          console.error("Semantic search failed:", error);
        }
      }

      // Merge and deduplicate results
      const allResults = [...filenameResults, ...keywordResults, ...semanticResults];
      const deduplicatedResults = new Map();

      // Keep the highest scoring result for each document
      allResults.forEach(result => {
        const docId = result.id;
        if (!deduplicatedResults.has(docId) ||
            result.searchScore > deduplicatedResults.get(docId).searchScore) {
          deduplicatedResults.set(docId, result);
        }
      });

      // Sort by search score (highest first) then by relevance
      results = Array.from(deduplicatedResults.values())
        .sort((a, b) => {
          if (b.searchScore !== a.searchScore) {
            return b.searchScore - a.searchScore;
          }
          // Secondary sort by similarity if available
          return (b.similarity || 0) - (a.similarity || 0);
        });

      console.log(`Final results count: ${results.length} (filename: ${filenameResults.length}, keyword: ${keywordResults.length}, semantic: ${semanticResults.length})`);

      // Log the search action for audit
      await storage.createAuditLog({
        userId,
        action: "search",
        resourceType: "document",
        ipAddress: req.ip || req.connection.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        success: true,
        details: {
          query: query,
          searchType: searchType,
          searchFileName,
          searchKeyword,
          searchMeaning,
          resultsCount: results.length,
        },
      });

      res.json(results);


    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ message: "Failed to search documents" });
    }
  });

  app.get("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);

      // Get basic document first
      const document = await storage.getDocument(id, userId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Get user information separately to avoid complex query issues
      const [uploaderInfo] = await db
        .select({
          uploaderName:
            sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`.as(
              "uploaderName",
            ),
          uploaderEmail: users.email,
          uploaderRole: users.role,
          departmentName: departments.name,
        })
        .from(users)
        .leftJoin(departments, eq(users.departmentId, departments.id))
        .where(eq(users.id, document.userId));

      // Combine document with uploader info
      const documentWithUploader = {
        ...document,
        uploaderName: uploaderInfo?.uploaderName || "Unknown User",
        uploaderEmail: uploaderInfo?.uploaderEmail || "",
        uploaderRole: uploaderInfo?.uploaderRole || "user",
        departmentName: uploaderInfo?.departmentName || "No Department",
      };

      // Log access
      await storage.logDocumentAccess(id, userId, "view");
      res.json(documentWithUploader);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  app.get(
    "/api/documents/:id/summary",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const id = parseInt(req.params.id);
        const document = await storage.getDocument(id, userId);

        if (!document) {
          return res.status(404).json({ message: "Document not found" });
        }

        // Return existing summary or content excerpt
        const summary =
          document.summary ||
          (document.content
            ? document.content.substring(0, 500) + "..."
            : "No content summary available for this document.");

        res.json({ summary });
      } catch (error) {
        console.error("Error fetching document summary:", error);
        res.status(500).json({ message: "Failed to fetch document summary" });
      }
    },
  );

  // Translation API endpoint with database caching
  app.post(
    "/api/documents/:id/translate",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const documentId = parseInt(req.params.id);
        const { targetLanguage } = req.body;

        console.log(
          `Translation request: documentId=${documentId}, targetLanguage=${targetLanguage}, userId=${userId}`,
        );

        if (!targetLanguage) {
          console.log("Missing target language in request");
          return res
            .status(400)
            .json({ message: "Target language is required" });
        }

        // Get document
        const document = await storage.getDocument(documentId, userId);
        if (!document) {
          console.log(`Document ${documentId} not found for user ${userId}`);
          return res.status(404).json({ message: "Document not found" });
        }

        if (!document.summary) {
          console.log(`Document ${documentId} has no summary to translate`);
          return res
            .status(400)
            .json({ message: "Document has no summary to translate" });
        }

        console.log(
          `Found document: ${document.name}, summary length: ${document.summary.length}`,
        );

        // Create translation using OpenAI directly
        if (!process.env.OPENAI_API_KEY) {
          return res
            .status(500)
            .json({ message: "Translation service not available" });
        }

        console.log("Creating fresh translation with OpenAI");

        const OpenAI = await import("openai");
        const openai = new OpenAI.default({
          apiKey: process.env.OPENAI_API_KEY,
        });

        const prompt = `Translate the following text to ${targetLanguage}. Maintain the same tone and meaning. Only return the translated text without any additional explanation:

${document.summary}`;

        console.log(
          `Sending translation request to OpenAI for ${targetLanguage}`,
        );

        const response = await openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 2000,
          temperature: 0.3
        });

        const translatedText = response.choices[0].message.content?.trim();

        console.log(
          `OpenAI response received, translated text length: ${translatedText?.length || 0}`,
        );

        if (!translatedText) {
          console.log("OpenAI translation failed - no content returned");
          return res
            .status(500)
            .json({ message: "Translation failed - no content from OpenAI" });
        }

        console.log("Translation successful, returning result");

        // Log the translation action for audit
        await storage.createAuditLog({
          userId,
          action: "translate",
          resourceType: "document",
          resourceId: documentId.toString(),
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            documentId: documentId,
            targetLanguage: targetLanguage,
            contentLength: translatedText.length,
          },
        });

        res.json({ translatedText });
      } catch (error) {
        console.error("Translation error:", error);
        res.status(500).json({ message: "Failed to translate text" });
      }
    },
  );

  app.post(
    "/api/documents/upload",
    isAuthenticated,
    upload.array("files", 10),
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const files = req.files as Express.Multer.File[];

        // Parse metadata if provided
        let metadataArray: any[] = [];
        try {
          if (req.body.metadata) {
            metadataArray = JSON.parse(req.body.metadata);
          }
        } catch (error) {
          console.warn("Failed to parse metadata:", error);
        }

        console.log("📤 Upload request received:", {
          userId,
          filesCount: files?.length || 0,
          bodyKeys: Object.keys(req.body || {}),
          hasFiles: !!files,
          hasMetadata: metadataArray.length > 0,
          metadataArray: metadataArray.map(m => ({
            fileName: m.fileName,
            name: m.name,
            folderId: m.folderId
          }))
        });

        if (!files || files.length === 0) {
          console.log("No files in request, body:", req.body);
          return res.status(400).json({ message: "No files uploaded" });
        }

        const uploadedDocuments = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const metadata = metadataArray.find(meta => meta.fileName === file.originalname) || metadataArray[i]; // Fallback to index-based matching

          console.log(`📄 Processing file ${i + 1}/${files.length}:`, {
            originalName: file.originalname,
            foundMetadata: !!metadata,
            metadataFolderId: metadata?.folderId,
            metadataName: metadata?.name,
            fileSize: (file.size / 1024 / 1024).toFixed(2) + 'MB'
          });

          try {
            // Fix Thai filename encoding if needed
            let correctedFileName = file.originalname;
            try {
              // Check if filename contains Thai characters that are garbled
              if (
                file.originalname.includes("à¸") ||
                file.originalname.includes("à¹")
              ) {
                // Try to decode and re-encode properly
                const buffer = Buffer.from(file.originalname, "latin1");
                correctedFileName = buffer.toString("utf8");
                console.log(
                  `Fixed Thai filename: ${file.originalname} -> ${correctedFileName}`,
                );
              }
            } catch (error) {
              console.warn("Failed to fix filename encoding:", error);
              // Keep original filename if encoding fix fails
            }

            // Process the document with enhanced AI classification
            const { content, summary, tags, category, categoryColor } =
              await processDocument(file.path, file.mimetype);

            const documentData = {
              name: metadata?.name || correctedFileName, // Use correctedFileName here
              fileName: file.filename,
              filePath: file.path,
              fileSize: file.size,
              mimeType: file.mimetype,
              content,
              summary,
              tags,
              aiCategory: category,
              aiCategoryColor: categoryColor,
              userId,
              processedAt: new Date(),
              effectiveStartDate: metadata?.effectiveStartDate ? new Date(metadata.effectiveStartDate) : null,
              effectiveEndDate: metadata?.effectiveEndDate ? new Date(metadata.effectiveEndDate) : null,
              folderId: metadata?.folderId || null, // Ensure folderId is properly set
            };

            const document = await storage.createDocument(documentData);
            uploadedDocuments.push(document);

            // Auto-vectorize the document if it has content
            if (content && content.trim().length > 0) {
              try {
                await vectorService.addDocument(
                  document.id.toString(),
                  content,
                  {
                    userId,
                    documentName: document.name,
                    mimeType: document.mimeType,
                    tags: document.tags || [],
                    originalDocumentId: document.id.toString(),
                  },
                );
                console.log(
                  `Document ${document.id} auto-vectorized successfully`,
                );
              } catch (vectorError) {
                console.error(
                  `Failed to auto-vectorize document ${document.id}:`,
                  vectorError,
                );
              }
            }

            console.log(
              `✅ Document processed: ${correctedFileName} -> ID: ${document.id}, Category: ${category}, Tags: ${tags?.join(", ")}`,
            );
          } catch (error) {
            // Fix Thai filename encoding for error fallback too
            let correctedFileName = file.originalname;
            try {
              if (
                file.originalname.includes("à¸") ||
                file.originalname.includes("à¹")
              ) {
                const buffer = Buffer.from(file.originalname, "latin1");
                correctedFileName = buffer.toString("utf8");
              }
            } catch (encodingError) {
              console.warn(
                "Failed to fix filename encoding in error handler:",
                encodingError,
              );
            }

            console.error(`Error processing file ${correctedFileName}:`, error);
            // Still create document without AI processing
            const documentData = {
              name: correctedFileName,
              fileName: file.filename,
              filePath: file.path,
              fileSize: file.size,
              mimeType: file.mimetype,
              aiCategory: "Uncategorized",
              aiCategoryColor: "#6B7280",
              userId,
              folderId: metadata?.folderId || null, // Ensure folderId is properly set
            };
            const document = await storage.createDocument(documentData);
            uploadedDocuments.push(document);
          }
        }

        // Log document upload for audit
        try {
          await storage.createAuditLog({
            userId,
            action: "upload",
            resourceType: "document",
            ipAddress: req.ip || req.connection.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"] || "unknown",
            success: true,
            details: {
              documentsCount: uploadedDocuments.length,
              documentNames: uploadedDocuments.map((doc) => doc.name),
            },
          });
        } catch (auditError) {
          console.error("Failed to create audit log for upload:", auditError);
        }

        console.log(`🎉 Upload completed successfully:`, {
          documentsUploaded: uploadedDocuments.length,
          documentIds: uploadedDocuments.map(doc => doc.id),
          documentNames: uploadedDocuments.map(doc => doc.name)
        });
        
        res.json({
          success: true,
          documents: uploadedDocuments,
          count: uploadedDocuments.length,
          message: `Successfully uploaded ${uploadedDocuments.length} document(s)`
        });
      } catch (error) {
        console.error("Error uploading documents:", error);
        res.status(500).json({ message: "Failed to upload documents" });
      }
    },
  );

  app.get(
    "/api/documents/:id/download",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const id = parseInt(req.params.id);
        const document = await storage.getDocument(id, userId);

        if (!document) {
          return res.status(404).json({ message: "Document not found" });
        }

        const filePath = path.join(process.cwd(), "uploads", document.fileName);

        if (!fsSync.existsSync(filePath)) {
          return res.status(404).json({ message: "File not found" });
        }

        // Log access
        await storage.logDocumentAccess(id, userId, "download");

        // Log the download action for audit
        await storage.createAuditLog({
          userId,
          action: "download",
          resourceType: "document",
          resourceId: id.toString(),
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            fileName: document.name,
            fileSize: document.fileSize,
          },
        });

        // Set proper headers to prevent corruption
        res.setHeader("Content-Type", document.mimeType);
        // Use RFC 5987 encoding for Thai filenames to ensure proper display
        const encodedFilename = encodeURIComponent(document.name);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodedFilename}`,
        );
        res.setHeader("Content-Length", fsSync.statSync(filePath).size);

        const fileStream = fsSync.createReadStream(filePath);
        fileStream.pipe(res);
      } catch (error) {
        console.error("Error downloading document:", error);
        res.status(500).json({ message: "Failed to download document" });
      }
    },
  );

  app.post(
    "/api/documents/:id/favorite",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const id = parseInt(req.params.id);
        const document = await storage.toggleDocumentFavorite(id, userId);
        res.json(document);
      } catch (error) {
        console.error("Error toggling favorite:", error);
        res.status(500).json({ message: "Failed to toggle favorite" });
      }
    },
  );

  app.post(
    "/api/documents/:id/vectorize",
    (req: any, res: any, next: any) => {
      // Try Microsoft auth first, then fallback to Replit auth
      isMicrosoftAuthenticated(req, res, (err: any) => {
        if (!err) {
          return next();
        }
        isAuthenticated(req, res, next);
      });
    },
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const id = parseInt(req.params.id);
        const { preserveExistingEmbeddings = false } = req.body;
        const document = await storage.getDocument(id, userId);

        if (!document) {
          return res.status(404).json({ message: "Document not found" });
        }

        if (document.content && document.content.trim().length > 0) {
          const result = await vectorService.addDocument(id.toString(), document.content, {
            userId,
            documentName: document.name,
            mimeType: document.mimeType,
            tags: document.tags || [],
          }, document.mimeType, preserveExistingEmbeddings);

          console.log(`Document ${id} manually vectorized successfully with preserve mode: ${preserveExistingEmbeddings}`);
          res.json({
            success: true,
            message: result,
            preservedExistingEmbeddings: preserveExistingEmbeddings
          });
        } else {
          res.status(400).json({
            message: "Document has no extractable content for vectorization",
          });
        }
      } catch (error) {
        console.error("Error adding document to vector database:", error);
        res
          .status(500)
          .json({ message: "Failed to add document to vector database" });
      }
    },
  );

  app.post(
    "/api/documents/vectorize-all",
    (req: any, res: any, next: any) => {
      // Try Microsoft auth first, then fallback to Replit auth
      isMicrosoftAuthenticated(req, res, (err: any) => {
        if (!err) {
          return next();
        }
        isAuthenticated(req, res, next);
      });
    },
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const { preserveExistingEmbeddings = false } = req.body;
        const documents = await storage.getDocuments(userId);

        let vectorizedCount = 0;
        let skippedCount = 0;

        console.log(
          `Starting to vectorize ${documents.length} documents for user ${userId} with preserve mode: ${preserveExistingEmbeddings}`,
        );

        for (const doc of documents) {
          if (doc.content && doc.content.trim().length > 0) {
            try {
              await vectorService.addDocument(doc.id.toString(), doc.content, {
                userId,
                documentName: doc.name,
                mimeType: doc.mimeType,
                tags: doc.tags || [],
              }, doc.mimeType, preserveExistingEmbeddings);
              vectorizedCount++;
              console.log(
                `Vectorized document ${doc.id}: ${doc.name}`);
            } catch (error) {
              console.error(`Failed to vectorize document ${doc.id}:`, error);
              skippedCount++;
            }
          } else {
            skippedCount++;
          }
        }

        console.log(
          `Vectorization complete: ${vectorizedCount} vectorized, ${skippedCount} skipped`,
        );
        res.json({
          success: true,
          message: `${preserveExistingEmbeddings ? 'Re-vectorized' : 'Vectorized'} ${vectorizedCount} documents, skipped ${skippedCount}`,
          vectorizedCount,
          skippedCount,
          preservedExistingEmbeddings: preserveExistingEmbeddings
        });
      } catch (error) {
        console.error("Error vectorizing all documents:", error);
        res.status(500).json({ message: "Failed to vectorize documents" });
      }
    },
  );

  // Revert vectorization endpoint
  app.post(
    "/api/documents/revert-vectorization",
    (req: any, res: any, next: any) => {
      // Try Microsoft auth first, then fallback to Replit auth
      isMicrosoftAuthenticated(req, res, (err: any) => {
        if (!err) {
          return next();
        }
        isAuthenticated(req, res, next);
      });
    },
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;

        console.log(`Starting revert vectorization for user ${userId}`);

        // Get all document vectors for this user that have multi-provider embeddings
        const { documentVectors } = await import("@shared/schema");
        const { eq, and, isNotNull } = await import("drizzle-orm");

        const vectorsToRevert = await db.select()
          .from(documentVectors)
          .where(
            and(
              eq(documentVectors.userId, userId),
              isNotNull(documentVectors.embeddingMulti)
            )
          );

        let revertedCount = 0;

        for (const vector of vectorsToRevert) {
          try {
            const embeddingMulti = vector.embeddingMulti as { openai?: number[]; gemini?: number[] };

            // If we have a previous embedding to revert to
            if (embeddingMulti && (embeddingMulti.gemini || embeddingMulti.openai)) {
              // Prefer reverting to OpenAI embedding if available, otherwise use Gemini
              const revertToEmbedding = embeddingMulti.openai || embeddingMulti.gemini;

              // Update the main embedding column and clear the multi-provider column
              await db.update(documentVectors)
                .set({
                  embedding: revertToEmbedding,
                  embeddingMulti: null // Clear the multi-provider column
                })
                .where(eq(documentVectors.id, vector.id));

              revertedCount++;
            }
          } catch (error) {
            console.error(`Failed to revert vector ${vector.id}:`, error);
          }
        }

        console.log(`Revert complete: ${revertedCount} vectors reverted`);

        res.json({
          success: true,
          message: `Successfully reverted ${revertedCount} document embeddings`,
          revertedCount
        });

      } catch (error) {
        console.error("Error reverting vectorization:", error);
        res.status(500).json({
          message: "Failed to revert vectorization",
          error: error.message
        });
      }
    },
  );

  // Test Gemini embeddings endpoint
  app.post(
    "/api/test/gemini-embedding",
    (req: any, res: any, next: any) => {
      // Try Microsoft auth first, then fallback to Replit auth
      isMicrosoftAuthenticated(req, res, (err: any) => {
        if (!err) {
          return next();
        }
        isAuthenticated(req, res, next);
      });
    },
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const { text = "Hello, this is a test embedding." } = req.body;

        console.log(`Testing Gemini embedding for user ${userId}`);

        // Test Gemini embedding generation
        const { llmRouter } = await import("./services/llmRouter");
        const embeddings = await llmRouter.generateEmbeddings([text], userId);

        if (embeddings && embeddings[0] && embeddings[0].length > 0) {
          console.log(`✅ Gemini embedding test successful: ${embeddings[0].length} dimensions`);
          res.json({
            success: true,
            message: "Gemini embedding generated successfully",
            dimensions: embeddings[0].length,
            sampleValues: embeddings[0].slice(0, 5) // First 5 values for verification
          });
        } else {
          console.log("❌ Gemini embedding test failed: no valid embedding returned");
          res.status(500).json({
            success: false,
            message: "Failed to generate Gemini embedding"
          });
        }

      } catch (error) {
        console.error("Error testing Gemini embedding:", error);
        res.status(500).json({
          message: "Failed to test Gemini embedding",
          error: error.message
        });
      }
    },
  );

  // Document endorsement endpoint
  app.post("/api/documents/:id/endorse", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = parseInt(req.params.id);
      const { effectiveStartDate, effectiveEndDate } = req.body;

      // Validate input
      if (!effectiveStartDate) {
        return res.status(400).json({ message: "Effective start date is required" });
      }

      // Validate date format and logic
      const startDate = new Date(effectiveStartDate);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ message: "Invalid effective start date format" });
      }

      if (effectiveEndDate) {
        const endDate = new Date(effectiveEndDate);
        if (isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "Invalid effective end date format" });
        }
        if (endDate <= startDate) {
          return res.status(400).json({ message: "End date must be after start date" });
        }
      }

      // Verify the document exists and user has access
      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Endorse the document
      const endorsedDocument = await storage.endorseDocument(
        documentId,
        userId,
        effectiveStartDate,
        effectiveEndDate
      );

      // Log endorsement action for audit
      try {
        await storage.createAuditLog({
          userId,
          action: "endorse",
          resourceType: "document",
          resourceId: documentId.toString(),
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            documentName: document.name,
            effectiveStartDate,
            effectiveEndDate: effectiveEndDate || null,
          },
        });
      } catch (auditError) {
        console.error("Failed to create audit log for endorsement:", auditError);
      }

      res.json({
        success: true,
        message: "Document endorsed successfully",
        document: endorsedDocument,
      });
    } catch (error) {
      console.error("Error endorsing document:", error);
      res.status(500).json({
        message: "Failed to endorse document",
        error: error.message,
      });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);

      console.log(`Delete request for document ${id} by user ${userId}`);

      // Get document to verify ownership and get file path
      const document = await storage.getDocument(id, userId);
      if (!document) {
        console.log(`Document ${id} not found for user ${userId}`);
        return res.status(404).json({ message: "Document not found" });
      }

      console.log(
        `Found document: ${document.name}, filePath: ${document.filePath}`,
      );

      // Delete physical file first
      if (document.filePath) {
        try {
          await fs.unlink(document.filePath);
          console.log(`Successfully deleted file: ${document.filePath}`);
        } catch (error) {
          console.error("Error deleting file:", error);
          // Continue with database deletion even if file deletion fails
        }
      }

      // Delete from database
      await storage.deleteDocument(id, userId);
      console.log(`Successfully deleted document ${id} from database`);

      // Log document deletion for audit
      try {
        await storage.createAuditLog({
          userId,
          action: "delete",
          resourceType: "document",
          resourceId: id.toString(),
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            documentName: document.name,
            fileSize: document.fileSize,
          },
        });
      } catch (auditError) {
        console.error("Failed to create audit log for delete:", auditError);
      }

      res.json({ success: true, message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res
        .status(500)
        .json({ message: "Failed to delete document", error: error.message });
    }
  });

  // Chat routes
  app.get("/api/chat/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversations = await storage.getChatConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post(
    "/api/chat/conversations",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const conversationData = insertChatConversationSchema.parse({
          ...req.body,
          userId,
        });
        const conversation =
          await storage.createChatConversation(conversationData);
        res.json(conversation);
      } catch (error) {
        console.error("Error creating conversation:", error);
        res.status(500).json({ message: "Failed to create conversation" });
      }
    },
  );

  app.get(
    "/api/chat/conversations/:id/messages",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const conversationId = parseInt(req.params.id);
        const messages = await storage.getChatMessages(conversationId, userId);
        res.json(messages);
      } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: "Failed to fetch messages" });
      }
    },
  );

  app.post("/api/chat/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId, content, documentId } = req.body;

      // Create user message
      const userMessage = await storage.createChatMessage({
        conversationId,
        role: "user",
        content,
      });

      // Get specific document if documentId is provided, otherwise get all documents
      let documents;
      if (documentId) {
        const specificDocument = await storage.getDocument(documentId, userId);
        documents = specificDocument ? [specificDocument] : [];
      } else {
        documents = await storage.getDocuments(userId, { limit: 100 });
      }

      // Generate AI response with specific document context using hybrid search
      const aiResponse = await generateChatResponse(
        content,
        documents,
        documentId ? documentId : undefined,
        'hybrid',
        0.4, // keywordWeight
        0.6  // vectorWeight
      );

      // Create assistant message
      const assistantMessage = await storage.createChatMessage({
        conversationId,
        role: "assistant",
        content: aiResponse,
      });

      // Log document access if specific document was referenced
      if (documentId) {
        await storage.logDocumentAccess(documentId, userId, "chat", {
          query: content,
          conversationId: conversationId,
        });
      }

      // Log chat interaction for audit
      try {
        await storage.createAuditLog({
          userId,
          action: "chat",
          resourceType: "ai_assistant",
          resourceId: conversationId?.toString(),
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            conversationId: conversationId,
            userMessage: content,
            assistantResponse: aiResponse,
            messageLength: content.length,
            responseLength: aiResponse.length,
            hasDocumentContext: !!documentId,
            documentId: documentId || null,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (auditError) {
        console.error("Failed to create audit log for chat:", auditError);
      }

      // Automatically analyze AI response quality
      try {
        const startTime = Date.now();
        const responseTime = Date.now() - startTime;

        const analysisPrompt = `
Analyze this AI assistant response to determine if it's a "positive" (helpful, informative response) or "fallback" (unable to answer, generic response).

User Query: "${content}"
Assistant Response: "${aiResponse}"

Classification criteria:
- "positive": The response contains specific information, facts, procedures, or actionable guidance that directly addresses the user's question. Even if the response says "according to the document" or references sources, it's positive if it provides useful information.
- "fallback": The response explicitly states inability to help, gives only generic advice without specifics, or clearly indicates no relevant information was found.

Respond with JSON: {"result": "positive" or "fallback", "confidence": 0.0-1.0, "reason": "explanation"}
`;

        const openai = new (await import("openai")).default({
          apiKey: process.env.OPENAI_API_KEY,
        });

        const response = await openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [{ role: "user", content: analysisPrompt }],
          response_format: { type: "json_object" },
        });

        const analysisResult = JSON.parse(
          response.choices[0].message.content || "{}",
        );

        // Store the analysis result
        await storage.createAiResponseAnalysis({
          chatMessageId: assistantMessage.id,
          userId,
          userQuery: content,
          assistantResponse: aiResponse,
          analysisResult: analysisResult.result,
          analysisConfidence: analysisResult.confidence,
          analysisReason: analysisResult.reason,
          documentContext: documentId
            ? `Document ID: ${documentId}`
            : "General chat",
          responseTime,
        });

        console.log(
          `AI Response Analysis completed: ${analysisResult.result} (confidence: ${analysisResult.confidence})`,
        );
      } catch (analysisError) {
        console.error("Failed to analyze AI response:", analysisError);
      }

      res.json([userMessage, assistantMessage]);
    } catch (error) {
      console.error("Error processing chat message:", error);
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  // Vector database management routes
  app.get("/api/vector/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userDocuments = await vectorService.getDocumentsByUser(userId);
      const totalDocuments = await vectorService.getDocumentCount();
      const chunkStats = await vectorService.getDocumentChunkStats(userId);

      // Group chunks by original document
      const documentMap = new Map();
      userDocuments.forEach((doc) => {
        const originalDocId = doc.metadata.originalDocumentId || doc.id;
        if (!documentMap.has(originalDocId)) {
          documentMap.set(originalDocId, {
            id: originalDocId,
            name: doc.metadata.documentName,
            type: doc.metadata.mimeType,
            chunks: 0,
            totalLength: 0,
          });
        }
        const entry = documentMap.get(originalDocId);
        entry.chunks++;
        entry.totalLength += doc.content.length;
      });

      res.json({
        userDocuments: userDocuments.length,
        totalDocuments,
        uniqueDocuments: documentMap.size,
        chunkStats,
        vectorized: Array.from(documentMap.values()),
      });
    } catch (error) {
      console.error("Error getting vector stats:", error);
      res.status(500).json({ message: "Failed to get vector database stats" });
    }
  });

  // Re-vectorize all documents endpoint
  app.post(
    "/api/vector/reindex-all",
    (req: any, res: any, next: any) => {
      // Try Microsoft auth first, then fallback to Replit auth
      isMicrosoftAuthenticated(req, res, (err: any) => {
        if (!err) {
          return next();
        }
        isAuthenticated(req, res, next);
      });
    },
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const { preserveExistingEmbeddings = true } = req.body; // Default to preserving for re-indexing
        const documents = await storage.getDocuments(userId);

        let processedCount = 0;
        let errorCount = 0;
        const results: any[] = [];

        console.log(`Re-indexing ${documents.length} documents with preserve mode: ${preserveExistingEmbeddings}`);

        for (const document of documents) {
          if (document.content && document.content.trim().length > 0) {
            try {
              const result = await vectorService.addDocument(
                document.id.toString(),
                document.content,
                {
                  userId,
                  documentName: document.name,
                  mimeType: document.mimeType,
                  tags: document.tags || [],
                },
                document.mimeType,
                preserveExistingEmbeddings
              );

              processedCount++;
              results.push({
                id: document.id,
                name: document.name,
                status: "success",
                result: result
              });

              // Add delay to avoid rate limiting
              await new Promise((resolve) => setTimeout(resolve, 200));
            } catch (error) {
              console.error(
                `Error re-vectorizing document ${document.id}:`,
                error,
              );
              errorCount++;
              results.push({
                id: document.id,
                name: document.name,
                status: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          } else {
            results.push({
              id: document.id,
              name: document.name,
              status: "skipped",
              reason: "No content to vectorize",
            });
          }
        }

        res.json({
          success: true,
          message: `Re-indexing completed. Processed: ${processedCount}, Errors: ${errorCount}${preserveExistingEmbeddings ? ' (preserved existing embeddings)' : ''}`,
          processed: processedCount,
          errors: errorCount,
          total: documents.length,
          preservedExistingEmbeddings: preserveExistingEmbeddings,
          results,
        });
      } catch (error) {
        console.error("Error re-indexing documents:", error);
        res.status(500).json({ message: "Failed to re-index documents" });
      }
    },
  );

  app.post(
    "/api/documents/:id/reprocess",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const documentId = parseInt(req.params.id);

        const document = await storage.getDocument(documentId, userId);
        if (!document) {
          return res.status(404).json({ message: "Document not found" });
        }

        // Remove from vector database first
        await vectorService.removeDocument(documentId.toString());

        // Reprocess document
        await documentProcessor.processDocument(documentId);

        res.json({ message: "Document reprocessed successfully" });
      } catch (error) {
        console.error("Error reprocessing document:", error);
        res.status(500).json({ message: "Failed to reprocess document" });
      }
    },
  );

}