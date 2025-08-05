import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import axios from "axios";
import multer from "multer";
import fs from 'fs'; // Import fs module
import { upload } from "../services/fileUpload";

const PYTHON_BACKEND_URL = "http://0.0.0.0:8000";

export function registerPythonProxyRoutes(app: Express) {
  // Python backend health check
  app.get("/api/python/health", async (req, res) => {
    try {
      const response = await axios.get(`${PYTHON_BACKEND_URL}/health`);
      res.json(response.data);
    } catch (error) {
      console.error("Python backend health check failed:", error);
      res.status(503).json({ error: "Python backend unavailable" });
    }
  });

  // Python document upload service
  app.post("/api/python/documents/upload", smartAuth, upload.array("files", 10), async (req: any, res) => {
    try {
      const token = req.headers.authorization;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      console.log("Python upload proxy: Processing", files.length, "files");

      // Process first file only for now (Python backend expects single file)
      const file = files[0];
      
      // Create FormData for Python backend
      const formData = new FormData();
      const fileStream = fs.createReadStream(file.path);

      formData.append('file', fileStream, {
        filename: file.originalname,
        contentType: file.mimetype
      });

      // Add user ID to FormData
      const userId = req.user.claims.sub;
      formData.append('user_id', userId);

      console.log("Python upload proxy: Forwarding to Python backend...");

      const response = await axios.post(
        `${PYTHON_BACKEND_URL}/api/python/documents/upload`,
        formData,
        {
          headers: {
            'Authorization': token,
            ...formData.getHeaders()
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 30000
        }
      );

      console.log("Python upload proxy: Success, got response from Python backend");
      res.json(response.data);
    } catch (error) {
      console.error("Python upload proxy error:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("Python backend response:", error.response.data);
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({ error: "Upload failed via Python backend" });
      }
    }
  });

  // Python chat service
  app.post("/api/python/chat", smartAuth, async (req: any, res) => {
    try {
      const token = req.headers.authorization;

      const response = await axios.post(
        `${PYTHON_BACKEND_URL}/api/python/chat`,
        req.body,
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          }
        }
      );

      res.json(response.data);
    } catch (error) {
      console.error("Python chat proxy error:", error);
      res.status(500).json({ error: "Chat failed via Python backend" });
    }
  });

  // Python search service
  app.post("/api/python/search", smartAuth, async (req: any, res) => {
    try {
      const token = req.headers.authorization;

      const response = await axios.post(
        `${PYTHON_BACKEND_URL}/api/python/search`,
        req.body,
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          }
        }
      );

      res.json(response.data);
    } catch (error) {
      console.error("Python search proxy error:", error);
      res.status(500).json({ error: "Search failed via Python backend" });
    }
  });

  // Python documents list
  app.get("/api/python/documents", smartAuth, async (req: any, res) => {
    try {
      const token = req.headers.authorization;

      const response = await axios.get(
        `${PYTHON_BACKEND_URL}/api/python/documents`,
        {
          headers: {
            'Authorization': token
          }
        }
      );

      res.json(response.data);
    } catch (error) {
      console.error("Python documents proxy error:", error);
      res.status(500).json({ error: "Documents fetch failed via Python backend" });
    }
  });

  // Python document chat
  app.post("/api/python/documents/chat", smartAuth, async (req: any, res) => {
    try {
      const token = req.headers.authorization;

      const response = await axios.post(
        `${PYTHON_BACKEND_URL}/api/python/documents/chat`,
        req.body,
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          }
        }
      );

      res.json(response.data);
    } catch (error) {
      console.error("Python document chat proxy error:", error);
      res.status(500).json({ error: "Document chat failed via Python backend" });
    }
  });

  // Python stats
  app.get("/api/python/stats", smartAuth, async (req: any, res) => {
    try {
      const token = req.headers.authorization;

      const response = await axios.get(
        `${PYTHON_BACKEND_URL}/api/python/stats`,
        {
          headers: {
            'Authorization': token
          }
        }
      );

      res.json(response.data);
    } catch (error) {
      console.error("Python stats proxy error:", error);
      res.status(500).json({ error: "Stats fetch failed via Python backend" });
    }
  });
}