
import { EmbeddingsClient } from '../../../packages/contracts/ai/EmbeddingsClient.js';
import { OpenAIEmbeddingsClient } from '../infrastructure/providers/OpenAIEmbeddingsClient.js';
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
  private providers: Map<string, EmbeddingsClient>;
  private vectorStore: VectorStore;

  constructor(vectorStore: VectorStore) {
    this.vectorStore = vectorStore;
    this.providers = new Map();
    
    // Initialize available providers
    try {
      this.providers.set('openai', new OpenAIEmbeddingsClient());
      console.log('✅ OpenAI embeddings provider initialized');
    } catch (error) {
      console.warn('⚠️ OpenAI embeddings provider failed to initialize:', error.message);
    }
  }

  async generateEmbeddings(request: GenerateEmbeddingsRequest) {
    const { texts, documentId, provider = 'openai', model } = request;
    
    const embeddingProvider = this.getProvider(provider);
    
    console.log(`🔮 Generating embeddings for ${texts.length} texts using ${provider}`);
    
    const result = await embeddingProvider.embed(texts, { model });
    
    return {
      embeddings: result.embeddings,
      dimensions: result.dimensions,
      usage: result.usage,
      provider,
      documentId,
      count: result.embeddings.length
    };
  }

  async indexDocument(request: IndexDocumentRequest) {
    const { documentId, chunks } = request;
    
    console.log(`📚 Indexing document ${documentId} with ${chunks.length} chunks`);
    
    // Generate embeddings for all chunks
    const texts = chunks.map(chunk => chunk.content);
    const embeddingResult = await this.generateEmbeddings({
      texts,
      documentId,
      provider: 'openai'
    });

    // Create vector documents for storage
    const vectorDocuments: VectorDocument[] = chunks.map((chunk, index) => ({
      id: `doc_${documentId}_chunk_${chunk.chunkIndex}`,
      vector: embeddingResult.embeddings[index],
      metadata: {
        documentId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        provider: 'openai',
        model: embeddingResult.usage?.model || 'text-embedding-3-small',
        createdAt: new Date().toISOString(),
        ...chunk.metadata
      }
    }));

    // Store in vector database
    await this.vectorStore.upsert(vectorDocuments);

    console.log(`✅ Successfully indexed document ${documentId}`);

    return {
      documentId,
      chunksProcessed: chunks.length,
      vectorsCreated: vectorDocuments.length,
      dimensions: embeddingResult.dimensions,
      provider: 'openai',
      usage: embeddingResult.usage
    };
  }

  async searchSimilar(query: string, options: SearchOptions = {}) {
    const { limit = 10, threshold = 0.7, filter, provider = 'openai' } = options;
    
    console.log(`🔍 Searching for: "${query}" (limit: ${limit}, threshold: ${threshold})`);
    
    // Generate embedding for the query
    const embeddingProvider = this.getProvider(provider);
    const queryEmbedding = await embeddingProvider.embed([query]);
    
    if (!queryEmbedding.embeddings || queryEmbedding.embeddings.length === 0) {
      throw new Error('Failed to generate query embedding');
    }

    // Search vector store
    const results = await this.vectorStore.search(
      queryEmbedding.embeddings[0],
      {
        limit,
        threshold,
        filter
      }
    );

    console.log(`🎯 Found ${results.length} similar chunks`);

    return results.map(result => ({
      id: result.id,
      content: result.metadata.content,
      documentId: result.metadata.documentId,
      chunkIndex: result.metadata.chunkIndex,
      similarity: result.score,
      metadata: result.metadata
    }));
  }

  async getDocumentEmbeddings(documentId: number) {
    console.log(`📖 Getting embeddings for document ${documentId}`);
    
    const embeddings = await this.vectorStore.getByDocumentId(documentId);
    
    return embeddings.map(embedding => ({
      id: embedding.id,
      chunkIndex: embedding.metadata.chunkIndex,
      content: embedding.metadata.content,
      dimensions: embedding.vector.length,
      metadata: embedding.metadata
    }));
  }

  async deleteDocumentEmbeddings(documentId: number) {
    console.log(`🗑️ Deleting embeddings for document ${documentId}`);
    
    const deletedCount = await this.vectorStore.deleteByDocumentId(documentId);
    
    console.log(`✅ Deleted ${deletedCount} embeddings for document ${documentId}`);
    
    return deletedCount;
  }

  private getProvider(name: string): EmbeddingsClient {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Embedding provider '${name}' not available. Available providers: ${Array.from(this.providers.keys()).join(', ')}`);
    }
    return provider;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  // Utility methods for debugging and monitoring
  async getStats() {
    const vectorStats = this.vectorStore.getStats();
    const providers = this.getAvailableProviders();
    
    return {
      totalVectors: vectorStats.totalVectors,
      uniqueDocuments: vectorStats.uniqueDocuments,
      availableProviders: providers,
      defaultProvider: providers.includes('openai') ? 'openai' : providers[0]
    };
  }

  async healthCheck() {
    const stats = await this.getStats();
    const providers = this.getAvailableProviders();
    
    return {
      status: 'healthy',
      providersAvailable: providers.length > 0,
      providers,
      vectorStore: {
        totalVectors: stats.totalVectors,
        uniqueDocuments: stats.uniqueDocuments
      },
      timestamp: new Date().toISOString()
    };
  }
}
