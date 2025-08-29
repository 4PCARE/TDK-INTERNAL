import express from 'express';
import multer from 'multer';
import path from 'path';
import { sqliteService } from '../services/sqliteService.js';
import { isAuthenticated } from '../replitAuth.js';

const router = express.Router();

// Configure multer for Excel file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `excel_${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.includes('spreadsheet') || file.originalname.match(/\.(xlsx|xls)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'), false);
    }
  }
});

// Validate Excel file
router.post('/validate-excel', isAuthenticated, upload.single('excel'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file uploaded' });
    }

    const validation = await sqliteService.validateExcelFile(req.file.path);
    res.json(validation);
  } catch (error) {
    console.error('Excel validation error:', error);
    res.status(500).json({ error: 'Excel validation failed' });
  }
});

// Create SQLite database from Excel
router.post('/create-sqlite', isAuthenticated, upload.single('excel'), async (req, res) => {
  try {
    const { name, description, useExistingFile, existingFileId } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Database name is required' });
    }

    let excelFilePath: string;

    if (useExistingFile && existingFileId) {
      // Use existing file
      const userId = req.user.id;
      const { storage } = await import('../storage.js');
      const document = await storage.getDocument(parseInt(existingFileId), userId);
      
      if (!document) {
        return res.status(404).json({ error: 'Excel file not found' });
      }
      
      excelFilePath = document.filePath;
    } else {
      // Use uploaded file
      if (!req.file) {
        return res.status(400).json({ error: 'No Excel file uploaded' });
      }
      excelFilePath = req.file.path;
    }

    const result = await sqliteService.createSQLiteFromExcel({
      userId: req.user.id,
      name,
      description,
      excelFilePath,
      sanitizeColumnNames: true
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error('SQLite creation error:', error);
    res.status(500).json({ error: 'SQLite database creation failed' });
  }
});

// Validate existing Excel file
router.post('/validate-existing-excel/:fileId', isAuthenticated, async (req, res) => {
  try {
    const fileId = parseInt(req.params.fileId);
    const userId = req.user.claims.sub;
    const { storage } = await import('../storage.js');

    const document = await storage.getDocument(fileId, userId);

    if (!document) {
      return res.status(404).json({ error: 'Excel file not found' });
    }

    const validation = await sqliteService.validateExcelFile(document.filePath);
    res.json(validation);
  } catch (error) {
    console.error('Excel validation error:', error);
    res.status(500).json({ error: 'Excel validation failed' });
  }
});

// Get existing Excel files
router.get('/existing-excel', isAuthenticated, async (req, res) => {
  try {
    console.log('🔍 [existing-excel] Starting request for user:', req.user.id);
    const userId = req.user.id;
    const { storage } = await import('../storage.js');

    console.log('📦 [existing-excel] Storage imported successfully');
    console.log('🔧 [existing-excel] Available storage methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(storage)));

    // Check if the method exists
    if (typeof storage.getDocumentsByUserId !== 'function') {
      console.error('❌ [existing-excel] getDocumentsByUserId method not found');
      
      // Try alternative approach - get all documents and filter
      console.log('🔄 [existing-excel] Trying alternative approach...');
      const allDocuments = await storage.getDocuments(userId);
      console.log(`📄 [existing-excel] Found ${allDocuments.length} total documents`);
      
      // Filter for Excel files manually
      const excelFiles = allDocuments.filter(doc => {
        const isExcel = doc.fileName && (
          doc.fileName.toLowerCase().endsWith('.xlsx') || 
          doc.fileName.toLowerCase().endsWith('.xls')
        );
        const isMimeExcel = doc.mimeType && (
          doc.mimeType.includes('spreadsheet') ||
          doc.mimeType.includes('excel')
        );
        return isExcel || isMimeExcel;
      }).map(doc => ({
        id: doc.id,
        name: doc.name,
        filePath: doc.filePath,
        createdAt: doc.createdAt,
        size: doc.fileSize
      }));

      console.log(`📊 [existing-excel] Found ${excelFiles.length} Excel files`);
      return res.json(excelFiles);
    }

    // Try the original approach
    console.log('🎯 [existing-excel] Calling getDocumentsByUserId...');
    const documents = await storage.getDocumentsByUserId(userId, {
      type: 'excel',
      extensions: ['xlsx', 'xls']
    });

    console.log(`📊 [existing-excel] getDocumentsByUserId returned ${documents.length} documents`);

    const excelFiles = documents.map(doc => ({
      id: doc.id,
      name: doc.name,
      filePath: doc.filePath,
      createdAt: doc.createdAt,
      size: doc.fileSize
    }));

    console.log('✅ [existing-excel] Sending response with Excel files');
    res.json(excelFiles);
  } catch (error) {
    console.error('💥 [existing-excel] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Send proper JSON error response
    res.status(500).json({ 
      error: 'Failed to fetch Excel files',
      details: error.message
    });
  }
});

export { router as sqliteRoutes };