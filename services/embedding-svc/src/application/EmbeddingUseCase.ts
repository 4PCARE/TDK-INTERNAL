
import { EmbeddingsClient, EmbeddingOptions } from '../../../packages/contracts/ai/EmbeddingsClient.js';
import { OpenAIEmbeddingsClient } from '../infrastructure/providers/OpenAIEmbeddingsClient.js';
import { VectorStore } from '../infrastructure/db/VectorStore.js';

export interface EmbeddingRequest {
  texts: string[];
  documentId?: number;
  provider?: string;
  model?: string;
}

export interface IndexingRequest {
  documentId: number;
  chunks: Array<{
    content: string;
    index: number;
    metadata?: Record<string, any>;
  }>;
}

export class EmbeddingUseCase {
  private providers: Map<string, EmbeddingsClient> = new Map();
  private vectorStore: VectorStore;

  constructor(vectorStore: VectorStore) {
    this.vectorStore = vectorStore;
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize OpenAI provider
    if (process.env.OPENAI_API_KEY) {
      this.providers.set('openai', new OpenAIEmbeddingsClient());
    }
    
    // Add more providers as needed
    // this.providers.set('huggingface', new HuggingFaceEmbeddingsClient());
  }

  async generateEmbeddings(request: EmbeddingRequest) {
    const provider = this.getProvider(request.provider || 'openai');
    
    const options: EmbeddingOptions = {
      model: request.model,
      batchSize: 50 // Optimize for performance
    };

    const result = await provider.embed(request.texts, options);
    
    return {
      embeddings: result.embeddings,
      dimensions: result.dimensions,
      provider: request.provider || 'openai',
      usage: result.usage
    };
  }

  async indexDocument(request: IndexingRequest) {
    const texts = request.chunks.map(chunk => chunk.content);
    const embeddings = await this.generateEmbeddings({ texts });

    // Store in vector database
    const vectors = embeddings.embeddings.map((embedding, index) => ({
      id: `${request.documentId}_${request.chunks[index].index}`,
      vector: embedding,
      metadata: {
        documentId: request.documentId,
        chunkIndex: request.chunks[index].index,
        content: request.chunks[index].content,
        ...request.chunks[index].metadata
      }
    }));

    await this.vectorStore.upsert(vectors);

    return {
      documentId: request.documentId,
      chunksIndexed: vectors.length,
      dimensions: embeddings.dimensions
    };
  }

  async searchSimilar(query: string, options: {
    limit?: number;
    threshold?: number;
    filter?: Record<string, any>;
    provider?: string;
  } = {}) {
    const { limit = 10, threshold = 0.7, filter, provider = 'openai' } = options;
    
    // Generate query embedding
    const queryEmbedding = await this.generateEmbeddings({
      texts: [query],
      provider
    });

    // Search vector store
    const results = await this.vectorStore.search(
      queryEmbedding.embeddings[0],
      {
        limit,
        threshold,
        filter
      }
    );

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
    return this.vectorStore.getByDocumentId(documentId);
  }

  async deleteDocumentEmbeddings(documentId: number) {
    return this.vectorStore.deleteByDocumentId(documentId);
  }

  private getProvider(name: string): EmbeddingsClient {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Embedding provider '${name}' not available`);
    }
    return provider;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}
