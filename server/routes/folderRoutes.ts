
import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";

export function registerFolderRoutes(app: Express) {
  // Get folders
  app.get("/api/folders", isAuthenticated, async (req: any, res) => {
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
  app.post("/api/folders", isAuthenticated, async (req: any, res) => {
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
  app.put("/api/folders/:id", isAuthenticated, async (req: any, res) => {
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
  app.delete("/api/folders/:id", isAuthenticated, async (req: any, res) => {
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
  app.post("/api/folders/:id/documents", isAuthenticated, async (req: any, res) => {
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
  app.post("/api/agents/:agentId/folders/:folderId", isAuthenticated, async (req: any, res) => {
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
  app.get("/api/folders/:id/documents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const folderId = req.params.id === 'null' ? null : parseInt(req.params.id);
      
      const documents = await storage.getDocumentsByFolder(userId, folderId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching folder documents:", error);
      res.status(500).json({ message: "Failed to fetch folder documents" });
    }
  });
}
