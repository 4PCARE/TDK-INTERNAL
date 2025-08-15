
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

export interface VectorStore {
  upsert(vectors: Vector[]): Promise<void>;
  search(queryVector: number[], options?: SearchOptions): Promise<SearchResult[]>;
  getByDocumentId(documentId: number): Promise<Vector[]>;
  deleteByDocumentId(documentId: number): Promise<number>;
  delete(ids: string[]): Promise<void>;
}

export class InMemoryVectorStore implements VectorStore {
  private vectors: Map<string, Vector> = new Map();

  async upsert(vectors: Vector[]): Promise<void> {
    for (const vector of vectors) {
      this.vectors.set(vector.id, vector);
    }
  }

  async search(queryVector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.0, filter } = options;
    const results: SearchResult[] = [];

    for (const [id, vector] of this.vectors) {
      // Apply filter if provided
      if (filter && !this.matchesFilter(vector.metadata, filter)) {
        continue;
      }

      const similarity = this.cosineSimilarity(queryVector, vector.vector);
      
      if (similarity >= threshold) {
        results.push({
          id,
          score: similarity,
          metadata: vector.metadata
        });
      }
    }

    // Sort by similarity (highest first) and limit
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
    
    return results.sort((a, b) => 
      (a.metadata.chunkIndex || 0) - (b.metadata.chunkIndex || 0)
    );
  }

  async deleteByDocumentId(documentId: number): Promise<number> {
    let deleted = 0;
    
    for (const [id, vector] of this.vectors) {
      if (vector.metadata.documentId === documentId) {
        this.vectors.delete(id);
        deleted++;
      }
    }
    
    return deleted;
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.vectors.delete(id);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  private matchesFilter(metadata: Record<string, any>, filter: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }

  // Utility methods for debugging
  getVectorCount(): number {
    return this.vectors.size;
  }

  clear(): void {
    this.vectors.clear();
  }
}
