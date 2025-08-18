
import { EmbeddingsClient, EmbeddingOptions, EmbeddingResult } from '../../../../packages/contracts/ai/EmbeddingsClient.js';

export class OpenAIEmbeddingsClient implements EmbeddingsClient {
  private apiKey: string;
  private baseURL: string = 'https://api.openai.com/v1';

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
  }

  async embed(texts: string[], options: EmbeddingOptions = {}): Promise<EmbeddingResult> {
    const { model = 'text-embedding-3-small', batchSize = 50 } = options;
    
    const batches = this.createBatches(texts, batchSize);
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;
    
    for (const batch of batches) {
      const response = await fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: batch,
          model,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      const embeddings = result.data.map((item: any) => item.embedding);
      allEmbeddings.push(...embeddings);
      totalTokens += result.usage.total_tokens;
    }

    return {
      embeddings: allEmbeddings,
      dimensions: allEmbeddings[0]?.length || 0,
      usage: {
        totalTokens,
        promptTokens: totalTokens,
        completionTokens: 0,
      },
    };
  }

  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }
}
