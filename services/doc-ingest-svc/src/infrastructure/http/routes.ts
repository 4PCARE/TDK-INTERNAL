import { Express } from 'express';
import multer from 'multer';
import { UploadController } from './controllers/UploadController.js';

// Configure multer for file uploads
const upload = multer({
  dest: './uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept common document types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  }
});

/**
 * Register routes for Document Ingestion Service
 */
export function registerRoutes(app: Express): void {
  const uploadController = new UploadController();
  // Health check endpoints
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'doc-ingest-svc' });
  });

  app.get('/readyz', (_req, res) => {
    res.status(200).json({
      status: 'ready',
      service: 'doc-ingest-svc',
      timestamp: new Date().toISOString()
    });
  });

  // Document upload endpoint
  app.post('/documents', upload.single('file'), (req, res) => {
    uploadController.uploadDocument(req, res);
  });

  // Get document status
  app.get('/documents/:id', (req, res) => {
    uploadController.getDocumentStatus(req, res);
  });
}