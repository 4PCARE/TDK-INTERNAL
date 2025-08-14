/**
 * Provider-agnostic interface for text embedding services
 * Supports OpenAI, Hugging Face, Voyage, Jina, Nomic, Ollama
 */

export interface EmbeddingResponse {
  embeddings: number[][];
  dimensions: number;
  usage?: {
    totalTokens: number;
  };
}

export interface EmbeddingOptions {
  model?: string;
  dimensions?: number;
  batchSize?: number;
}

/**
 * Provider-agnostic embeddings client interface
 */
export interface EmbeddingsClient {
  /**
   * Generate embeddings for one or more texts
   */
  embed(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResponse>;
  
  /**
   * Get embedding dimensions for the specified model
   */
  getDimensions(model?: string): Promise<number>;
  
  /**
   * Get available models for this provider
   */
  getAvailableModels(): Promise<string[]>;
}