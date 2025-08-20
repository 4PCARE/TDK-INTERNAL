import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';
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

  async executeQuery(connectionId: number, query: string, userId: string): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      // Get connection details from storage
      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection || connection.type !== 'database') {
        return {
          success: false,
          error: 'Database connection not found or invalid type'
        };
      }

      // Execute query based on database type
      switch (connection.dbType) {
        case 'postgresql':
          return await this.executePostgreSQLQuery(connection, query, startTime);
        case 'mysql':
          return await this.executeMySQLQuery(connection, query, startTime);
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
      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection || connection.type !== 'database') {
        return null;
      }

      switch (connection.dbType) {
        case 'postgresql':
          return await this.getPostgreSQLSchema(connection);
        case 'mysql':
          return await this.getMySQLSchema(connection);
        default:
          return null;
      }
    } catch (error) {
      console.error('Error getting database schema:', error);
      return null;
    }
  }

  private async getPostgreSQLSchema(connection: any): Promise<DatabaseSchema> {
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
      
      // Get tables
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

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
      }

      client.release();
      return { tables };
    } catch (error) {
      throw error;
    } finally {
      await pool.end();
    }
  }

  private async getMySQLSchema(connection: any): Promise<DatabaseSchema> {
    const mysqlConnection = await mysql.createConnection({
      host: connection.host,
      port: connection.port || 3306,
      user: connection.username,
      password: connection.password,
      database: connection.database,
      connectTimeout: 10000,
    });

    try {
      // Get tables
      const [tablesResult] = await mysqlConnection.execute('SHOW TABLES');
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
      }

      return { tables };
    } catch (error) {
      throw error;
    } finally {
      await mysqlConnection.end();
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