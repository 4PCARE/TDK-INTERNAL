
import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { vectorService } from "../services/vectorService";
import { storage } from "../storage";

export function registerVectorRoutes(app: Express) {
  // Vectorize document
  app.post("/api/documents/:id/vectorize", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = parseInt(req.params.id);

      const document = await storage.getDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (!document.content) {
        return res.status(400).json({ message: "Document has no content to vectorize" });
      }

      await vectorService.addDocument(
        document.id.toString(),
        document.content,
        {
          userId,
          documentName: document.name,
          mimeType: document.mimeType,
          tags: document.tags || [],
          originalDocumentId: document.id.toString(),
        }
      );

      res.json({ success: true, message: "Document vectorized successfully" });
    } catch (error) {
      console.error("Error vectorizing document:", error);
      res.status(500).json({ message: "Failed to vectorize document" });
    }
  });

  // Vectorize all documents
  app.post("/api/documents/vectorize-all", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documents = await storage.getDocuments(userId);

      let processed = 0;
      let failed = 0;

      for (const document of documents) {
        try {
          if (document.content && document.content.trim().length > 0) {
            await vectorService.addDocument(
              document.id.toString(),
              document.content,
              {
                userId,
                documentName: document.name,
                mimeType: document.mimeType,
                tags: document.tags || [],
                originalDocumentId: document.id.toString(),
              }
            );
            processed++;
          }
        } catch (error) {
          console.error(`Failed to vectorize document ${document.id}:`, error);
          failed++;
        }
      }

      res.json({
        success: true,
        message: `Vectorization complete. Processed: ${processed}, Failed: ${failed}`,
        processed,
        failed,
      });
    } catch (error) {
      console.error("Error in bulk vectorization:", error);
      res.status(500).json({ message: "Failed to vectorize documents" });
    }
  });

  // Get vectorization status
  app.get("/api/vectorization/status", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const status = await vectorService.getVectorizationStatus(userId);
      res.json(status);
    } catch (error) {
      console.error("Error fetching vectorization status:", error);
      res.status(500).json({ message: "Failed to fetch vectorization status" });
    }
  });
}
