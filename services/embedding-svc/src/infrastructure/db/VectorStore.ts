
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
  private vectors: Map<string, VectorDocument> = new Map();

  async upsert(vectors: VectorDocument[]): Promise<void> {
    for (const vector of vectors) {
      this.vectors.set(vector.id, vector);
    }
    console.log(`✅ Upserted ${vectors.length} vectors`);
  }

  async search(queryVector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.7, filter } = options;
    const results: SearchResult[] = [];

    for (const [id, doc] of this.vectors) {
      // Apply filters if provided
      if (filter && !this.matchesFilter(doc.metadata, filter)) {
        continue;
      }

      const similarity = this.calculateCosineSimilarity(queryVector, doc.vector);
      
      if (similarity >= threshold) {
        results.push({
          id,
          score: similarity,
          metadata: doc.metadata
        });
      }
    }

    // Sort by similarity score (highest first) and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async getByDocumentId(documentId: number): Promise<VectorDocument[]> {
    const results: VectorDocument[] = [];
    
    for (const [id, doc] of this.vectors) {
      if (doc.metadata.documentId === documentId) {
        results.push(doc);
      }
    }

    return results.sort((a, b) => 
      (a.metadata.chunkIndex || 0) - (b.metadata.chunkIndex || 0)
    );
  }

  async deleteByDocumentId(documentId: number): Promise<number> {
    let deletedCount = 0;
    
    for (const [id, doc] of this.vectors) {
      if (doc.metadata.documentId === documentId) {
        this.vectors.delete(id);
        deletedCount++;
      }
    }

    console.log(`🗑️ Deleted ${deletedCount} vectors for document ${documentId}`);
    return deletedCount;
  }

  async delete(id: string): Promise<boolean> {
    return this.vectors.delete(id);
  }

  async clear(): Promise<void> {
    this.vectors.clear();
    console.log('🧹 Cleared all vectors');
  }

  async count(): Promise<number> {
    return this.vectors.size;
  }

  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
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

  // Debug methods
  getStats(): { totalVectors: number; uniqueDocuments: number } {
    const documentIds = new Set();
    for (const doc of this.vectors.values()) {
      if (doc.metadata.documentId) {
        documentIds.add(doc.metadata.documentId);
      }
    }

    return {
      totalVectors: this.vectors.size,
      uniqueDocuments: documentIds.size
    };
  }
}
