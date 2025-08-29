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
  // Ensure JSON response from the start
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const userId = req.user.claims?.sub || req.user.id;
    
    console.log(`🔍 [existing-excel] Request received for user: ${userId}`);
    console.log(`🔍 [existing-excel] User object:`, JSON.stringify(req.user, null, 2));
    
    if (!userId) {
      console.error('💥 [existing-excel] No user ID found in request');
      return res.status(401).json({ 
        error: 'User not authenticated',
        details: 'No user ID found in authentication token'
      });
    }
    
    console.log(`🔍 [existing-excel] Fetching Excel files for user: ${userId}`);

    const { storage } = await import('../storage.js');

    // Get documents with fallback approach
    let documents;
    
    if (typeof storage.getDocumentsByUserId === 'function') {
      try {
        console.log(`📋 [existing-excel] Using getDocumentsByUserId method`);
        documents = await storage.getDocumentsByUserId(userId, {
          type: 'excel',
          extensions: ['xlsx', 'xls']
        });
        console.log(`📋 [existing-excel] getDocumentsByUserId returned ${documents?.length || 0} documents`);
      } catch (error) {
        console.warn('💥 [existing-excel] getDocumentsByUserId failed, falling back to getDocuments:', error.message);
        // Fallback to getting all documents and filtering
        const allDocs = await storage.getDocuments(userId);
        console.log(`📋 [existing-excel] getDocuments returned ${allDocs?.length || 0} documents`);
        
        documents = allDocs.filter(doc => {
          const fileName = doc.fileName || doc.originalName || '';
          const mimeType = doc.mimeType || '';
          return fileName.toLowerCase().endsWith('.xlsx') || 
                 fileName.toLowerCase().endsWith('.xls') ||
                 mimeType.includes('spreadsheet') ||
                 mimeType.includes('excel');
        });
        console.log(`📋 [existing-excel] Filtered to ${documents?.length || 0} Excel files`);
      }
    } else {
      console.warn('💥 [existing-excel] getDocumentsByUserId method not found, using fallback');
      // Fallback to getting all documents and filtering
      const allDocs = await storage.getDocuments(userId);
      console.log(`📋 [existing-excel] getDocuments returned ${allDocs?.length || 0} documents`);
      
      documents = allDocs.filter(doc => {
        const fileName = doc.fileName || doc.originalName || '';
        const mimeType = doc.mimeType || '';
        return fileName.toLowerCase().endsWith('.xlsx') || 
               fileName.toLowerCase().endsWith('.xls') ||
               mimeType.includes('spreadsheet') ||
               mimeType.includes('excel');
      });
      console.log(`📋 [existing-excel] Filtered to ${documents?.length || 0} Excel files`);
    }

    console.log(`📊 [existing-excel] Found ${documents?.length || 0} Excel files`);

    const excelFiles = (documents || []).map(doc => ({
      id: doc.id,
      name: doc.name || doc.originalName || 'Unnamed Document',
      filePath: doc.filePath,
      createdAt: doc.createdAt,
      size: doc.fileSize
    }));

    console.log('✅ [existing-excel] Sending JSON response with Excel files:', excelFiles.length);
    
    return res.status(200).json(excelFiles);
    
  } catch (error) {
    console.error('💥 [existing-excel] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userId: req.user?.id,
      userObject: req.user
    });

    return res.status(500).json({ 
      error: 'Failed to fetch Excel files',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export { router as sqliteRoutes };