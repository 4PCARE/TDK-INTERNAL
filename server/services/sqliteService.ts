
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import { storage } from '../storage';

export interface TableSchema {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: any;
}

export interface DatabaseInfo {
  id: string;
  name: string;
  description: string;
  filePath: string;
  tableName: string;
  schema: TableSchema[];
  rowCount: number;
  createdAt: Date;
  userId: string;
}

export interface SQLSnippet {
  question: string;
  sql: string;
  description?: string;
}

class SQLiteService {
  private dbsDir = path.join(process.cwd(), 'databases');
  private uploadsDir = path.join(process.cwd(), 'uploads', 'sqlite-temp');
  private directUploads = new Map<string, DirectUploadInfo>(); // In-memory registry

  constructor() {
    this.ensureDbsDir();
    this.ensureUploadsDir();
  }

  private ensureDbsDir() {
    if (!fs.existsSync(this.dbsDir)) {
      fs.mkdirSync(this.dbsDir, { recursive: true });
    }
  }

  private ensureUploadsDir() {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async registerDirectUpload(userId: string, fileInfo: {
    originalName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
  }): Promise<DirectUploadInfo> {
    const uploadId = `upload_${userId}_${Date.now()}`;
    const directUpload: DirectUploadInfo = {
      id: uploadId,
      userId,
      originalName: fileInfo.originalName,
      filePath: fileInfo.filePath,
      fileSize: fileInfo.fileSize,
      mimeType: fileInfo.mimeType,
      uploadedAt: new Date()
    };

    this.directUploads.set(uploadId, directUpload);
    console.log('📁 Registered direct upload:', uploadId, 'for file:', fileInfo.originalName);
    
    // Clean up old uploads (older than 1 hour)
    this.cleanupOldUploads();
    
    return directUpload;
  }

  async getDirectUpload(uploadId: string, userId: string): Promise<DirectUploadInfo | null> {
    const upload = this.directUploads.get(uploadId);
    if (!upload || upload.userId !== userId) {
      return null;
    }
    return upload;
  }

  private cleanupOldUploads() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [uploadId, upload] of this.directUploads.entries()) {
      if (upload.uploadedAt < oneHourAgo) {
        // Remove file if it exists
        if (fs.existsSync(upload.filePath)) {
          try {
            fs.unlinkSync(upload.filePath);
            console.log('🗑️ Cleaned up old upload file:', upload.originalName);
          } catch (error) {
            console.error('❌ Failed to cleanup old upload:', error);
          }
        }
        
        // Remove from registry
        this.directUploads.delete(uploadId);
        console.log('🗑️ Removed old upload from registry:', uploadId);
      }
    }
  }

  async getExistingExcelCsvFiles(userId: string): Promise<any[]> {
    // Get user's uploaded files that are Excel/CSV
    const documents = await storage.getDocuments(userId, { limit: null });
    
    const filteredDocs = documents.filter(doc => {
      const ext = path.extname(doc.fileName || '').toLowerCase();
      return ['.xlsx', '.xls', '.csv'].includes(ext);
    }).map(doc => {
      // Check if the file actually exists and log the result
      const fileExists = fs.existsSync(doc.filePath);
      console.log(`🔍 File ${doc.fileName}: exists=${fileExists}, path=${doc.filePath}`);
      
      return {
        id: doc.id,
        name: doc.name,
        fileName: doc.fileName,
        filePath: doc.filePath,
        fileSize: doc.fileSize,
        createdAt: doc.createdAt,
        mimeType: doc.mimeType,
        exists: fileExists
      };
    });
    
    console.log(`🔍 Found ${filteredDocs.length} Excel/CSV files for user ${userId}`);
    return filteredDocs;
  }

  async analyzeFileSchema(filePath: string): Promise<{ schema: TableSchema[], preview: any[], rowCount: number }> {
    const ext = path.extname(filePath).toLowerCase();
    
    try {
      if (ext === '.csv') {
        return this.analyzeCsvSchema(filePath);
      } else if (['.xlsx', '.xls'].includes(ext)) {
        return this.analyzeExcelSchema(filePath);
      }
      
      throw new Error('Unsupported file format');
    } catch (error) {
      // If analysis fails, try to diagnose and suggest cleanup
      const diagnostics = await this.diagnoseFileProblems(filePath);
      throw new Error(`Schema analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}. Issues detected: ${diagnostics.issues.join(', ')}`);
    }
  }

  async diagnoseFileProblems(filePath: string): Promise<{
    issues: string[];
    canCleanup: boolean;
    cleanupSuggestions: string[];
  }> {
    const ext = path.extname(filePath).toLowerCase();
    const issues: string[] = [];
    const cleanupSuggestions: string[] = [];

    try {
      if (ext === '.csv') {
        const diagnosis = await this.diagnoseCsvProblems(filePath);
        issues.push(...diagnosis.issues);
        cleanupSuggestions.push(...diagnosis.suggestions);
      } else if (['.xlsx', '.xls'].includes(ext)) {
        const diagnosis = await this.diagnoseExcelProblems(filePath);
        issues.push(...diagnosis.issues);
        cleanupSuggestions.push(...diagnosis.suggestions);
      }
    } catch (error) {
      issues.push('File format analysis failed');
    }

    return {
      issues,
      canCleanup: issues.length > 0,
      cleanupSuggestions
    };
  }

  private async diagnoseCsvProblems(filePath: string): Promise<{ issues: string[]; suggestions: string[] }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    return new Promise((resolve) => {
      const results: any[] = [];
      let lineCount = 0;
      let firstNonEmptyRow: any = null;
      let headerRow: any = null;

      fs.createReadStream(filePath)
        .pipe(csv({ skipEmptyLines: false }))
        .on('data', (data) => {
          lineCount++;
          if (Object.keys(data).length > 0 && !firstNonEmptyRow) {
            firstNonEmptyRow = data;
          }
          if (lineCount === 1) {
            headerRow = data;
          }
          if (results.length < 20) {
            results.push(data);
          }
        })
        .on('end', () => {
          // Check for missing or invalid headers
          if (!headerRow || Object.keys(headerRow).some(key => key.includes('Unnamed') || key.trim() === '')) {
            issues.push('Missing or invalid column headers');
            suggestions.push('Add proper column headers in the first row');
          }

          // Check for inconsistent column count
          const columnCounts = results.map(row => Object.keys(row).length);
          const uniqueCounts = [...new Set(columnCounts)];
          if (uniqueCounts.length > 1) {
            issues.push('Inconsistent number of columns across rows');
            suggestions.push('Ensure all rows have the same number of columns');
          }

          // Check for empty rows at the beginning
          if (results.length > 0 && Object.values(results[0]).every(val => !val || val.toString().trim() === '')) {
            issues.push('Empty rows at the beginning of file');
            suggestions.push('Remove empty rows from the start of the file');
          }

          resolve({ issues, suggestions });
        })
        .on('error', () => {
          issues.push('CSV parsing failed');
          suggestions.push('Check file encoding and format');
          resolve({ issues, suggestions });
        });
    });
  }

  private async diagnoseExcelProblems(filePath: string): Promise<{ issues: string[]; suggestions: string[] }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Check for merged cells
      if (worksheet['!merges'] && worksheet['!merges'].length > 0) {
        issues.push('Contains merged cells');
        suggestions.push('Unmerge all cells to ensure proper data structure');
      }

      // Convert to JSON to analyze data structure
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length === 0) {
        issues.push('No data found in Excel file');
        suggestions.push('Ensure the Excel file contains data');
        return { issues, suggestions };
      }

      // Check for empty rows at the beginning
      const firstRow = jsonData[0] as any[];
      if (firstRow && firstRow.every(cell => !cell || cell.toString().trim() === '')) {
        issues.push('Empty first row');
        suggestions.push('Remove empty rows from the beginning');
      }

      // Check for inconsistent data types in columns
      const dataRows = jsonData.slice(1) as any[][];
      if (dataRows.length > 0) {
        const columnCount = Math.max(...dataRows.map(row => row.length));
        
        for (let colIndex = 0; colIndex < columnCount; colIndex++) {
          const columnValues = dataRows.map(row => row[colIndex]).filter(v => v !== undefined && v !== null && v !== '');
          
          if (columnValues.length > 0) {
            const types = columnValues.map(v => typeof v);
            const uniqueTypes = [...new Set(types)];
            
            if (uniqueTypes.length > 2) { // Allow for some type variation
              issues.push(`Column ${colIndex + 1} has mixed data types`);
              suggestions.push(`Standardize data types in column ${colIndex + 1}`);
            }
          }
        }
      }

      // Check for formula cells
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      let hasFormulas = false;
      
      for (let row = range.s.r; row <= range.e.r && !hasFormulas; row++) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[cellAddress];
          if (cell && cell.f) {
            hasFormulas = true;
            break;
          }
        }
      }

      if (hasFormulas) {
        issues.push('Contains formula cells');
        suggestions.push('Convert formulas to values before importing');
      }

    } catch (error) {
      issues.push('Excel file analysis failed');
      suggestions.push('Check if the Excel file is corrupted or password protected');
    }

    return { issues, suggestions };
  }

  async createCleanedFile(filePath: string, userId: string): Promise<{ 
    cleanedFilePath: string; 
    originalIssues: string[]; 
    fixesApplied: string[] 
  }> {
    const ext = path.extname(filePath).toLowerCase();
    const originalName = path.basename(filePath, ext);
    const cleanedFileName = `${originalName}_cleaned${ext}`;
    const cleanedFilePath = path.join(path.dirname(filePath), cleanedFileName);

    const fixesApplied: string[] = [];
    const diagnosis = await this.diagnoseFileProblems(filePath);

    if (ext === '.csv') {
      await this.cleanCsvFile(filePath, cleanedFilePath, fixesApplied);
    } else if (['.xlsx', '.xls'].includes(ext)) {
      await this.cleanExcelFile(filePath, cleanedFilePath, fixesApplied);
    }

    return {
      cleanedFilePath,
      originalIssues: diagnosis.issues,
      fixesApplied
    };
  }

  private async cleanCsvFile(inputPath: string, outputPath: string, fixesApplied: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanedRows: any[] = [];
      let isFirstRow = true;
      let headers: string[] = [];

      fs.createReadStream(inputPath)
        .pipe(csv({ skipEmptyLines: true }))
        .on('data', (data) => {
          if (isFirstRow) {
            // Clean and fix headers
            const originalHeaders = Object.keys(data);
            headers = originalHeaders.map((header, index) => {
              let cleanHeader = header.trim();
              
              // Fix unnamed headers
              if (!cleanHeader || cleanHeader.includes('Unnamed') || cleanHeader.startsWith('__EMPTY')) {
                cleanHeader = `Column_${index + 1}`;
                fixesApplied.push(`Fixed unnamed header at position ${index + 1}`);
              }
              
              // Sanitize header names
              cleanHeader = cleanHeader.replace(/[^a-zA-Z0-9_]/g, '_');
              
              return cleanHeader;
            });
            
            isFirstRow = false;
          }

          // Skip completely empty rows
          const hasData = Object.values(data).some(value => value && value.toString().trim() !== '');
          if (hasData) {
            // Create cleaned row with proper headers
            const cleanedRow: any = {};
            headers.forEach((header, index) => {
              const originalKey = Object.keys(data)[index];
              cleanedRow[header] = data[originalKey] || '';
            });
            cleanedRows.push(cleanedRow);
          } else {
            fixesApplied.push('Removed empty row');
          }
        })
        .on('end', () => {
          // Write cleaned CSV
          if (cleanedRows.length > 0) {
            const csvWriter = require('csv-writer').createObjectCsvWriter({
              path: outputPath,
              header: headers.map(h => ({ id: h, title: h }))
            });

            csvWriter.writeRecords(cleanedRows)
              .then(() => {
                fixesApplied.push(`Created cleaned file with ${cleanedRows.length} rows`);
                resolve();
              })
              .catch(reject);
          } else {
            reject(new Error('No valid data found after cleanup'));
          }
        })
        .on('error', reject);
    });
  }

  private async cleanExcelFile(inputPath: string, outputPath: string, fixesApplied: string[]): Promise<void> {
    const workbook = XLSX.readFile(inputPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Remove merged cells
    if (worksheet['!merges']) {
      delete worksheet['!merges'];
      fixesApplied.push('Removed merged cells');
    }

    // Convert to array format for easier manipulation
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
    
    if (data.length === 0) {
      throw new Error('No data found in Excel file');
    }

    // Find the first row with actual data (skip empty rows)
    let dataStartRow = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i].some(cell => cell && cell.toString().trim() !== '')) {
        dataStartRow = i;
        break;
      }
    }

    if (dataStartRow > 0) {
      fixesApplied.push(`Removed ${dataStartRow} empty rows from the beginning`);
    }

    // Clean the data
    const cleanedData = data.slice(dataStartRow);
    
    // Fix headers (first row)
    if (cleanedData.length > 0) {
      const headers = cleanedData[0].map((header: any, index: number) => {
        let cleanHeader = header ? header.toString().trim() : '';
        
        if (!cleanHeader) {
          cleanHeader = `Column_${index + 1}`;
          fixesApplied.push(`Added header for column ${index + 1}`);
        }
        
        // Sanitize header names
        return cleanHeader.replace(/[^a-zA-Z0-9_\s]/g, '_');
      });
      
      cleanedData[0] = headers;
    }

    // Ensure consistent column count
    const maxColumns = Math.max(...cleanedData.map(row => row.length));
    const normalizedData = cleanedData.map(row => {
      const normalizedRow = [...row];
      while (normalizedRow.length < maxColumns) {
        normalizedRow.push('');
      }
      return normalizedRow;
    });

    if (normalizedData.some((row, index) => row.length !== data[dataStartRow + index]?.length)) {
      fixesApplied.push('Normalized column count across all rows');
    }

    // Create new workbook with cleaned data
    const newWorksheet = XLSX.utils.aoa_to_sheet(normalizedData);
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'CleanedData');
    
    // Write cleaned file
    XLSX.writeFile(newWorkbook, outputPath);
    fixesApplied.push(`Created cleaned Excel file with ${normalizedData.length} rows and ${maxColumns} columns`);
  }

  private async analyzeCsvSchema(filePath: string): Promise<{ schema: TableSchema[], preview: any[], rowCount: number }> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      const stream = fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          if (results.length < 100) { // Preview first 100 rows
            results.push(data);
          }
        })
        .on('end', () => {
          if (results.length === 0) {
            reject(new Error('No data found in CSV file'));
            return;
          }

          const schema = this.inferSchema(results);
          resolve({
            schema,
            preview: results.slice(0, 10), // First 10 rows for preview
            rowCount: results.length
          });
        })
        .on('error', reject);
    });
  }

  private async analyzeExcelSchema(filePath: string): Promise<{ schema: TableSchema[], preview: any[], rowCount: number }> {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    if (jsonData.length === 0) {
      throw new Error('No data found in Excel file');
    }

    const schema = this.inferSchema(jsonData);
    
    return {
      schema,
      preview: jsonData.slice(0, 10),
      rowCount: jsonData.length
    };
  }

  private inferSchema(data: any[]): TableSchema[] {
    if (data.length === 0) return [];
    
    const firstRow = data[0];
    const schema: TableSchema[] = [];
    
    for (const [key, value] of Object.entries(firstRow)) {
      const columnData = data.map(row => row[key]).filter(val => val !== null && val !== undefined && val !== '');
      
      let type = 'TEXT';
      
      if (columnData.length > 0) {
        // Check if all values are numbers
        const numericValues = columnData.filter(val => !isNaN(Number(val)));
        if (numericValues.length === columnData.length) {
          // Check if all are integers
          const integerValues = numericValues.filter(val => Number.isInteger(Number(val)));
          type = integerValues.length === numericValues.length ? 'INTEGER' : 'REAL';
        }
        // Check for dates
        else if (columnData.some(val => !isNaN(Date.parse(val)))) {
          type = 'TEXT'; // Store dates as text in SQLite for simplicity
        }
      }
      
      schema.push({
        name: this.sanitizeColumnName(key),
        type,
        nullable: columnData.length < data.length
      });
    }
    
    return schema;
  }

  private sanitizeColumnName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  }

  async createDatabaseFromFile(
    filePath: string,
    dbName: string,
    tableName: string,
    description: string,
    userId: string,
    snippets: SQLSnippet[] = []
  ): Promise<DatabaseInfo> {
    const dbId = `${userId}_${Date.now()}`;
    const dbPath = path.join(this.dbsDir, `${dbId}.db`);
    
    // Analyze file
    const { schema, rowCount } = await this.analyzeFileSchema(filePath);
    
    // Create SQLite database
    const db = new Database(dbPath);
    
    try {
      // Create table
      const createTableSQL = this.generateCreateTableSQL(tableName, schema);
      db.exec(createTableSQL);
      
      // Insert data
      await this.insertDataFromFile(db, filePath, tableName, schema);
      
      // Create database info record
      const dbInfo: DatabaseInfo = {
        id: dbId,
        name: dbName,
        description,
        filePath: dbPath,
        tableName,
        schema,
        rowCount,
        createdAt: new Date(),
        userId
      };
      
      // Store database connection in existing system
      const connectionData = {
        name: dbName,
        description,
        type: 'database' as const,
        dbType: 'sqlite',
        host: 'localhost',
        port: 0,
        database: dbPath,
        username: '',
        password: '',
        isActive: true,
        userId
      };
      
      const connection = await storage.createDataConnection(connectionData);
      
      // Store SQL snippets if provided
      for (const snippet of snippets) {
        await storage.createSQLSnippet({
          name: snippet.question,
          sql: snippet.sql,
          description: snippet.description || '',
          connectionId: connection.id,
          userId
        });
      }
      
      db.close();
      
      return dbInfo;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  private generateCreateTableSQL(tableName: string, schema: TableSchema[]): string {
    const columns = schema.map(col => {
      let columnDef = `"${col.name}" ${col.type}`;
      if (!col.nullable) {
        columnDef += ' NOT NULL';
      }
      return columnDef;
    }).join(', ');
    
    return `CREATE TABLE "${tableName}" (${columns})`;
  }

  private async insertDataFromFile(db: Database, filePath: string, tableName: string, schema: TableSchema[]) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.csv') {
      await this.insertCsvData(db, filePath, tableName, schema);
    } else if (['.xlsx', '.xls'].includes(ext)) {
      await this.insertExcelData(db, filePath, tableName, schema);
    }
  }

  private async insertCsvData(db: Database, filePath: string, tableName: string, schema: TableSchema[]) {
    return new Promise<void>((resolve, reject) => {
      const results: any[] = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          try {
            const placeholders = schema.map(() => '?').join(', ');
            const insertSQL = `INSERT INTO "${tableName}" VALUES (${placeholders})`;
            const stmt = db.prepare(insertSQL);
            
            const insertMany = db.transaction((rows: any[]) => {
              for (const row of rows) {
                const values = schema.map(col => {
                  const value = row[Object.keys(row).find(k => this.sanitizeColumnName(k) === col.name) || ''];
                  return this.convertValue(value, col.type);
                });
                stmt.run(values);
              }
            });
            
            insertMany(results);
            resolve();
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  private async insertExcelData(db: Database, filePath: string, tableName: string, schema: TableSchema[]) {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    const placeholders = schema.map(() => '?').join(', ');
    const insertSQL = `INSERT INTO "${tableName}" VALUES (${placeholders})`;
    const stmt = db.prepare(insertSQL);
    
    const insertMany = db.transaction((rows: any[]) => {
      for (const row of rows) {
        const values = schema.map(col => {
          const value = row[Object.keys(row).find(k => this.sanitizeColumnName(k) === col.name) || ''];
          return this.convertValue(value, col.type);
        });
        stmt.run(values);
      }
    });
    
    insertMany(jsonData);
  }

  private convertValue(value: any, type: string): any {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    
    switch (type) {
      case 'INTEGER':
        return parseInt(value, 10);
      case 'REAL':
        return parseFloat(value);
      default:
        return String(value);
    }
  }

  async executeQuery(dbPath: string, sql: string): Promise<{ data: any[], columns: string[] }> {
    const db = new Database(dbPath, { readonly: true });
    
    try {
      const stmt = db.prepare(sql);
      const rows = stmt.all();
      
      let columns: string[] = [];
      if (rows.length > 0) {
        columns = Object.keys(rows[0]);
      }
      
      return { data: rows, columns };
    } finally {
      db.close();
    }
  }
}

export const sqliteService = new SQLiteService();

// Interface for direct uploads (SQLite-specific, not full documents)
export interface DirectUploadInfo {
  id: string;
  userId: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
}
