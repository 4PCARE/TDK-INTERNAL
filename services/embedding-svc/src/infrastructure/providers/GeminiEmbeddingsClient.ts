
import { EmbeddingsClient, EmbeddingResult, EmbeddingOptions } from '../../../../packages/contracts/ai/EmbeddingsClient.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiEmbeddingsClient implements EmbeddingsClient {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string = 'text-embedding-004') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async embed(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      const embeddings: number[][] = [];
      let totalTokens = 0;

      // Process in batches to avoid rate limits
      const batchSize = options?.batchSize || 5;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        
        for (const text of batch) {
          const result = await model.embedContent(text.trim());
          if (result.embedding && result.embedding.values) {
            embeddings.push(result.embedding.values);
            totalTokens += text.length; // Approximate token count
          } else {
            throw new Error('Invalid Gemini embedding response');
          }
        }

        // Small delay between batches to respect rate limits
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return {
        embeddings,
        dimensions: embeddings[0]?.length || 768,
        usage: {
          totalTokens,
          model: this.model
        }
      };
    } catch (error) {
      console.error('Gemini embedding generation failed:', error);
      throw new Error(`Gemini embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    // Cosine similarity calculation
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  chunkText(text: string, maxTokens: number = 512, fileType?: string): string[] {
    // Simple chunking by character count (approximate)
    const maxChars = maxTokens * 4; // Rough approximation: 1 token ≈ 4 characters
    const chunks: string[] = [];
    
    if (text.length <= maxChars) {
      return [text];
    }

    // Split by sentences first, then by chunks
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxChars) {
        currentChunk += sentence + '. ';
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence + '. ';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  getModel(): string {
    return this.model;
  }
}
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface EmbeddingResponse {
  embeddings: number[][];
  usage?: {
    totalTokens: number;
  };
}

export class GeminiEmbeddingsClient {
  private client: GoogleGenerativeAI;
  
  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateEmbeddings(texts: string[]): Promise<EmbeddingResponse> {
    try {
      const model = this.client.getGenerativeModel({ model: 'embedding-001' });
      
      const embeddings: number[][] = [];
      let totalTokens = 0;

      for (const text of texts) {
        const result = await model.embedContent(text);
        embeddings.push(result.embedding.values);
        totalTokens += text.split(' ').length; // Rough token estimation
      }

      return {
        embeddings,
        usage: { totalTokens }
      };
    } catch (error) {
      console.error('Gemini embedding error:', error);
      throw new Error(`Gemini embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.generateEmbeddings([text]);
    return response.embeddings[0];
  }
}
