import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';
import jsforce from 'jsforce';
import fetch from 'node-fetch';

// Oracle DB is optional - only use if available
let oracledb: any = null;
try {
  oracledb = require('oracledb');
} catch (e) {
  console.log('Oracle DB driver not available');
}

export interface DatabaseConnection {
  id: number;
  type: 'database' | 'api' | 'enterprise';
  dbType?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  apiUrl?: string;
  authType?: string;
  apiKey?: string;
  bearerToken?: string;
  enterpriseType?: string;
}

export interface QueryResult {
  success: boolean;
  data?: any[];
  columns?: string[];
  error?: string;
  rowCount?: number;
}

export class DatabaseConnector {
  private connections: Map<number, any> = new Map();

  async testConnection(connection: DatabaseConnection): Promise<{ success: boolean; message: string }> {
    try {
      switch (connection.type) {
        case 'database':
          return await this.testDatabaseConnection(connection);
        case 'api':
          return await this.testApiConnection(connection);
        case 'enterprise':
          return await this.testEnterpriseConnection(connection);
        default:
          return { success: false, message: 'Unknown connection type' };
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  private async testDatabaseConnection(connection: DatabaseConnection): Promise<{ success: boolean; message: string }> {
    if (!connection.host || !connection.username || !connection.password) {
      return { success: false, message: 'Missing required database connection parameters' };
    }

    try {
      switch (connection.dbType) {
        case 'postgresql':
          return await this.testPostgreSQLConnection(connection);
        case 'mysql':
          return await this.testMySQLConnection(connection);
        case 'oracle':
          return await this.testOracleConnection(connection);
        default:
          return { success: false, message: `Unsupported database type: ${connection.dbType}` };
      }
    } catch (error) {
      return { 
        success: false, 
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  private async testPostgreSQLConnection(connection: DatabaseConnection): Promise<{ success: boolean; message: string }> {
    const pool = new PgPool({
      host: connection.host,
      port: connection.port || 5432,
      database: connection.database,
      user: connection.username,
      password: connection.password,
      max: 1,
      connectionTimeoutMillis: 5000,
    });

    try {
      const client = await pool.connect();
      const result = await client.query('SELECT version()');
      client.release();
      await pool.end();
      
      return { 
        success: true, 
        message: `Connected successfully to PostgreSQL. Version: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}` 
      };
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  private async testMySQLConnection(connection: DatabaseConnection): Promise<{ success: boolean; message: string }> {
    const mysqlConnection = await mysql.createConnection({
      host: connection.host,
      port: connection.port || 3306,
      user: connection.username,
      password: connection.password,
      database: connection.database,
      connectTimeout: 5000,
    });

    try {
      const [rows] = await mysqlConnection.execute('SELECT VERSION() as version');
      await mysqlConnection.end();
      
      return { 
        success: true, 
        message: `Connected successfully to MySQL. Version: ${(rows as any)[0].version}` 
      };
    } catch (error) {
      await mysqlConnection.end();
      throw error;
    }
  }

  private async testOracleConnection(connection: DatabaseConnection): Promise<{ success: boolean; message: string }> {
    let oracleConnection;
    
    try {
      oracleConnection = await oracledb.getConnection({
        user: connection.username,
        password: connection.password,
        connectString: `${connection.host}:${connection.port || 1521}/${connection.database}`
      });

      const result = await oracleConnection.execute('SELECT banner FROM v$version WHERE ROWNUM = 1');
      await oracleConnection.close();
      
      return { 
        success: true, 
        message: `Connected successfully to Oracle Database. ${(result.rows as any)[0][0]}` 
      };
    } catch (error) {
      if (oracleConnection) {
        await oracleConnection.close();
      }
      throw error;
    }
  }

  private async testApiConnection(connection: DatabaseConnection): Promise<{ success: boolean; message: string }> {
    if (!connection.apiUrl) {
      return { success: false, message: 'API URL is required' };
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (connection.authType === 'bearer' && connection.bearerToken) {
        headers['Authorization'] = `Bearer ${connection.bearerToken}`;
      } else if (connection.authType === 'api_key' && connection.apiKey) {
        headers['X-API-Key'] = connection.apiKey;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(connection.apiUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        return { 
          success: true, 
          message: `API connection successful. Status: ${response.status} ${response.statusText}` 
        };
      } else {
        return { 
          success: false, 
          message: `API connection failed. Status: ${response.status} ${response.statusText}` 
        };
      }
    } catch (error) {
      throw error;
    }
  }

  private async testEnterpriseConnection(connection: DatabaseConnection): Promise<{ success: boolean; message: string }> {
    try {
      switch (connection.enterpriseType) {
        case 'salesforce':
          return await this.testSalesforceConnection(connection);
        case 'sap':
          return await this.testSAPConnection(connection);
        case 'oracle_erp':
          return await this.testOracleERPConnection(connection);
        default:
          return { success: false, message: `Unsupported enterprise system: ${connection.enterpriseType}` };
      }
    } catch (error) {
      return { 
        success: false, 
        message: `Enterprise connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  private async testSalesforceConnection(connection: DatabaseConnection): Promise<{ success: boolean; message: string }> {
    if (!connection.username || !connection.password) {
      return { success: false, message: 'Salesforce username and password are required' };
    }

    try {
      const conn = new jsforce.Connection({
        loginUrl: connection.apiUrl || 'https://login.salesforce.com'
      });

      const userInfo = await conn.login(connection.username, connection.password);
      
      return { 
        success: true, 
        message: `Connected to Salesforce successfully. Organization ID: ${userInfo.organizationId}` 
      };
    } catch (error) {
      throw error;
    }
  }

  private async testSAPConnection(connection: DatabaseConnection): Promise<{ success: boolean; message: string }> {
    if (!connection.apiUrl || !connection.username || !connection.password) {
      return { success: false, message: 'SAP API URL, username, and password are required' };
    }

    try {
      const auth = Buffer.from(`${connection.username}:${connection.password}`).toString('base64');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${connection.apiUrl}/sap/opu/odata/sap/API_BUSINESSPARTNER_SRV/`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        return { 
          success: true, 
          message: `Connected to SAP system successfully. Status: ${response.status}` 
        };
      } else {
        return { 
          success: false, 
          message: `SAP connection failed. Status: ${response.status} ${response.statusText}` 
        };
      }
    } catch (error) {
      throw error;
    }
  }

  private async testOracleERPConnection(connection: DatabaseConnection): Promise<{ success: boolean; message: string }> {
    if (!connection.apiUrl || !connection.username || !connection.password) {
      return { success: false, message: 'Oracle ERP Cloud API URL, username, and password are required' };
    }

    try {
      const auth = Buffer.from(`${connection.username}:${connection.password}`).toString('base64');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${connection.apiUrl}/fscmRestApi/resources/11.13.18.05/`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        return { 
          success: true, 
          message: `Connected to Oracle ERP Cloud successfully. Status: ${response.status}` 
        };
      } else {
        return { 
          success: false, 
          message: `Oracle ERP connection failed. Status: ${response.status} ${response.statusText}` 
        };
      }
    } catch (error) {
      throw error;
    }
  }

  async executeQuery(connectionId: number, query: string): Promise<QueryResult> {
    // Implementation for executing queries on established connections
    // This would be used by the AI assistant to query data
    try {
      // Get connection from storage and execute query
      // Return formatted results
      return {
        success: true,
        data: [],
        columns: [],
        rowCount: 0
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query execution failed'
      };
    }
  }
}

export const databaseConnector = new DatabaseConnector();