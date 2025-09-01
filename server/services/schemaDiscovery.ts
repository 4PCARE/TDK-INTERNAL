
import { db, pool } from "../db";
import { eq } from "drizzle-orm";
import { dataConnections } from "@shared/schema";

interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  rowCount?: number;
  sampleData?: any[];
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  referencedTable?: string;
  referencedColumn?: string;
}

interface DatabaseSchema {
  tables: TableInfo[];
  relationships: Relationship[];
  summary: {
    totalTables: number;
    totalColumns: number;
    estimatedRows: number;
  };
}

interface Relationship {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export class SchemaDiscoveryService {
  
  async discoverDatabaseSchema(connectionId: number, userId: string): Promise<DatabaseSchema> {
    // Get connection details
    const [connection] = await db
      .select()
      .from(dataConnections)
      .where(eq(dataConnections.id, connectionId));

    if (!connection || connection.userId !== userId) {
      throw new Error("Database connection not found or access denied");
    }

    switch (connection.type) {
      case 'sqlite':
        return await this.discoverSQLiteSchema(connection);
      case 'postgresql':
        return await this.discoverPostgreSQLSchema(connection);
      case 'mysql':
        return await this.discoverMySQLSchema(connection);
      default:
        throw new Error(`Schema discovery not supported for ${connection.type}`);
    }
  }

  private async discoverSQLiteSchema(connection: any): Promise<DatabaseSchema> {
    const sqlite3 = await import('sqlite3');
    const { Database } = sqlite3;

    return new Promise((resolve, reject) => {
      const db = new Database(connection.database, async (err) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const tables: TableInfo[] = [];
          const relationships: Relationship[] = [];

          // Get all tables
          db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", async (err, tableRows: any[]) => {
            if (err) {
              reject(err);
              return;
            }

            for (const tableRow of tableRows) {
              const tableName = tableRow.name;
              
              // Get table info
              db.all(`PRAGMA table_info(${tableName})`, (err, columnRows: any[]) => {
                if (err) {
                  console.error(`Error getting table info for ${tableName}:`, err);
                  return;
                }

                const columns: ColumnInfo[] = columnRows.map(col => ({
                  name: col.name,
                  type: col.type,
                  nullable: !col.notnull,
                  defaultValue: col.dflt_value,
                  isPrimaryKey: !!col.pk
                }));

                // Get row count
                db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, countResult: any) => {
                  const rowCount = countResult?.count || 0;

                  // Get sample data
                  db.all(`SELECT * FROM ${tableName} LIMIT 5`, (err, sampleRows: any[]) => {
                    tables.push({
                      name: tableName,
                      columns,
                      rowCount,
                      sampleData: sampleRows || []
                    });

                    // If this is the last table, resolve
                    if (tables.length === tableRows.length) {
                      const summary = {
                        totalTables: tables.length,
                        totalColumns: tables.reduce((sum, table) => sum + table.columns.length, 0),
                        estimatedRows: tables.reduce((sum, table) => sum + (table.rowCount || 0), 0)
                      };

                      resolve({
                        tables,
                        relationships,
                        summary
                      });
                    }
                  });
                });
              });
            }

            if (tableRows.length === 0) {
              resolve({
                tables: [],
                relationships: [],
                summary: { totalTables: 0, totalColumns: 0, estimatedRows: 0 }
              });
            }
          });
        } catch (error) {
          reject(error);
        } finally {
          db.close();
        }
      });
    });
  }

  private async discoverPostgreSQLSchema(connection: any): Promise<DatabaseSchema> {
    const { Client } = await import('pg');
    const client = new Client({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.username,
      password: connection.password,
    });

    await client.connect();

    try {
      // Get all tables
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `);

      const tables: TableInfo[] = [];

      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.table_name;

        // Get column information
        const columnsResult = await client.query(`
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            CASE WHEN c.constraint_type = 'PRIMARY KEY' THEN true ELSE false END as is_primary_key
          FROM information_schema.columns c
          LEFT JOIN information_schema.key_column_usage kcu ON c.column_name = kcu.column_name AND c.table_name = kcu.table_name
          LEFT JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
          WHERE c.table_name = $1
          ORDER BY c.ordinal_position
        `, [tableName]);

        const columns: ColumnInfo[] = columnsResult.rows.map(col => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES',
          defaultValue: col.column_default,
          isPrimaryKey: col.is_primary_key
        }));

        // Get row count
        const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
        const rowCount = parseInt(countResult.rows[0].count);

        // Get sample data
        const sampleResult = await client.query(`SELECT * FROM ${tableName} LIMIT 5`);

        tables.push({
          name: tableName,
          columns,
          rowCount,
          sampleData: sampleResult.rows
        });
      }

      const summary = {
        totalTables: tables.length,
        totalColumns: tables.reduce((sum, table) => sum + table.columns.length, 0),
        estimatedRows: tables.reduce((sum, table) => sum + (table.rowCount || 0), 0)
      };

      return {
        tables,
        relationships: [], // TODO: Implement relationship discovery
        summary
      };
    } finally {
      await client.end();
    }
  }

  private async discoverMySQLSchema(connection: any): Promise<DatabaseSchema> {
    const mysql = await import('mysql2/promise');
    const conn = await mysql.createConnection({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.username,
      password: connection.password,
    });

    try {
      // Get all tables
      const [tableRows] = await conn.execute(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = ?
      `, [connection.database]);

      const tables: TableInfo[] = [];

      for (const tableRow of tableRows as any[]) {
        const tableName = tableRow.table_name;

        // Get column information
        const [columnRows] = await conn.execute(`
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            column_key
          FROM information_schema.columns 
          WHERE table_name = ? AND table_schema = ?
          ORDER BY ordinal_position
        `, [tableName, connection.database]);

        const columns: ColumnInfo[] = (columnRows as any[]).map(col => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES',
          defaultValue: col.column_default,
          isPrimaryKey: col.column_key === 'PRI'
        }));

        // Get row count
        const [countRows] = await conn.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
        const rowCount = (countRows as any[])[0].count;

        // Get sample data
        const [sampleRows] = await conn.execute(`SELECT * FROM ${tableName} LIMIT 5`);

        tables.push({
          name: tableName,
          columns,
          rowCount,
          sampleData: sampleRows as any[]
        });
      }

      const summary = {
        totalTables: tables.length,
        totalColumns: tables.reduce((sum, table) => sum + table.columns.length, 0),
        estimatedRows: tables.reduce((sum, table) => sum + (table.rowCount || 0), 0)
      };

      return {
        tables,
        relationships: [], // TODO: Implement relationship discovery
        summary
      };
    } finally {
      await conn.end();
    }
  }

  async inferDataTypes(connectionId: number, userId: string): Promise<{
    recommendations: Array<{
      table: string;
      column: string;
      currentType: string;
      recommendedType: string;
      reason: string;
      confidence: number;
    }>;
  }> {
    const schema = await this.discoverDatabaseSchema(connectionId, userId);
    const recommendations: any[] = [];

    for (const table of schema.tables) {
      for (const column of table.columns) {
        if (table.sampleData && table.sampleData.length > 0) {
          const values = table.sampleData.map(row => row[column.name]).filter(v => v !== null && v !== undefined);
          
          if (values.length > 0) {
            const analysis = this.analyzeColumnData(values);
            
            if (analysis.recommendedType !== column.type.toLowerCase()) {
              recommendations.push({
                table: table.name,
                column: column.name,
                currentType: column.type,
                recommendedType: analysis.recommendedType,
                reason: analysis.reason,
                confidence: analysis.confidence
              });
            }
          }
        }
      }
    }

    return { recommendations };
  }

  private analyzeColumnData(values: any[]): {
    recommendedType: string;
    reason: string;
    confidence: number;
  } {
    // Check if all values are numbers
    const numericValues = values.filter(v => !isNaN(Number(v)) && v !== '');
    if (numericValues.length === values.length) {
      const hasDecimals = numericValues.some(v => Number(v) % 1 !== 0);
      return {
        recommendedType: hasDecimals ? 'decimal' : 'integer',
        reason: `All values are ${hasDecimals ? 'decimal' : 'integer'} numbers`,
        confidence: 0.95
      };
    }

    // Check if all values are dates
    const dateValues = values.filter(v => !isNaN(Date.parse(v)));
    if (dateValues.length === values.length) {
      return {
        recommendedType: 'date',
        reason: 'All values can be parsed as dates',
        confidence: 0.9
      };
    }

    // Check if all values are boolean-like
    const booleanValues = values.filter(v => 
      ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'].includes(String(v).toLowerCase())
    );
    if (booleanValues.length === values.length) {
      return {
        recommendedType: 'boolean',
        reason: 'All values appear to be boolean',
        confidence: 0.85
      };
    }

    // Default to text
    return {
      recommendedType: 'text',
      reason: 'Mixed or text data detected',
      confidence: 0.7
    };
  }
}

export const schemaDiscoveryService = new SchemaDiscoveryService();
