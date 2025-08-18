
import OpenAI from 'openai';
import { EmbeddingsClient, EmbeddingOptions, EmbeddingResult } from '../../../../packages/contracts/ai/EmbeddingsClient.js';

export class OpenAIEmbeddingsClient implements EmbeddingsClient {
  private client: OpenAI;
  private model = "text-embedding-3-small"; // 1536 dimensions, cost-effective
  private maxTokensPerChunk = 8000;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.client = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
  }

  async embed(texts: string[], options: EmbeddingOptions = {}): Promise<EmbeddingResult> {
    try {
      const { model = this.model, batchSize = 100 } = options;
      const embeddings: number[][] = [];
      let totalTokens = 0;

      // Process in batches to handle API limits
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const response = await this.client.embeddings.create({
          model,
          input: batch.map(text => text.trim()),
        });

        embeddings.push(...response.data.map(item => item.embedding));
        totalTokens += response.usage?.total_tokens || 0;
      }

      return {
        embeddings,
        dimensions: embeddings[0]?.length || 1536,
        usage: {
          totalTokens,
          model
        }
      };
    } catch (error) {
      console.error('Error generating embeddings with OpenAI:', error);
      throw new Error(`Failed to generate embeddings: ${error.message}`);
    }
  }

  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error("Embeddings must have the same length");
    }

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      magnitude1 += embedding1[i] * embedding1[i];
      magnitude2 += embedding2[i] * embedding2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  chunkText(text: string, maxTokens: number = this.maxTokensPerChunk, fileType?: string): string[] {
    const maxChars = maxTokens * 4; // Approximate characters
    if (text.length <= maxChars) {
      return [text];
    }

    const chunks: string[] = [];
    const approxMaxChars = Math.floor(maxChars * 0.9); // Leave buffer

    // Special handling for Excel files
    if (fileType && (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType.includes('csv'))) {
      return this.chunkExcelContent(text, approxMaxChars);
    }

    // Split by sentences but preserve word boundaries
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = "";

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      if (currentChunk.length + trimmedSentence.length > approxMaxChars && currentChunk.length > 0) {
        const finalChunk = this.ensureWordBoundary(currentChunk.trim(), approxMaxChars);
        chunks.push(finalChunk);
        currentChunk = trimmedSentence;
      } else {
        currentChunk += (currentChunk ? ". " : "") + trimmedSentence;
      }
    }

    if (currentChunk.trim()) {
      const finalChunk = this.ensureWordBoundary(currentChunk.trim(), approxMaxChars);
      chunks.push(finalChunk);
    }

    return chunks.length > 0 ? chunks : [text.trim()];
  }

  private chunkExcelContent(text: string, maxChars: number): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (currentChunk.length + trimmedLine.length + 1 > maxChars && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmedLine;
      } else {
        currentChunk += (currentChunk ? "\n" : "") + trimmedLine;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text.trim()];
  }

  private ensureWordBoundary(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text;
    }

    let cutoff = maxChars;
    while (cutoff > 0 && text[cutoff] !== ' ' && text[cutoff] !== '\n' && text[cutoff] !== '\t') {
      cutoff--;
    }

    if (cutoff === 0) {
      cutoff = maxChars;
    }

    return text.substring(0, cutoff).trim();
  }

  getModel(): string {
    return this.model;
  }
}
import { EmbeddingsClient, EmbeddingResult, EmbeddingOptions } from '../../../../packages/contracts/ai/EmbeddingsClient.js';
import OpenAI from 'openai';

export class OpenAIEmbeddingsClient implements EmbeddingsClient {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'text-embedding-3-small') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async embed(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult> {
    try {
      const response = await this.client.embeddings.create({
        model: options?.model || this.model,
        input: texts,
      });

      const embeddings = response.data.map(item => item.embedding);
      const dimensions = embeddings[0]?.length || 1536;

      return {
        embeddings,
        dimensions,
        usage: {
          totalTokens: response.usage.total_tokens,
          model: this.model
        }
      };
    } catch (error) {
      console.error('OpenAI embedding generation failed:', error);
      throw new Error(`OpenAI embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
