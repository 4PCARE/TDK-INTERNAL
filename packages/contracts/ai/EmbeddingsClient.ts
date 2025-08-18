/**
 * Provider-agnostic interface for text embedding services
 * Supports OpenAI, Hugging Face, Voyage, Jina, Nomic, Ollama
 */

export interface EmbeddingResult {
  embeddings: number[][];
  dimensions: number;
  usage?: {
    totalTokens: number;
    model: string;
  };
}

export interface EmbeddingOptions {
  model?: string;
  batchSize?: number;
}

/**
 * Provider-agnostic embeddings client interface
 */
export interface EmbeddingsClient {
  /**
   * Generate embeddings for one or more texts
   */
  embed(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult>;

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number;

  /**
   * Chunk text into smaller pieces based on max tokens
   */
  chunkText(text: string, maxTokens?: number, fileType?: string): string[];

  /**
   * Get the model name for this provider
   */
  getModel(): string;
}