
import OpenAI from 'openai';
import { EmbeddingsClient, EmbeddingResponse, EmbeddingOptions } from '../../../../packages/contracts/ai/EmbeddingsClient.js';

export class OpenAIEmbeddingsClient implements EmbeddingsClient {
  private client: OpenAI;
  private defaultModel = 'text-embedding-3-small';
  private defaultDimensions = 1536;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async embed(texts: string[], options: EmbeddingOptions = {}): Promise<EmbeddingResponse> {
    const {
      model = this.defaultModel,
      dimensions = this.defaultDimensions,
      batchSize = 100
    } = options;

    const embeddings: number[][] = [];
    let totalTokens = 0;

    // Process in batches to handle rate limits
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      try {
        const response = await this.client.embeddings.create({
          model,
          input: batch.map(text => text.trim()),
          dimensions: model.includes('3-') ? dimensions : undefined
        });

        embeddings.push(...response.data.map(item => item.embedding));
        totalTokens += response.usage.total_tokens;

        // Small delay between batches to avoid rate limits
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error in OpenAI embedding batch ${Math.floor(i/batchSize) + 1}:`, error);
        throw new Error(`Failed to generate embeddings: ${error}`);
      }
    }

    return {
      embeddings,
      dimensions: embeddings[0]?.length || dimensions,
      usage: {
        totalTokens
      }
    };
  }

  async getDimensions(model?: string): Promise<number> {
    const modelName = model || this.defaultModel;
    
    // Return known dimensions for OpenAI models
    if (modelName.includes('text-embedding-3-small')) return 1536;
    if (modelName.includes('text-embedding-3-large')) return 3072;
    if (modelName.includes('text-embedding-ada-002')) return 1536;
    
    return this.defaultDimensions;
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      'text-embedding-3-small',
      'text-embedding-3-large',
      'text-embedding-ada-002'
    ];
  }
}
