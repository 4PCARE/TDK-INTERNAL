
export interface Vector {
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
  private vectors: Map<string, Vector> = new Map();

  async upsert(vectors: Vector[]): Promise<void> {
    vectors.forEach(vector => {
      this.vectors.set(vector.id, vector);
    });
  }

  async search(queryVector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.7 } = options;
    
    const results: SearchResult[] = [];
    
    for (const [id, vector] of this.vectors) {
      const similarity = this.cosineSimilarity(queryVector, vector.vector);
      
      if (similarity >= threshold) {
        results.push({
          id,
          score: similarity,
          metadata: vector.metadata
        });
      }
    }
    
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async getByDocumentId(documentId: number): Promise<Vector[]> {
    const results: Vector[] = [];
    
    for (const vector of this.vectors.values()) {
      if (vector.metadata.documentId === documentId) {
        results.push(vector);
      }
    }
    
    return results;
  }

  async deleteByDocumentId(documentId: number): Promise<number> {
    let deletedCount = 0;
    
    for (const [id, vector] of this.vectors) {
      if (vector.metadata.documentId === documentId) {
        this.vectors.delete(id);
        deletedCount++;
      }
    }
    
    return deletedCount;
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
