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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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
      cb(new Error(`File type ${file.mimetype} not supported`));
    }
  }
});

// Mock document database
const documents = new Map();

// Health check endpoint
router.get('/healthz', (req, res) => {
  res.json({ status: 'healthy', service: 'doc-ingest-svc' });
});

// Upload single document
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, description, category, tags, isPublic = false } = req.body;

    const document = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      filename: req.file.originalname,
      filepath: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
      title: title || req.file.originalname,
      description: description || '',
      category: category || 'general',
      tags: tags ? tags.split(',').map((tag: string) => tag.trim()) : [],
      isPublic: isPublic === 'true',
      uploadedAt: new Date(),
      status: 'processing',
      extractedText: null,
      chunks: [],
      embeddings: []
    };

    documents.set(document.id, document);

    // Simulate text extraction (in real implementation, this would be async)
    setTimeout(() => {
      const doc = documents.get(document.id);
      if (doc) {
        doc.status = 'processed';
        doc.extractedText = `Extracted text from ${doc.filename}`;
        doc.chunks = [`Chunk 1 from ${doc.filename}`, `Chunk 2 from ${doc.filename}`];
        documents.set(document.id, doc);
      }
    }, 2000);

    res.status(201).json({
      document: {
        id: document.id,
        filename: document.filename,
        title: document.title,
        description: document.description,
        category: document.category,
        tags: document.tags,
        isPublic: document.isPublic,
        uploadedAt: document.uploadedAt,
        status: document.status,
        size: document.size,
        mimetype: document.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Upload multiple documents
router.post('/upload/batch', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const files = req.files as Express.Multer.File[];
    const { category, isPublic = false } = req.body;

    const uploadedDocs = files.map(file => {
      const document = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        filename: file.originalname,
        filepath: file.path,
        mimetype: file.mimetype,
        size: file.size,
        title: file.originalname,
        description: '',
        category: category || 'general',
        tags: [],
        isPublic: isPublic === 'true',
        uploadedAt: new Date(),
        status: 'processing',
        extractedText: null,
        chunks: [],
        embeddings: []
      };

      documents.set(document.id, document);
      return document;
    });

    res.status(201).json({
      documents: uploadedDocs.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        title: doc.title,
        category: doc.category,
        uploadedAt: doc.uploadedAt,
        status: doc.status,
        size: doc.size,
        mimetype: doc.mimetype
      }))
    });
  } catch (error) {
    console.error('Batch upload error:', error);
    res.status(500).json({ error: 'Batch upload failed' });
  }
});

// Get document by ID
router.get('/documents/:id', (req, res) => {
  const { id } = req.params;
  const document = documents.get(id);

  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  res.json({ document });
});

// Get all documents with pagination
router.get('/documents', (req, res) => {
  const { page = 1, limit = 10, category, status } = req.query;
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  let docs = Array.from(documents.values());

  // Filter by category
  if (category) {
    docs = docs.filter(doc => doc.category === category);
  }

  // Filter by status
  if (status) {
    docs = docs.filter(doc => doc.status === status);
  }

  // Sort by upload date (newest first)
  docs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  // Paginate
  const startIndex = (pageNum - 1) * limitNum;
  const paginatedDocs = docs.slice(startIndex, startIndex + limitNum);

  res.json({
    documents: paginatedDocs.map(doc => ({
      id: doc.id,
      filename: doc.filename,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      tags: doc.tags,
      isPublic: doc.isPublic,
      uploadedAt: doc.uploadedAt,
      status: doc.status,
      size: doc.size,
      mimetype: doc.mimetype
    })),
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(docs.length / limitNum),
      totalItems: docs.length,
      itemsPerPage: limitNum
    }
  });
});

// Update document metadata
router.put('/documents/:id', (req, res) => {
  const { id } = req.params;
  const document = documents.get(id);

  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const { title, description, category, tags, isPublic } = req.body;

  if (title) document.title = title;
  if (description !== undefined) document.description = description;
  if (category) document.category = category;
  if (tags) document.tags = Array.isArray(tags) ? tags : tags.split(',').map((tag: string) => tag.trim());
  if (isPublic !== undefined) document.isPublic = isPublic;

  documents.set(id, document);

  res.json({
    document: {
      id: document.id,
      filename: document.filename,
      title: document.title,
      description: document.description,
      category: document.category,
      tags: document.tags,
      isPublic: document.isPublic,
      uploadedAt: document.uploadedAt,
      status: document.status,
      size: document.size,
      mimetype: document.mimetype
    }
  });
});

// Delete document
router.delete('/documents/:id', (req, res) => {
  const { id } = req.params;
  const document = documents.get(id);

  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Delete file from filesystem
  try {
    if (fs.existsSync(document.filepath)) {
      fs.unlinkSync(document.filepath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }

  documents.delete(id);

  res.json({ message: 'Document deleted successfully' });
});

// Get document processing status
router.get('/documents/:id/status', (req, res) => {
  const { id } = req.params;
  const document = documents.get(id);

  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  res.json({
    id: document.id,
    status: document.status,
    filename: document.filename,
    uploadedAt: document.uploadedAt,
    hasText: !!document.extractedText,
    chunkCount: document.chunks.length,
    embeddingCount: document.embeddings.length
  });
});

// Get document categories
router.get('/categories', (req, res) => {
  const categories = new Set();
  documents.forEach(doc => categories.add(doc.category));

  res.json({
    categories: Array.from(categories).sort()
  });
});

export { router };