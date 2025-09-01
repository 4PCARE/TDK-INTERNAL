
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import csv from 'csv-parser';
import * as XLSX from 'xlsx';
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

  constructor() {
    this.ensureDbsDir();
  }

  private ensureDbsDir() {
    if (!fs.existsSync(this.dbsDir)) {
      fs.mkdirSync(this.dbsDir, { recursive: true });
    }
  }

  async getExistingExcelCsvFiles(userId: string): Promise<any[]> {
    // Get user's uploaded files that are Excel/CSV
    const documents = await storage.getDocuments(userId, { limit: null });
    
    return documents.filter(doc => {
      const ext = path.extname(doc.fileName || '').toLowerCase();
      return ['.xlsx', '.xls', '.csv'].includes(ext);
    }).map(doc => ({
      id: doc.id,
      name: doc.name,
      fileName: doc.fileName,
      filePath: doc.filePath,
      fileSize: doc.fileSize,
      createdAt: doc.createdAt,
      mimeType: doc.mimeType
    }));
  }

  async analyzeFileSchema(filePath: string): Promise<{ schema: TableSchema[], preview: any[], rowCount: number }> {
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.csv') {
      return this.analyzeCsvSchema(filePath);
    } else if (['.xlsx', '.xls'].includes(ext)) {
      return this.analyzeExcelSchema(filePath);
    }
    
    throw new Error('Unsupported file format');
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
