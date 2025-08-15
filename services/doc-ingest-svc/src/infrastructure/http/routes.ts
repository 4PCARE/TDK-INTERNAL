import { Express } from 'express';
import multer from 'multer';
import type { Request, Response } from 'express';

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
  app.post('/documents', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { title, category, description } = req.body;

      // Basic document metadata
      const document = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: title || req.file.originalname,
        filename: req.file.originalname,
        filepath: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size,
        category: category || 'general',
        description: description || '',
        status: 'uploaded',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // TODO: Add to database and trigger processing pipeline
      console.log('Document uploaded:', document);

      // Emit DocumentUploaded event for further processing
      // TODO: Implement event emission to other services

      res.status(201).json({
        success: true,
        document: {
          id: document.id,
          title: document.title,
          status: document.status,
          createdAt: document.createdAt
        }
      });

    } catch (error) {
      console.error('Document upload error:', error);
      res.status(500).json({
        error: 'Document upload failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get document status
  app.get('/documents/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // TODO: Fetch from database
      const document = {
        id,
        title: 'Sample Document',
        status: 'processed',
        createdAt: new Date().toISOString(),
        processingSteps: [
          { step: 'uploaded', completedAt: new Date().toISOString() },
          { step: 'extracted', completedAt: new Date().toISOString() },
          { step: 'chunked', completedAt: new Date().toISOString() },
          { step: 'embedded', completedAt: new Date().toISOString() }
        ]
      };

      res.json(document);
    } catch (error) {
      console.error('Get document error:', error);
      res.status(500).json({ error: 'Failed to get document' });
    }
  });
}