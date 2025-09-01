import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import { storage } from '../storage';

export interface QueryResult {
  success: boolean;
  data?: any[];
  columns?: string[];
  error?: string;
  rowCount?: number;
  executionTime?: number;
}

export interface DatabaseSchema {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      default?: string;
    }>;
  }>;
}

export class DatabaseQueryService {
  private connections: Map<number, any> = new Map();

  async executeQuery(connectionId: number, userId: string, query: string): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      // Get connection details from storage
      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection || (connection.type !== 'database' && connection.type !== 'sqlite')) {
        return { success: false, error: 'Database connection not found or invalid type' };
      }

      // Execute query based on database type
      switch (connection.dbType) {
        case 'postgresql':
          return await this.executePostgreSQLQuery(connection, query, startTime);
        case 'mysql':
          return await this.executeMySQLQuery(connection, query, startTime);
        case 'sqlite':
          return await this.executeSQLiteQuery(connection, query, startTime);
        default:
          return {
            success: false,
            error: `Unsupported database type: ${connection.dbType}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        executionTime: Date.now() - startTime
      };
    }
  }

  private async executePostgreSQLQuery(connection: any, query: string, startTime: number): Promise<QueryResult> {
    const pool = new PgPool({
      host: connection.host,
      port: connection.port || 5432,
      database: connection.database,
      user: connection.username,
      password: connection.password,
      max: 5,
      connectionTimeoutMillis: 10000,
    });

    try {
      const client = await pool.connect();
      const result = await client.query(query);
      client.release();

      // Extract column names
      const columns = result.fields ? result.fields.map(field => field.name) : [];

      return {
        success: true,
        data: result.rows,
        columns,
        rowCount: result.rowCount || 0,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      throw error;
    } finally {
      await pool.end();
    }
  }

  private async executeMySQLQuery(connection: any, query: string, startTime: number): Promise<QueryResult> {
    const mysqlConnection = await mysql.createConnection({
      host: connection.host,
      port: connection.port || 3306,
      user: connection.username,
      password: connection.password,
      database: connection.database,
      connectTimeout: 10000,
    });

    try {
      const [rows, fields] = await mysqlConnection.execute(query);

      // Extract column names
      const columns = Array.isArray(fields) ? fields.map((field: any) => field.name) : [];

      return {
        success: true,
        data: Array.isArray(rows) ? rows : [],
        columns,
        rowCount: Array.isArray(rows) ? rows.length : 0,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      throw error;
    } finally {
      await mysqlConnection.end();
    }
  }

  async getDatabaseSchema(connectionId: number, userId: string): Promise<DatabaseSchema | null> {
    try {
      console.log(`🔍 Getting database schema for connection ${connectionId}, user ${userId}`);

      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection) {
        console.error(`❌ Database connection ${connectionId} not found for user ${userId}`);
        return null;
      }

      if (connection.type !== 'database' && connection.type !== 'sqlite') {
        console.error(`❌ Connection ${connectionId} is not a database type: ${connection.type}`);
        return null;
      }

      console.log(`📊 Database connection found: ${connection.dbType} at ${connection.host}:${connection.port}`);

      switch (connection.dbType || connection.type) {
        case 'postgresql':
          return await this.getPostgreSQLSchema(connection);
        case 'mysql':
          return await this.getMySQLSchema(connection);
        case 'sqlite':
          return await this.getSQLiteSchema(connection);
        default:
          console.error(`❌ Unsupported database type: ${connection.dbType || connection.type}`);
          return null;
      }
    } catch (error) {
      console.error('❌ Error getting database schema:', error);
      console.error('Stack trace:', error instanceof Error ? error.stack : 'Unknown error');
      return null;
    }
  }

  private async getPostgreSQLSchema(connection: any): Promise<DatabaseSchema> {
    console.log(`🐘 Connecting to PostgreSQL: ${connection.host}:${connection.port}/${connection.database}`);

    const pool = new PgPool({
      host: connection.host,
      port: connection.port || 5432,
      database: connection.database,
      user: connection.username,
      password: connection.password,
      max: 1,
      connectionTimeoutMillis: 10000,
    });

    try {
      const client = await pool.connect();
      console.log(`✅ Connected to PostgreSQL successfully`);

      // Get tables
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      console.log(`📋 Found ${tablesResult.rows.length} tables in PostgreSQL database`);
      const tables = [];

      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.table_name;

        // Get columns for each table
        const columnsResult = await client.query(`
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = $1
          ORDER BY ordinal_position
        `, [tableName]);

        const columns = columnsResult.rows.map(col => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES',
          default: col.column_default
        }));

        tables.push({
          name: tableName,
          columns
        });

        console.log(`📋 Table ${tableName}: ${columns.length} columns`);
      }

      client.release();
      console.log(`✅ PostgreSQL schema retrieved successfully`);
      return { tables };
    } catch (error) {
      console.error(`❌ PostgreSQL schema error:`, error);
      throw error;
    } finally {
      await pool.end();
    }
  }

  private async getMySQLSchema(connection: any): Promise<DatabaseSchema> {
    console.log(`🐬 Connecting to MySQL: ${connection.host}:${connection.port}/${connection.database}`);

    const mysqlConnection = await mysql.createConnection({
      host: connection.host,
      port: connection.port || 3306,
      user: connection.username,
      password: connection.password,
      database: connection.database,
      connectTimeout: 10000,
    });

    try {
      console.log(`✅ Connected to MySQL successfully`);

      // Get tables
      const [tablesResult] = await mysqlConnection.execute('SHOW TABLES');
      console.log(`📋 Found ${(tablesResult as any[]).length} tables in MySQL database`);

      const tables = [];

      for (const tableRow of tablesResult as any[]) {
        const tableName = Object.values(tableRow)[0] as string;

        // Get columns for each table
        const [columnsResult] = await mysqlConnection.execute(`DESCRIBE ${tableName}`);

        const columns = (columnsResult as any[]).map(col => ({
          name: col.Field,
          type: col.Type,
          nullable: col.Null === 'YES',
          default: col.Default
        }));

        tables.push({
          name: tableName,
          columns
        });

        console.log(`📋 Table ${tableName}: ${columns.length} columns`);
      }

      console.log(`✅ MySQL schema retrieved successfully`);
      return { tables };
    } catch (error) {
      console.error(`❌ MySQL schema error:`, error);
      throw error;
    } finally {
      await mysqlConnection.end();
    }
  }

  private async executeSQLiteQuery(connection: any, query: string, startTime: number): Promise<QueryResult> {
    console.log(`🗄️ Connecting to SQLite: ${connection.filePath || connection.database}`);

    const dbPath = connection.filePath || connection.database;
    if (!dbPath) {
      throw new Error('SQLite database path not found');
    }

    try {
      const db = new Database(dbPath, { readonly: true });
      console.log(`✅ Connected to SQLite successfully`);

      const stmt = db.prepare(query);
      const rows = stmt.all();

      // Extract column names - handle both cases where we have data and where we don't
      let columns: string[] = [];
      if (rows.length > 0) {
        columns = Object.keys(rows[0]);
      } else {
        // For queries like SELECT 1, we might still get column info from the statement
        try {
          const columnInfo = stmt.columns();
          if (columnInfo && columnInfo.length > 0) {
            columns = columnInfo.map(col => col.name);
          }
        } catch (e) {
          // If we can't get column info, try to execute once to get structure
          try {
            const sampleResult = db.prepare(query).get();
            if (sampleResult) {
              columns = Object.keys(sampleResult);
              // Re-run to get all results
              const allResults = db.prepare(query).all();
              db.close();
              return {
                success: true,
                data: allResults,
                columns,
                rowCount: allResults.length,
                executionTime: Date.now() - startTime
              };
            }
          } catch (e2) {
            console.log(`⚠️ Could not determine columns for query: ${query}`);
          }
        }
      }

      db.close();

      return {
        success: true,
        data: rows,
        columns,
        rowCount: rows.length,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      console.error(`❌ SQLite query error:`, error);
      throw error;
    }
  }

  private async getSQLiteSchema(connection: any): Promise<DatabaseSchema> {
    console.log(`🗄️ Getting SQLite schema: ${connection.filePath || connection.database}`);

    const dbPath = connection.filePath || connection.database;
    if (!dbPath) {
      throw new Error('SQLite database path not found');
    }

    try {
      const db = new Database(dbPath, { readonly: true });
      console.log(`✅ Connected to SQLite successfully`);

      // Get all tables
      const tablesResult = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all();

      console.log(`📋 Found ${tablesResult.length} tables in SQLite database`);
      const tables = [];

      for (const tableRow of tablesResult) {
        const tableName = tableRow.name;

        // Get columns for each table
        const columnsResult = db.prepare(`PRAGMA table_info(${tableName})`).all();

        const columns = columnsResult.map((col: any) => ({
          name: col.name,
          type: col.type,
          nullable: !col.notnull,
          default: col.dflt_value
        }));

        tables.push({
          name: tableName,
          columns
        });

        console.log(`📋 Table ${tableName}: ${columns.length} columns`);
      }

      db.close();
      console.log(`✅ SQLite schema retrieved successfully`);
      return { tables };
    } catch (error) {
      console.error(`❌ SQLite schema error:`, error);
      throw error;
    }
  }

  async suggestQueries(connectionId: number, userId: string, userQuestion: string): Promise<string[]> {
    try {
      const schema = await this.getDatabaseSchema(connectionId, userId);
      if (!schema) {
        return [];
      }

      // Generate sample queries based on schema and user question
      const queries: string[] = [];

      // Add some basic exploratory queries
      if (schema.tables.length > 0) {
        const firstTable = schema.tables[0];
        queries.push(`SELECT * FROM ${firstTable.name} LIMIT 10;`);
        queries.push(`SELECT COUNT(*) FROM ${firstTable.name};`);

        // If there are multiple tables, suggest a join
        if (schema.tables.length > 1) {
          queries.push(`SELECT t1.*, t2.* FROM ${schema.tables[0].name} t1 JOIN ${schema.tables[1].name} t2 ON t1.id = t2.id LIMIT 10;`);
        }
      }

      return queries;
    } catch (error) {
      console.error('Error suggesting queries:', error);
      return [];
    }
  }
}

export const databaseQueryService = new DatabaseQueryService();