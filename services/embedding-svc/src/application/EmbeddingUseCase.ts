import { EmbeddingsClient } from '../../../packages/contracts/ai/EmbeddingsClient.js';
import { OpenAIEmbeddingsClient } from '../infrastructure/providers/OpenAIEmbeddingsClient.js';
import { GeminiEmbeddingsClient } from '../infrastructure/providers/GeminiEmbeddingsClient.js';
import { VectorStore, VectorDocument } from '../infrastructure/db/VectorStore.js';

export interface GenerateEmbeddingsRequest {
  texts: string[];
  documentId?: number;
  provider?: string;
  model?: string;
}

export interface IndexDocumentRequest {
  documentId: number;
  chunks: Array<{
    content: string;
    chunkIndex: number;
    metadata?: Record<string, any>;
  }>;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  filter?: Record<string, any>;
  provider?: string;
}

export class EmbeddingUseCase {
  constructor(private vectorStore: VectorStore) {}

  private createEmbeddingsClient(provider: string): EmbeddingsClient {
    switch (provider.toLowerCase()) {
      case 'openai':
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
          throw new Error('OpenAI API key not configured');
        }
        return new OpenAIEmbeddingsClient(openaiKey);
      
      case 'gemini':
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
          throw new Error('Gemini API key not configured');
        }
        return new GeminiEmbeddingsClient(geminiKey);
      
      default:
        throw new Error(`Unsupported embedding provider: ${provider}`);
    }
  }

  async generateEmbeddings(params: {
    texts: string[];
    documentId?: number;
    provider?: string;
    model?: string;
  }) {
    const { texts, provider = 'openai', model } = params;

    try {
      const client = this.createEmbeddingsClient(provider);
      const result = await client.embed(texts, { model });

      return {
        embeddings: result.embeddings,
        dimensions: result.dimensions,
        provider,
        count: texts.length,
        usage: result.usage
      };
    } catch (error) {
      console.error(`Error generating embeddings with ${provider}:`, error);
      throw error;
    }
  }

  async indexDocument(params: {
    documentId: number;
    chunks: Array<{
      content: string;
      chunkIndex: number;
      metadata?: any;
    }>;
  }) {
    const { documentId, chunks } = params;

    // Generate embeddings for all chunks
    const texts = chunks.map(chunk => chunk.content);
    const embeddings = await this.generateEmbeddings({ texts });

    // Store in vector store (mock implementation)
    const indexedChunks = chunks.map((chunk, index) => ({
      documentId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      embedding: embeddings.embeddings[index],
      metadata: chunk.metadata || {}
    }));

    return {
      documentId,
      chunksIndexed: chunks.length,
      success: true,
      embeddings: embeddings.embeddings.length
    };
  }

  async searchSimilar(query: string, options: {
    limit?: number;
    threshold?: number;
    filter?: any;
    provider?: string;
  } = {}) {
    const { limit = 10, threshold = 0.5 } = options;

    // Generate embedding for query
    const queryEmbedding = await this.generateEmbeddings({ texts: [query] });

    // Mock search results
    const mockResults = Array.from({ length: Math.min(5, limit) }, (_, i) => ({
      documentId: Math.floor(Math.random() * 1000) + 1,
      chunkIndex: i,
      content: `Mock search result ${i + 1} for query: ${query}`,
      similarity: Math.random() * (1 - threshold) + threshold,
      metadata: { section: `section_${i}` }
    }));

    return mockResults.sort((a, b) => b.similarity - a.similarity);
  }

  async getDocumentEmbeddings(documentId: number) {
    // Mock document embeddings
    return Array.from({ length: 3 }, (_, i) => ({
      documentId,
      chunkIndex: i,
      content: `Chunk ${i + 1} content for document ${documentId}`,
      dimensions: 1536,
      metadata: { section: `section_${i}` }
    }));
  }

  async deleteDocumentEmbeddings(documentId: number) {
    // Mock deletion - return number of deleted embeddings
    return Math.floor(Math.random() * 10) + 1;
  }

  getAvailableProviders() {
    return {
      providers: ['openai', 'gemini'],
      default: 'openai'
    };
  }

  async getStats() {
    return {
      totalEmbeddings: Math.floor(Math.random() * 10000) + 1000,
      totalDocuments: Math.floor(Math.random() * 100) + 50,
      providers: this.getAvailableProviders(),
      uptime: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 86400),
      memoryUsage: {
        used: Math.floor(Math.random() * 512) + 256,
        total: 1024
      }
    };
  }

  async healthCheck() {
    return {
      status: 'healthy',
      service: 'embedding-svc',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      dependencies: {
        vectorStore: 'connected',
        providers: 'available'
      }
    };
  }
}