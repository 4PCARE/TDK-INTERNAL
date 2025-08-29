
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
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file uploaded' });
    }

    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Database name is required' });
    }

    const result = await sqliteService.createSQLiteFromExcel({
      userId: req.user.id,
      name,
      description,
      excelFilePath: req.file.path,
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

export default router;
