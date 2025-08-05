import { llmRouter } from "./llmRouter";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface EmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  calculateSimilarity(embedding1: number[], embedding2: number[]): number;
  chunkText(text: string, maxTokens?: number, fileType?: string): string[];
}

export class OpenAIEmbeddingService implements EmbeddingService {
  private model = "text-embedding-3-small"; // 1536 dimensions, cost-effective
  private maxTokensPerChunk = 8000; // Conservative limit for text-embedding-3-small

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: this.model,
        input: text.trim(),
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error("Error generating embedding:", error);
      throw new Error("Failed to generate embedding");
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      // OpenAI allows up to 2048 inputs per request for text-embedding-3-small
      const batchSize = 100; // Conservative batch size
      const embeddings: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const response = await openai.embeddings.create({
          model: this.model,
          input: batch.map(text => text.trim()),
        });

        embeddings.push(...response.data.map(item => item.embedding));
      }

      return embeddings;
    } catch (error) {
      console.error("Error generating embeddings:", error);
      throw new Error("Failed to generate embeddings");
    }
  }

  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    // Cosine similarity calculation
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
    const approxMaxChars = Math.floor(maxChars * 0.9); // Leave some buffer

    // Special handling for Excel files - chunk by rows
    if (fileType && (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType.includes('csv'))) {
      return this.chunkExcelContent(text, approxMaxChars);
    }

    // For other text types, split by sentences but preserve word boundaries
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = "";

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      // If adding this sentence would exceed the limit, start a new chunk
      if (currentChunk.length + trimmedSentence.length > approxMaxChars && currentChunk.length > 0) {
        // Ensure we don't break words at chunk boundaries
        const finalChunk = this.ensureWordBoundary(currentChunk.trim(), approxMaxChars);
        chunks.push(finalChunk);
        currentChunk = trimmedSentence;
      } else {
        currentChunk += (currentChunk ? ". " : "") + trimmedSentence;
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.trim()) {
      const finalChunk = this.ensureWordBoundary(currentChunk.trim(), approxMaxChars);
      chunks.push(finalChunk);
    }

    // If no chunks were created (very short text), return the original text as a single chunk
    if (chunks.length === 0 && text.trim()) {
      chunks.push(text.trim());
    }

    return chunks;
  }

  private chunkExcelContent(text: string, maxChars: number): string[] {
    const chunks: string[] = [];
    let currentChunk = "";

    // Split by lines (rows in Excel)
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // If adding this row would exceed the limit, start a new chunk
      if (currentChunk.length + trimmedLine.length + 1 > maxChars && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmedLine;
      } else {
        currentChunk += (currentChunk ? "\n" : "") + trimmedLine;
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text.trim()];
  }

  private ensureWordBoundary(text: string, maxChars: number): string {
    // If text is within limit, return as is
    if (text.length <= maxChars) {
      return text;
    }

    // Find the last complete word within the character limit
    let cutoff = maxChars;
    while (cutoff > 0 && text[cutoff] !== ' ' && text[cutoff] !== '\n' && text[cutoff] !== '\t') {
      cutoff--;
    }

    // If we couldn't find a word boundary, use the original cutoff
    if (cutoff === 0) {
      cutoff = maxChars;
    }

    return text.substring(0, cutoff).trim();
  }

  getModel(): string {
    return this.model;
  }
}

// Export singleton instance
export const embeddingService = new OpenAIEmbeddingService();