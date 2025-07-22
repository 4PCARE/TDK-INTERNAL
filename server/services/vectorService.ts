import OpenAI from "openai";
import { Document, documentVectors, InsertDocumentVector } from "@shared/schema";
import { db } from '../db';
import { eq, and } from "drizzle-orm";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  chunkIndex?: number;
  totalChunks?: number;
}

export class VectorService {

  // Split text into chunks of approximately 3000 characters with 300 character overlap
  private splitTextIntoChunks(text: string, maxChunkSize: number = 3000, overlap: number = 300): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + maxChunkSize;
      
      // Try to break at a sentence or paragraph boundary
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        const lastNewline = text.lastIndexOf('\n', end);
        const lastBreak = Math.max(lastPeriod, lastNewline);
        
        if (lastBreak > start + maxChunkSize * 0.5) {
          end = lastBreak + 1;
        }
      }
      
      chunks.push(text.slice(start, end).trim());
      start = end - overlap;
      
      if (start >= text.length) break;
    }

    return chunks.filter(chunk => chunk.length > 50); // Filter out very small chunks
  }

  async addDocument(id: string, content: string, metadata: Record<string, any>): Promise<string> {
    try {
      // Remove existing document chunks if they exist from database
      await db.delete(documentVectors).where(eq(documentVectors.documentId, parseInt(id)));

      if (!content || content.trim().length === 0) {
        throw new Error("Document content is empty");
      }

      // Split content into chunks for better coverage
      const chunks = this.splitTextIntoChunks(content);
      console.log(`Document ${id}: Split into ${chunks.length} chunks for vector processing`);

      let addedChunks = 0;

      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        try {
          // Generate embedding for this chunk
          const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: chunk,
          });

          const embedding = response.data[0].embedding;

          // Create vector document for this chunk
          const vectorDoc: VectorDocument = {
            id: `${id}_chunk_${i}`,
            content: chunk,
            embedding,
            metadata: {
              ...metadata,
              originalDocumentId: id,
              chunkIndex: i,
              totalChunks: chunks.length,
              chunkSize: chunk.length
            },
            chunkIndex: i,
            totalChunks: chunks.length
          };

          // Save vector to database
          await db.insert(documentVectors).values({
            documentId: parseInt(id),
            chunkIndex: i,
            totalChunks: chunks.length,
            content: chunk,
            embedding,
            userId: metadata.userId
          });
          
          addedChunks++;

          // Add a small delay to avoid rate limiting
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (chunkError) {
          console.error(`Error processing chunk ${i} of document ${id}:`, chunkError);
          // Continue with next chunk instead of failing entirely
        }
      }
      
      console.log(`Document ${id}: Successfully added ${addedChunks}/${chunks.length} chunks to vector database`);
      return `Document ${id} added to vector database with ${addedChunks} chunks`;
    } catch (error) {
      console.error("Error adding document to vector database:", error);
      throw new Error("Failed to add document to vector database");
    }
  }

  async removeDocument(id: string): Promise<void> {
    try {
      // Remove all chunks related to this document
      const result = await db.delete(documentVectors)
        .where(eq(documentVectors.documentId, parseInt(id)));
      
      console.log(`Removed vector data for document ${id}`);
    } catch (error) {
      console.error(`Error removing document ${id} from vector database:`, error);
    }
  }

  async searchDocuments(
    query: string, 
    userId: string, 
    limit: number = 10
  ): Promise<Array<{ document: VectorDocument; similarity: number }>> {
    try {
      // Get all vectors from database for this user
      const dbVectors = await db.select()
        .from(documentVectors)
        .where(eq(documentVectors.userId, userId));
      
      console.log(`VectorService: Total documents in database: ${dbVectors.length}`);
      console.log(`VectorService: Documents for user ${userId}: ${dbVectors.length}`);
      
      if (dbVectors.length === 0) {
        console.log("VectorService: No documents in vector database");
        return [];
      }

      // Generate embedding for the search query
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      });

      const queryEmbedding = response.data[0].embedding;

      // Calculate similarities for all chunks
      const allResults = dbVectors
        .map(dbVector => {
          const vectorDoc: VectorDocument = {
            id: `${dbVector.documentId}_chunk_${dbVector.chunkIndex}`,
            content: dbVector.content,
            embedding: dbVector.embedding,
            metadata: {
              originalDocumentId: dbVector.documentId.toString(),
              userId: dbVector.userId,
              chunkIndex: dbVector.chunkIndex,
              totalChunks: dbVector.totalChunks
            },
            chunkIndex: dbVector.chunkIndex,
            totalChunks: dbVector.totalChunks
          };

          return {
            document: vectorDoc,
            similarity: this.cosineSimilarity(queryEmbedding, dbVector.embedding)
          };
        })
        .sort((a, b) => b.similarity - a.similarity);

      // Group by original document ID and take top chunks per document
      const documentGroups = new Map<string, Array<{ document: VectorDocument; similarity: number }>>();
      
      allResults.forEach(result => {
        const originalDocId = result.document.metadata.originalDocumentId || result.document.id;
        if (!documentGroups.has(originalDocId)) {
          documentGroups.set(originalDocId, []);
        }
        documentGroups.get(originalDocId)!.push(result);
      });

      // Take top 5 chunks per document for better coverage
      const combinedResults: Array<{ document: VectorDocument; similarity: number }> = [];
      
      documentGroups.forEach((chunks, docId) => {
        // Sort chunks by similarity and take top 5 per document (increased from 3)
        const topChunks = chunks
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5);
        
        combinedResults.push(...topChunks);
      });

      // Sort by similarity and apply final limit
      const finalResults = combinedResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      console.log(`Vector search for "${query}": Found ${finalResults.length} relevant chunks from ${documentGroups.size} documents`);
      
      return finalResults;
    } catch (error) {
      console.error("Error searching vector database:", error);
      return [];
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  async getDocumentCount(): Promise<number> {
    const result = await db.select().from(documentVectors);
    return result.length;
  }

  async getDocumentsByUser(userId: string): Promise<VectorDocument[]> {
    const dbVectors = await db.select()
      .from(documentVectors)
      .where(eq(documentVectors.userId, userId));

    return dbVectors.map(dbVector => ({
      id: `${dbVector.documentId}_chunk_${dbVector.chunkIndex}`,
      content: dbVector.content,
      embedding: dbVector.embedding,
      metadata: {
        originalDocumentId: dbVector.documentId.toString(),
        userId: dbVector.userId,
        chunkIndex: dbVector.chunkIndex,
        totalChunks: dbVector.totalChunks
      },
      chunkIndex: dbVector.chunkIndex,
      totalChunks: dbVector.totalChunks
    }));
  }

  async getDocumentChunkStats(userId: string): Promise<{ [docId: string]: { chunks: number; totalLength: number } }> {
    const dbVectors = await db.select()
      .from(documentVectors)
      .where(eq(documentVectors.userId, userId));

    const stats: { [docId: string]: { chunks: number; totalLength: number } } = {};
    
    dbVectors.forEach(dbVector => {
      const originalDocId = dbVector.documentId.toString();
      if (!stats[originalDocId]) {
        stats[originalDocId] = { chunks: 0, totalLength: 0 };
      }
      stats[originalDocId].chunks++;
      stats[originalDocId].totalLength += dbVector.content.length;
    });
    
    return stats;
  }
}

export const vectorService = new VectorService();