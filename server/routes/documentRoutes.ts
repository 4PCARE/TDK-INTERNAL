import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { documents, users, departments } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import * as fsSync from "fs";
import { processDocument, generateChatResponse } from "../services/openai";
import { vectorService } from "../services/vectorService";
import { semanticSearchServiceV2 } from "../services/semanticSearchV2";
import OpenAI from "openai";

// File upload configuration
const uploadDir = path.join(process.cwd(), "uploads");

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
};

const storage_multer = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const upload = multer({
  storage: storage_multer,
  fileFilter: (req, file, cb) => {
    // Ensure proper UTF-8 encoding for filename
    if (file.originalname) {
      file.originalname = Buffer.from(file.originalname, "latin1").toString(
        "utf8",
      );
    }

    const allowedMimes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
      "text/plain",
      "text/csv",
      "application/json",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Supported: PDF, DOCX, XLSX, PPTX, TXT, CSV, JSON, and image files.",
        ),
      );
    }
  },
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function registerDocumentRoutes(app: Express) {
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

      const documents = await storage.getDocuments(userId, {
        categoryId,
        limit,
        offset,
      });
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/search", smartAuth, async (req: any, res) => {
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
            id: result.id,
            name: result.name,
            content: result.content,
            summary: result.summary,
            aiCategory: result.aiCategory,
            createdAt: result.createdAt,
            similarity: result.similarity,
            tags: [],
            categoryId: null,
            userId: userId,
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
            { 
              searchType: "semantic",
              massSelectionPercentage: 0.6
            },
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

  app.get("/api/documents/:id", smartAuth, async (req: any, res) => {
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
    smartAuth,
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
    smartAuth,
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

        const prompt = `Translate the following text to ${targetLanguage}. Maintain the same tone and meaning. Only return the translated text without any additional explanation:

${document.summary}`;

        console.log(
          `Sending translation request to OpenAI for ${targetLanguage}`,
        );

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 2000,
          temperature: 0.3,
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
    smartAuth,
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

        console.log("Upload request received:", {
          userId,
          filesCount: files?.length || 0,
          bodyKeys: Object.keys(req.body || {}),
          hasFiles: !!files,
          hasMetadata: metadataArray.length > 0,
        });

        if (!files || files.length === 0) {
          console.log("No files in request, body:", req.body);
          return res.status(400).json({ message: "No files uploaded" });
        }

        const uploadedDocuments = [];

        for (const file of files) {
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

            // Find metadata for this file
            const fileMetadata = metadataArray.find(meta => meta.fileName === file.originalname);

            // Helper function to ensure correct file extension
            const ensureCorrectExtension = (inputName: string, originalFileName: string, mimeType: string): string => {
              // Get the correct extension based on mime type
              const getCorrectExtension = (mime: string): string => {
                const mimeToExt: Record<string, string> = {
                  'application/pdf': '.pdf',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
                  'application/msword': '.doc',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
                  'application/vnd.ms-excel': '.xls',
                  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
                  'application/vnd.ms-powerpoint': '.ppt',
                  'text/plain': '.txt',
                  'text/csv': '.csv',
                  'application/json': '.json',
                  'image/jpeg': '.jpg',
                  'image/jpg': '.jpg',
                  'image/png': '.png',
                  'image/gif': '.gif',
                  'image/webp': '.webp',
                };
                return mimeToExt[mime] || '';
              };

              const correctExtension = getCorrectExtension(mimeType);
              if (!correctExtension) {
                return inputName; // No known extension for this mime type
              }

              // Check if the input already has the correct extension
              if (inputName.toLowerCase().endsWith(correctExtension.toLowerCase())) {
                return inputName;
              }

              // Check if the input has no extension
              const lastDotIndex = inputName.lastIndexOf('.');
              if (lastDotIndex === -1) {
                return inputName + correctExtension;
              }

              // Input has a different extension, append the correct one
              return inputName + correctExtension;
            };

            // Process the document with enhanced AI classification
            const { content, summary, tags, category, categoryColor } =
              await processDocument(file.path, file.mimetype);

            // Ensure the document name has the correct file extension
            let finalDocumentName = fileMetadata?.name || correctedFileName;
            finalDocumentName = ensureCorrectExtension(finalDocumentName, correctedFileName, file.mimetype);

            const documentData = {
              name: finalDocumentName,
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
              effectiveStartDate: fileMetadata?.effectiveStartDate ? new Date(fileMetadata.effectiveStartDate) : null,
              effectiveEndDate: fileMetadata?.effectiveEndDate ? new Date(fileMetadata.effectiveEndDate) : null,
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
              `Document processed: ${correctedFileName} -> Category: ${category}, Tags: ${tags?.join(", ")}`,
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
            let fallbackName = correctedFileName;
            try {
              fallbackName = ensureCorrectExtension(correctedFileName, correctedFileName, file.mimetype);
            } catch (extError) {
              console.warn("Failed to apply extension correction to fallback name:", extError);
            }

            const documentData = {
              name: fallbackName,
              fileName: file.filename,
              filePath: file.path,
              fileSize: file.size,
              mimeType: file.mimetype,
              aiCategory: "Uncategorized",
              aiCategoryColor: "#6B7280",
              userId,
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

        res.json(uploadedDocuments);
      } catch (error) {
        console.error("Error uploading documents:", error);
        res.status(500).json({ message: "Failed to upload documents" });
      }
    },
  );

  app.get(
    "/api/documents/:id/download",
    smartAuth,
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
    smartAuth,
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

  // Document endorsement endpoint
  app.post("/api/documents/:id/endorse", smartAuth, async (req: any, res) => {
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

  // Bulk endorse documents
  app.post("/api/documents/bulk/endorse", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { documentIds, effectiveStartDate, effectiveEndDate } = req.body;

      if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ message: "No document IDs provided" });
      }

      // Validate dates
      if (!effectiveStartDate) {
        return res.status(400).json({ message: "Effective start date is required" });
      }
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

      // Perform bulk update
      await db.transaction(async (trx) => {
        for (const docId of documentIds) {
          await trx.update(documents)
            .set({
              endorsed: true,
              endorsedAt: new Date(),
              endorsedBy: userId,
              validStartDate: startDate,
              validEndDate: endDate || null,
            })
            .where(eq(documents.id, docId));
        }
      });

      // Log the bulk endorsement action for audit
      try {
        await storage.createAuditLog({
          userId,
          action: "bulk_endorse",
          resourceType: "document",
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            documentIds: documentIds,
            effectiveStartDate,
            effectiveEndDate: effectiveEndDate || null,
            count: documentIds.length,
          },
        });
      } catch (auditError) {
        console.error("Failed to create audit log for bulk endorsement:", auditError);
      }

      res.json({ success: true, message: "Documents endorsed successfully" });
    } catch (error) {
      console.error("Error during bulk endorsement:", error);
      res.status(500).json({ message: "Failed to perform bulk endorsement", error: error.message });
    }
  });

  // Bulk update document valid dates
  app.put("/api/documents/bulk/dates", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { documentIds, validStartDate, validEndDate } = req.body;

      if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ message: "No document IDs provided" });
      }

      // Validate dates
      let startDate = null;
      if (validStartDate) {
        startDate = new Date(validStartDate);
        if (isNaN(startDate.getTime())) {
          return res.status(400).json({ message: "Invalid valid start date format" });
        }
      }
      let endDate = null;
      if (validEndDate) {
        endDate = new Date(validEndDate);
        if (isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "Invalid valid end date format" });
        }
      }
      if (startDate && endDate && endDate <= startDate) {
        return res.status(400).json({ message: "End date must be after start date" });
      }

      // Perform bulk update
      await db.transaction(async (trx) => {
        for (const docId of documentIds) {
          await trx.update(documents)
            .set({
              validStartDate: startDate,
              validEndDate: endDate,
            })
            .where(eq(documents.id, docId));
        }
      });

      // Log the bulk date update action for audit
      try {
        await storage.createAuditLog({
          userId,
          action: "bulk_update_dates",
          resourceType: "document",
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            documentIds: documentIds,
            validStartDate,
            validEndDate,
            count: documentIds.length,
          },
        });
      } catch (auditError) {
        console.error("Failed to create audit log for bulk date update:", auditError);
      }

      res.json({ success: true, message: "Document dates updated successfully" });
    } catch (error) {
      console.error("Error during bulk date update:", error);
      res.status(500).json({ message: "Failed to update document dates", error: error.message });
    }
  });

  // Bulk delete documents
  app.delete("/api/documents/bulk", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { documentIds } = req.body;

      if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ message: "No document IDs provided" });
      }

      // Fetch documents to get file paths before deletion
      const documentsToDelete = await db.query.documents.findMany({
        where: (doc, { eq, inL }) => eq(doc.userId, userId) && inL(doc.id, documentIds),
        columns: {
          id: true,
          filePath: true,
          name: true,
        },
      });

      if (documentsToDelete.length === 0) {
        return res.status(404).json({ message: "No documents found for deletion" });
      }

      // Delete physical files
      const deleteFilePromises = documentsToDelete.map(async (doc) => {
        if (doc.filePath) {
          try {
            await fs.unlink(doc.filePath);
            console.log(`Successfully deleted file for document ${doc.id}: ${doc.filePath}`);
          } catch (error) {
            console.error(`Error deleting file for document ${doc.id}:`, error);
            // Log and continue to database deletion
          }
        }
      });
      await Promise.all(deleteFilePromises);

      // Delete from database
      await db.transaction(async (trx) => {
        await trx.delete(documents)
          .where(
            (doc, { eq, inL }) => eq(doc.userId, userId) && inL(doc.id, documentIds)
          );
      });

      // Log the bulk deletion action for audit
      try {
        await storage.createAuditLog({
          userId,
          action: "bulk_delete",
          resourceType: "document",
          ipAddress: req.ip || req.connection.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          success: true,
          details: {
            documentIds: documentIds,
            count: documentIds.length,
            deletedFileCount: documentsToDelete.filter(d => d.filePath).length,
          },
        });
      } catch (auditError) {
        console.error("Failed to create audit log for bulk deletion:", auditError);
      }

      res.json({ success: true, message: "Documents deleted successfully" });
    } catch (error) {
      console.error("Error during bulk deletion:", error);
      res.status(500).json({ message: "Failed to perform bulk deletion", error: error.message });
    }
  });


  // Category statistics endpoint
  app.get("/api/stats/categories", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sql } = await import("drizzle-orm");

      const categoryStats = await db
        .select({
          category: documents.aiCategory,
          count: sql<number>`count(${documents.id})`,
        })
        .from(documents)
        .where(eq(documents.userId, userId))
        .groupBy(documents.aiCategory)
        .orderBy(sql`count(${documents.id}) desc`);

      res.json(categoryStats);
    } catch (error) {
      console.error("Error fetching category stats:", error);
      res.status(500).json({ message: "Failed to fetch category stats" });
    }
  });

  // Tag statistics endpoint
  app.get("/api/stats/tags", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Get all documents with their tags
      const documentsWithTags = await db
        .select({
          tags: documents.tags,
        })
        .from(documents)
        .where(eq(documents.userId, userId));

      // Count occurrences of each tag
      const tagCounts: { [key: string]: number } = {};

      documentsWithTags.forEach((doc) => {
        if (doc.tags && Array.isArray(doc.tags)) {
          doc.tags.forEach((tag: string) => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });

      // Convert to array and sort by count
      const tagStats = Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);

      res.json(tagStats);
    } catch (error) {
      console.error("Error fetching tag stats:", error);
      res.status(500).json({ message: "Failed to fetch tag stats" });
    }
  });

  // Document Demand Insights API
  app.get(
    "/api/analytics/document-demand",
    smartAuth,
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

  app.get(
    "/api/documents/:id/feedback",
    smartAuth,
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
}