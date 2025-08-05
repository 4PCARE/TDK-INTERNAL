
import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import axios from "axios";
import multer from "multer";

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

  // Python document processing with multer middleware
  const upload = multer({ storage: multer.memoryStorage() });
  
  app.post("/api/python/documents/upload", smartAuth, upload.single('file'), async (req: any, res) => {
    try {
      const token = req.headers.authorization;
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Handle file upload forwarding using form-data
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      
      // Properly append the file buffer with correct options
      formData.append('file', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
        knownLength: req.file.size
      });

      const response = await axios.post(
        `${PYTHON_BACKEND_URL}/api/python/documents/upload`,
        formData,
        {
          headers: {
            'Authorization': token,
            ...formData.getHeaders()
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      res.json(response.data);
    } catch (error) {
      console.error("Python upload proxy error:", error);
      if (error.response) {
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
