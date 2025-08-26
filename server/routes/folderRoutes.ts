import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import express from "express"; // Import express to use router
import db from "../db"; // Assuming db is imported from a db module

const router = express.Router(); // Create a router instance

export function registerFolderRoutes(app: Express) {
  // Get folders
  router.get("/", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parentId = req.query.parentId ? parseInt(req.query.parentId) : undefined;
      const folders = await storage.getFolders(userId, parentId);
      res.json(folders);
    } catch (error) {
      console.error("Error fetching folders:", error);
      res.status(500).json({ message: "Failed to fetch folders" });
    }
  });

  // Create folder
  router.post("/", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, parentId } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Folder name is required" });
      }

      const folder = await storage.createFolder(name, userId, parentId);
      res.status(201).json(folder);
    } catch (error) {
      console.error("Error creating folder:", error);
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  // Update folder
  router.put("/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const folderId = parseInt(req.params.id);
      const { name, parentId } = req.body;

      const folder = await storage.updateFolder(folderId, userId, { name, parentId });
      res.json(folder);
    } catch (error) {
      console.error("Error updating folder:", error);
      res.status(500).json({ message: "Failed to update folder" });
    }
  });

  // Delete folder
  router.delete("/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const folderId = parseInt(req.params.id);

      await storage.deleteFolder(folderId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting folder:", error);
      res.status(500).json({ message: "Failed to delete folder" });
    }
  });

  // Move documents to folder
  router.post("/:id/documents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const folderId = parseInt(req.params.id);
      const { documentIds } = req.body;

      if (!Array.isArray(documentIds)) {
        return res.status(400).json({ message: "documentIds must be an array" });
      }

      await storage.moveDocumentsToFolder(documentIds, folderId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error moving documents to folder:", error);
      res.status(500).json({ message: "Failed to move documents to folder" });
    }
  });

  // Assign entire folder to agent
  router.post("/agents/:agentId/folders/:folderId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const agentId = parseInt(req.params.agentId);
      const folderId = parseInt(req.params.folderId);

      await storage.assignFolderToAgent(agentId, folderId, userId);
      res.json({ success: true, message: "Folder assigned to agent successfully" });
    } catch (error) {
      console.error("Error assigning folder to agent:", error);
      res.status(500).json({ message: "Failed to assign folder to agent" });
    }
  });

  // Get documents in folder
  router.get("/:id/documents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const folderId = req.params.id === 'null' ? null : parseInt(req.params.id);
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const listView = req.query.listView === 'true';

      if (listView) {
        // If list view is toggled, return all documents without pagination
        const documents = await storage.getDocumentsByFolder(userId, folderId);
        res.json(documents);
      } else {
        // For grid view, apply pagination and filter by folderId
        let documents;
        if (folderId !== null) {
          documents = await storage.getDocumentsByFolderPaginated(userId, folderId, page, limit);
        } else {
          // If no folder is selected, get documents from the root (or all user's documents)
          // This assumes storage.getAllDocumentsPaginated exists or similar functionality
          documents = await storage.getAllDocumentsPaginated(userId, page, limit);
        }
        res.json(documents);
      }
    } catch (error) {
      console.error("Error fetching folder documents:", error);
      res.status(500).json({ message: "Failed to fetch folder documents" });
    }
  });

  // Get folder statistics (document count) for pagination
  router.get("/:id/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const folderId = parseInt(req.params.id);

      if (isNaN(folderId)) {
        return res.status(400).json({ error: "Invalid folder ID" });
      }

      const result = await db.query(
        "SELECT COUNT(*) as total FROM documents WHERE folder_id = $1 AND user_id = $2",
        [folderId, userId] // Use userId from authenticated user
      );

      res.json({ totalDocuments: parseInt(result.rows[0].total) });
    } catch (error) {
      console.error("Error fetching folder stats:", error);
      res.status(500).json({ error: "Failed to fetch folder statistics" });
    }
  });

  // Move documents to folder (bulk operation)
  router.post("/move-documents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { documentIds, folderId } = req.body;

      if (!Array.isArray(documentIds)) {
        return res.status(400).json({ message: "documentIds must be an array" });
      }

      await storage.moveDocumentsToFolder(documentIds, folderId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error moving documents:", error);
      res.status(500).json({ message: "Failed to move documents" });
    }
  });

  app.use("/api/folders", router); // Mount the router
}