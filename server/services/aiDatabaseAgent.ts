import OpenAI from 'openai';
import { DatabaseQueryService, DatabaseSchema } from './databaseQueryService';
import { databaseConnector, DatabaseConnection } from './databaseConnector';
import { storage } from '../storage';

// BM25 implementation for SQL snippet similarity
class BM25 {
  private k1: number = 1.5;
  private b: number = 0.75;
  private epsilon: number = 0.25;

  constructor(private corpus: string[], private avgdl?: number) {
    if (!avgdl) {
      this.avgdl = corpus.reduce((sum, doc) => sum + doc.split(' ').length, 0) / corpus.length;
    }
  }

  score(query: string, doc: string): number {
    const queryTerms = query.toLowerCase().split(' ');
    const docTerms = doc.toLowerCase().split(' ');
    const docLength = docTerms.length;

    let score = 0;

    for (const term of queryTerms) {
      const tf = docTerms.filter(t => t === term).length;
      const df = this.corpus.filter(d => d.toLowerCase().includes(term)).length;
      const idf = Math.log((this.corpus.length - df + 0.5) / (df + 0.5));

      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgdl!));

      score += idf * (numerator / denominator);
    }

    return score;
  }
}

export interface SQLSnippet {
  id?: number;
  name: string;
  sql: string;
  description: string;
  connectionId: number;
  userId: string;
  embedding?: number[];
  createdAt?: Date;
}

export interface QueryResult {
  success: boolean;
  sql?: string;
  data?: any[];
  columns?: string[];
  error?: string;
  executionTime?: number;
  explanation?: string;
  rowCount?: number;
}

export class AIDatabaseAgent {
  private openai: OpenAI;
  private queryService: DatabaseQueryService;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.queryService = new DatabaseQueryService();
  }

  async generateSQL(
    userQuery: string,
    connectionId: number,
    userId: string,
    maxRows: number = 50
  ): Promise<QueryResult> {
    try {
      // Get database schema
      const schema = await this.queryService.getDatabaseSchema(connectionId, userId);
      if (!schema) {
        return { success: false, error: 'Database schema not found' };
      }

      // Get connection details
      const connection = await storage.getDataConnection(connectionId, userId);
      if (!connection) {
        return { success: false, error: 'Database connection not found' };
      }

      // Get related SQL snippets for context
      const snippets = await this.getRelatedSnippets(userQuery, connectionId, userId);
      const snippetContext = this.formatSnippetsForPrompt(snippets);

      // Build schema context
      const schemaContext = this.formatSchemaForPrompt(schema);

      // Generate SQL using OpenAI
      const sqlQuery = await this.callOpenAIForSQL(
        userQuery,
        schemaContext,
        snippetContext,
        connection.dbType || 'postgresql',
        maxRows
      );
      console.log('🤖 AI Database Agent - Generated SQL:', sqlQuery);

      if (!sqlQuery) {
        return { success: false, error: 'Failed to generate SQL query' };
      }

      // Validate and execute the query
      try {
        const executionResult = await this.queryService.executeQuery(connectionId, userId, sqlQuery);
        console.log('🤖 AI Database Agent - Query execution result:', {
          success: executionResult.success,
          rowCount: executionResult.data?.length || 0,
          error: executionResult.error
        });

        return {
          success: executionResult.success,
          sql: sqlQuery,
          data: executionResult.data,
          columns: executionResult.columns,
          error: executionResult.error,
          executionTime: executionResult.executionTime,
          explanation: await this.generateExplanation(sqlQuery, userQuery, executionResult)
        };
      } catch (queryError) {
        console.error('🤖 AI Database Agent - Query execution failed:', queryError);
        return {
          success: false,
          sql: sqlQuery,
          error: `Database query failed: ${queryError instanceof Error ? queryError.message : 'Unknown error'}`
        };
      }

    } catch (error) {
      console.error('Error in AI database agent:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private async callOpenAIForSQL(
    userQuery: string,
    schemaContext: string,
    snippetContext: string,
    dbType: string,
    maxRows: number
  ): Promise<string | null> {
    const hasExamples = !snippetContext.includes('No example SQL patterns available');

    const systemPrompt = `You are an expert SQL query generator. Generate precise SQL queries based on user questions.

Database Type: ${dbType}
Schema Information:
${schemaContext}

${hasExamples ? 'Example SQL Patterns:' : 'Note:'}
${snippetContext}

IMPORTANT GUIDELINES:
- Generate ONLY valid SQL queries for ${dbType}
- Always use proper column quoting for special characters
- Limit results with LIMIT ${maxRows} unless user specifies otherwise
- Use READ-ONLY operations only (SELECT statements)
- For date comparisons, use appropriate date functions for ${dbType}
- When no examples are provided, use common SQL patterns and best practices
- Return only the SQL query, no explanations or markdown formatting`;

    try {
      console.log('🤖 AI Database Agent - Calling OpenAI with system prompt length:', systemPrompt.length);
      console.log('🤖 AI Database Agent - User query:', userQuery);

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate SQL for: ${userQuery}` }
        ],
        max_tokens: 500,
        temperature: 0.1,
      });

      const response = completion.choices[0].message.content;
      console.log('🤖 AI Database Agent - Raw OpenAI response:', response);
      if (!response) return null;

      // Extract SQL from response (remove any markdown formatting)
      let cleanSQL = response.trim();

      // Remove markdown code fences
      if (cleanSQL.includes('```sql')) {
        const sqlMatch = cleanSQL.match(/```sql\s*\n?([\s\S]*?)\n?```/);
        if (sqlMatch) {
          cleanSQL = sqlMatch[1].trim();
        }
      } else if (cleanSQL.includes('```')) {
        const codeMatch = cleanSQL.match(/```\s*\n?([\s\S]*?)\n?```/);
        if (codeMatch) {
          cleanSQL = codeMatch[1].trim();
        }
      }

      // Remove any remaining backticks at start/end
      cleanSQL = cleanSQL.replace(/^`+|`+$/g, '');

      console.log('🤖 AI Database Agent - Cleaned SQL:', cleanSQL);
      return cleanSQL;

    } catch (error) {
      console.error('OpenAI API error:', error);
      return null;
    }
  }

  private formatSchemaForPrompt(schema: DatabaseSchema): string {
    return schema.tables.map(table => {
      const columns = table.columns.map(col => 
        `  ${col.name} (${col.type}${col.nullable ? ', nullable' : ''})`
      ).join('\n');

      return `Table: ${table.name}\n${columns}`;
    }).join('\n\n');
  }

  private formatSnippetsForPrompt(snippets: SQLSnippet[]): string {
    if (snippets.length === 0) {
      return 'No example SQL patterns available. Generate query based on schema and user request.';
    }

    return snippets.map((snippet, index) => 
      `Example ${index + 1}: ${snippet.name}\n${snippet.description || 'No description'}\n${snippet.sql}\n`
    ).join('\n');
  }

  private async getRelatedSnippets(
    userQuery: string, 
    connectionId: number, 
    userId: string,
    limit: number = 3
  ): Promise<SQLSnippet[]> {
    try {
      // Get all snippets for this connection
      const allSnippets = await storage.getSQLSnippets(connectionId, userId);

      if (allSnippets.length === 0) {
        console.log(`📝 No SQL snippets found for connection ${connectionId}. AI will generate query without examples.`);
        return [];
      }

      // Use BM25 for similarity scoring
      const corpus = allSnippets.map(s => `${s.name} ${s.description} ${s.sql}`);
      const bm25 = new BM25(corpus);

      const scoredSnippets = allSnippets.map(snippet => ({
        snippet,
        score: bm25.score(userQuery, `${snippet.name} ${snippet.description} ${snippet.sql}`)
      }));

      // Sort by score and return top results
      const topSnippets = scoredSnippets
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.snippet);

      console.log(`📝 Found ${topSnippets.length} related SQL snippets for query context`);
      return topSnippets;

    } catch (error) {
      // Handle missing sql_snippets table or other database errors gracefully
      if (error.code === '42P01' || error.message?.includes('relation "sql_snippets" does not exist')) {
        console.log(`📝 SQL snippets table not found for connection ${connectionId}. AI will generate query without examples.`);
        return [];
      }

      console.error('Error getting related snippets:', error);
      return [];
    }
  }

  private async generateExplanation(
    sql: string,
    userQuery: string,
    result: any
  ): Promise<string> {
    try {
      const prompt = `Explain this SQL query in simple terms:

User asked: "${userQuery}"
Generated SQL: ${sql}
Result: ${result.success ? `${result.rowCount || 0} rows returned` : `Error: ${result.error}`}

Provide a brief, user-friendly explanation of what the query does and what the results mean.`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      });

      return completion.choices[0].message.content || 'Query executed successfully.';
    } catch (error) {
      return 'Query executed successfully.';
    }
  }

  // SQL Snippet Management
  async createSQLSnippet(data: {
    name: string;
    sql: string;
    description: string;
    connectionId: number;
    userId: string;
  }) {
    // Ensure description is never null/undefined and all data is properly cleaned
    const cleanData = {
      name: String(data.name || '').trim(),
      sql: String(data.sql || '').trim(),
      description: String(data.description || '').trim(),
      connectionId: Number(data.connectionId),
      userId: String(data.userId)
    };

    // Validate required fields
    if (!cleanData.name || !cleanData.sql) {
      throw new Error('Name and SQL are required fields');
    }

    console.log('🤖 AI Agent: Creating SQL snippet:', {
      name: cleanData.name,
      sqlLength: cleanData.sql.length,
      descriptionLength: cleanData.description.length,
      connectionId: cleanData.connectionId
    });

    return await storage.createSQLSnippet(cleanData);
  }

  async updateSQLSnippet(id: number, snippet: Partial<SQLSnippet>, userId: string): Promise<SQLSnippet> {
    return await storage.updateSQLSnippet(id, snippet, userId);
  }

  async deleteSQLSnippet(id: number, userId: string): Promise<void> {
    await storage.deleteSQLSnippet(id, userId);
  }

  async getSQLSnippets(connectionId: number, userId: string): Promise<SQLSnippet[]> {
    return await storage.getSQLSnippets(connectionId, userId);
  }
}

export const aiDatabaseAgent = new AIDatabaseAgent();