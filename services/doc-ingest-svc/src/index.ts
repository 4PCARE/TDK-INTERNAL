
import express from 'express';
import multer from 'multer';
import path from 'path';

const upload = multer({ dest: 'uploads/' });

export function createApp() {
  const app = express();
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/healthz', (req, res) => {
    res.json({ status: 'healthy', service: 'doc-ingest-svc' });
  });

  // Document upload endpoint
  app.post('/documents', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({ 
      success: true, 
      filename: req.file.filename,
      originalName: req.file.originalname
    });
  });

  return app;
}
