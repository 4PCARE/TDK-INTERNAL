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
    // Set JSON headers immediately
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    
    // Simplified user ID extraction
    const userId = req.user?.id || req.user?.claims?.sub;
    
    console.log(`🔍 [existing-excel] Request received for user: ${userId}`);
    
    if (!userId) {
      console.error('💥 [existing-excel] No user ID found in request');
      return res.status(401).json({ 
        error: 'User not authenticated',
        details: 'No user ID found in authentication token'
      });
    }
    
    console.log(`🔍 [existing-excel] Fetching Excel files for user: ${userId}`);

    const { storage } = await import('../storage.js');

    // Always use the simple approach - get all documents and filter
    const allDocs = await storage.getDocuments(userId);
    console.log(`📋 [existing-excel] Retrieved ${allDocs?.length || 0} total documents`);
    
    const excelFiles = (allDocs || [])
      .filter(doc => {
        const fileName = (doc.fileName || '').toLowerCase();
        const mimeType = (doc.mimeType || '').toLowerCase();
        return fileName.endsWith('.xlsx') || 
               fileName.endsWith('.xls') ||
               mimeType.includes('spreadsheet') ||
               mimeType.includes('excel');
      })
      .map(doc => ({
        id: doc.id,
        name: doc.name || doc.fileName || 'Unnamed Document',
        filePath: doc.filePath,
        createdAt: doc.createdAt,
        size: doc.fileSize
      }));

    console.log(`📊 [existing-excel] Found ${excelFiles.length} Excel files`);
    console.log('✅ [existing-excel] Sending JSON response');
    
    res.status(200).json(excelFiles);
    
  } catch (error) {
    console.error('💥 [existing-excel] Error:', error.message);
    
    // Ensure we always send JSON even on error
    res.status(500).json({ 
      error: 'Failed to fetch Excel files',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export { router as sqliteRoutes };