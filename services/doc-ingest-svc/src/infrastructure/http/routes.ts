
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'files-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});

// Mock document database
const documents = new Map();

router.get('/healthz', (req, res) => {
  res.json({ status: 'healthy', service: 'doc-ingest-svc' });
});

// Upload document endpoint
router.post('/documents', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, description, category } = req.body;
    const userId = req.headers['x-user-id'] || 'anonymous';

    // Create document record
    const documentId = Date.now().toString();
    const document = {
      id: documentId,
      name: title || req.file.originalname,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      filePath: req.file.path,
      description: description || '',
      category: category || 'uncategorized',
      userId,
      uploadedAt: new Date().toISOString(),
      status: 'uploaded',
      processingStatus: 'pending'
    };

    documents.set(documentId, document);

    console.log(`📄 Document uploaded: ${document.name} (${document.fileSize} bytes)`);

    // In a real implementation, we would trigger processing here
    // For now, we'll just mark it as processed after a delay
    setTimeout(() => {
      const doc = documents.get(documentId);
      if (doc) {
        doc.processingStatus = 'completed';
        doc.processedAt = new Date().toISOString();
        console.log(`✅ Document processed: ${doc.name}`);
      }
    }, 2000);

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: document.id,
        name: document.name,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        status: document.status,
        processingStatus: document.processingStatus
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

// Get document status
router.get('/documents/:id', (req, res) => {
  const { id } = req.params;
  const document = documents.get(id);
  
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  res.json({
    id: document.id,
    name: document.name,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    status: document.status,
    processingStatus: document.processingStatus,
    uploadedAt: document.uploadedAt,
    processedAt: document.processedAt
  });
});

// List documents for user
router.get('/documents', (req, res) => {
  const userId = req.headers['x-user-id'] || 'anonymous';
  const userDocuments = Array.from(documents.values())
    .filter(doc => doc.userId === userId)
    .map(doc => ({
      id: doc.id,
      name: doc.name,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      status: doc.status,
      processingStatus: doc.processingStatus,
      uploadedAt: doc.uploadedAt,
      processedAt: doc.processedAt
    }));

  res.json({
    documents: userDocuments,
    total: userDocuments.length
  });
});

export { router };
