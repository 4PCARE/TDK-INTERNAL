
import sqlite3 from 'sqlite3';
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs/promises';
import { storage } from '../storage';

export interface ExcelValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sheets: Array<{
    name: string;
    rowCount: number;
    columnCount: number;
    hasHeaders: boolean;
    columns: string[];
  }>;
}

export interface SQLiteCreationOptions {
  userId: string;
  name: string;
  description?: string;
  excelFilePath: string;
  selectedSheets?: string[];
  sanitizeColumnNames?: boolean;
}

export class SQLiteService {
  private ensureUploadsDir = async () => {
    const uploadsDir = path.join(process.cwd(), "uploads");
    try {
      await fs.access(uploadsDir);
    } catch {
      await fs.mkdir(uploadsDir, { recursive: true });
    }
    return uploadsDir;
  };

  async validateExcelFile(filePath: string): Promise<ExcelValidationResult> {
    const result: ExcelValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      sheets: []
    };

    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        result.errors.push("Excel file contains no sheets");
        result.isValid = false;
        return result;
      }

      // Analyze each sheet
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length === 0) {
          result.warnings.push(`Sheet '${sheetName}' is empty`);
          continue;
        }

        const firstRow = jsonData[0] as any[];
        const hasHeaders = firstRow && firstRow.every(cell => 
          typeof cell === 'string' && cell.trim().length > 0
        );

        // Extract column names
        let columns: string[] = [];
        if (hasHeaders) {
          columns = firstRow.map((cell, index) => 
            this.sanitizeColumnName(cell?.toString() || `Column_${index + 1}`)
          );
        } else {
          columns = firstRow.map((_, index) => `Column_${index + 1}`);
        }

        // Check for duplicate column names
        const duplicates = columns.filter((item, index) => columns.indexOf(item) !== index);
        if (duplicates.length > 0) {
          result.warnings.push(`Sheet '${sheetName}' has duplicate column names: ${duplicates.join(', ')}`);
        }

        // Check for problematic content
        const hasEmptyRows = jsonData.some((row: any[]) => 
          !row || row.every(cell => !cell || cell.toString().trim() === '')
        );
        
        if (hasEmptyRows) {
          result.warnings.push(`Sheet '${sheetName}' contains empty rows`);
        }

        result.sheets.push({
          name: sheetName,
          rowCount: jsonData.length,
          columnCount: firstRow.length,
          hasHeaders,
          columns
        });
      }

      // Global validations
      if (result.sheets.every(sheet => sheet.rowCount <= 1)) {
        result.errors.push("No sheets contain data rows");
        result.isValid = false;
      }

    } catch (error) {
      result.errors.push(`Failed to read Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.isValid = false;
    }

    return result;
  }

  async createSQLiteFromExcel(options: SQLiteCreationOptions): Promise<{ 
    success: boolean; 
    sqliteFilePath?: string; 
    connectionId?: number;
    error?: string; 
  }> {
    try {
      // Validate Excel file first
      const validation = await this.validateExcelFile(options.excelFilePath);
      if (!validation.isValid) {
        return { success: false, error: `Excel validation failed: ${validation.errors.join(', ')}` };
      }

      // Create SQLite database file
      const uploadsDir = await this.ensureUploadsDir();
      const sqliteFileName = `${options.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.db`;
      const sqliteFilePath = path.join(uploadsDir, sqliteFileName);

      // Read Excel file
      const workbook = XLSX.readFile(options.excelFilePath);
      const sheetsToProcess = options.selectedSheets || workbook.SheetNames;

      // Create SQLite database
      const db = new sqlite3.Database(sqliteFilePath);

      await new Promise<void>((resolve, reject) => {
        db.serialize(() => {
          try {
            for (const sheetName of sheetsToProcess) {
              if (!workbook.Sheets[sheetName]) continue;

              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
              
              if (jsonData.length === 0) continue;

              // Create table
              const tableName = this.sanitizeTableName(sheetName);
              const firstRow = jsonData[0] as any[];
              const hasHeaders = validation.sheets.find(s => s.name === sheetName)?.hasHeaders || false;
              
              let columns: string[];
              let dataRows: any[][];

              if (hasHeaders) {
                columns = firstRow.map((cell, index) => 
                  this.sanitizeColumnName(cell?.toString() || `Column_${index + 1}`)
                );
                dataRows = jsonData.slice(1) as any[][];
              } else {
                columns = firstRow.map((_, index) => `Column_${index + 1}`);
                dataRows = jsonData as any[][];
              }

              // Create table schema - use TEXT for simplicity and flexibility
              const columnDefs = columns.map(col => `"${col}" TEXT`).join(', ');
              const createTableSQL = `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnDefs})`;
              
              db.run(createTableSQL);

              // Insert data
              if (dataRows.length > 0) {
                const placeholders = columns.map(() => '?').join(', ');
                const insertSQL = `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
                
                const stmt = db.prepare(insertSQL);
                dataRows.forEach(row => {
                  const values = columns.map((_, index) => {
                    const value = row[index];
                    return value !== undefined && value !== null ? value.toString() : '';
                  });
                  stmt.run(values);
                });
                stmt.finalize();
              }
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });

      // Close database connection
      await new Promise<void>((resolve, reject) => {
        db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Save connection to database
      const connectionData = {
        userId: options.userId,
        name: options.name,
        description: options.description,
        type: 'database' as const,
        dbType: 'sqlite' as const,
        filePath: sqliteFilePath,
        originalExcelPath: options.excelFilePath,
        isActive: true,
        testStatus: 'success' as const,
        lastTested: new Date()
      };

      const connection = await storage.createDataConnection(connectionData);

      return { 
        success: true, 
        sqliteFilePath, 
        connectionId: connection.id 
      };

    } catch (error) {
      console.error('SQLite creation error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private sanitizeTableName(name: string): string {
    // Remove special characters and replace spaces with underscores
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
  }

  private sanitizeColumnName(name: string): string {
    // Remove special characters and replace spaces with underscores
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
    
    // Handle SQLite reserved keywords
    const reservedKeywords = ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'TABLE', 'INDEX'];
    if (reservedKeywords.includes(sanitized.toUpperCase())) {
      sanitized = `_${sanitized}`;
    }
    
    return sanitized;
  }

  async getSQLiteSchema(filePath: string): Promise<{
    success: boolean;
    schema?: Array<{
      tableName: string;
      columns: Array<{
        name: string;
        type: string;
      }>;
    }>;
    error?: string;
  }> {
    try {
      const db = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY);
      
      const schema = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `, (err, tables) => {
          if (err) {
            reject(err);
            return;
          }
          
          Promise.all(
            tables.map((table: any) => 
              new Promise((resolveTable, rejectTable) => {
                db.all(`PRAGMA table_info(${table.name})`, (err, columns) => {
                  if (err) {
                    rejectTable(err);
                    return;
                  }
                  resolveTable({
                    tableName: table.name,
                    columns: columns.map((col: any) => ({
                      name: col.name,
                      type: col.type || 'TEXT'
                    }))
                  });
                });
              })
            )
          ).then(resolve).catch(reject);
        });
      });

      db.close();
      
      return { success: true, schema };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

export const sqliteService = new SQLiteService();
