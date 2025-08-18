export interface VectorDocument {
  id: string;
  vector: number[];
  metadata: Record<string, any>;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, any>;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  filter?: Record<string, any>;
}

export class VectorStore {
  private vectors: Map<string, any> = new Map();

  async store(id: string, vector: number[], metadata: any = {}) {
    this.vectors.set(id, {
      id,
      vector,
      metadata,
      timestamp: new Date().toISOString()
    });
    return { success: true, id };
  }

  async search(queryVector: number[], limit: number = 10) {
    const results = Array.from(this.vectors.values())
      .map(item => ({
        ...item,
        similarity: this.cosineSimilarity(queryVector, item.vector)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  }

  async delete(id: string) {
    const existed = this.vectors.has(id);
    this.vectors.delete(id);
    return { success: true, existed };
  }

  async getStats() {
    return {
      totalVectors: this.vectors.size,
      memoryUsage: this.vectors.size * 1536 * 4 // rough estimate
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}