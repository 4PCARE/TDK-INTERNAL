import OpenAI from "openai";
import { Document, documentVectors, InsertDocumentVector } from "@shared/schema";
import { db } from '../db';
import { eq, and, or, sql, inArray } from "drizzle-orm";

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

          // Debug: Verify chunk size before saving
          console.log(`Storing chunk ${i} for doc ${id}: ${chunk.length} chars`);
          if (chunk.length > 3500) {
            console.warn(`⚠️  CHUNK TOO LARGE: Doc ${id} chunk ${i} has ${chunk.length} chars - might be storing full document instead of chunk!`);
          }

          // Save vector to database
          await db.insert(documentVectors).values({
            documentId: parseInt(id),
            chunkIndex: i,
            totalChunks: chunks.length,
            content: chunk, // This should be the chunk content, not full document
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
    limit: number = 10,
    specificDocumentIds?: number[]
  ): Promise<Array<{ document: VectorDocument; similarity: number }>> {
    try {
      console.log(`VectorService: Using pure vector similarity search for query: "${query}"`);

      // Always use vector similarity search - no keyword prioritization

      // Get all vectors from database for this user (with optional document filtering)
      let whereCondition: any = eq(documentVectors.userId, userId);

      if (specificDocumentIds && specificDocumentIds.length > 0) {
        whereCondition = and(
          eq(documentVectors.userId, userId),
          or(...specificDocumentIds.map(id => eq(documentVectors.documentId, id)))
        );
        console.log(`VectorService: Filtering search to ${specificDocumentIds.length} specific documents: [${specificDocumentIds.join(', ')}]`);
      } else {
        console.log(`VectorService: No document ID filter applied - searching all user documents`);
      }

      const dbVectors = await db.select()
        .from(documentVectors)
        .where(whereCondition);

      console.log(`VectorService: Retrieved ${dbVectors.length} vectors from database`);
      
      // Additional filtering at database level to ensure we only get proper chunks
      const validChunks = dbVectors.filter(dbVector => {
        const isValidChunk = (
          dbVector.chunkIndex !== null && 
          dbVector.chunkIndex !== undefined &&
          dbVector.content.length <= 4000 // Reasonable chunk size limit
        );
        
        if (!isValidChunk) {
          console.warn(`⚠️ VECTOR SERVICE: Filtering out invalid chunk - Doc ${dbVector.documentId}, chunkIndex: ${dbVector.chunkIndex}, length: ${dbVector.content.length}`);
        }
        
        return isValidChunk;
      });

      console.log(`VectorService: After filtering, ${validChunks.length} valid chunks remain`);

      if (validChunks.length === 0) {
        console.log("VectorService: No valid chunks in vector database");
        return [];
      }

      // Generate embedding for the search query
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      });

      const queryEmbedding = response.data[0].embedding;

      // Calculate similarities for all chunks
      const allResults = validChunks
        .map(dbVector => {
          // Debug: Verify we're getting chunk content, not full document
          if (dbVector.content.length > 3500) {
            console.warn(`⚠️  VECTOR SERVICE: Doc ${dbVector.documentId} chunk ${dbVector.chunkIndex} has ${dbVector.content.length} chars - suspiciously large for a chunk!`);
          }

          const vectorDoc: VectorDocument = {
            id: `${dbVector.documentId}_chunk_${dbVector.chunkIndex}`,
            content: dbVector.content, // This should be chunk content from document_vectors table
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
        .filter(result => {
          // Guard against full documents masquerading as chunks
          if (
            result.document.chunkIndex === undefined || 
            result.document.content.length > 5000
          ) {
            console.warn(`⚠️ VECTOR SERVICE: Skipping full document result - not a proper chunk. Doc ${result.document.metadata.originalDocumentId}, length: ${result.document.content.length}`);
            return false;
          }
          return true;
        })
        .sort((a, b) => b.similarity - a.similarity);

      // For chatbot integration, we want top chunks globally, not per document
      console.log(`VectorService: Taking top ${limit} chunks globally from ${allResults.length} total chunks`);
      
      const combinedResults = allResults.slice(0, limit);

      // Sort by similarity and apply final limit
      const finalResults = combinedResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      console.log(`Vector search for "${query}": Found ${finalResults.length} relevant chunks globally`);

      // Debug: Log top results with similarity scores
      console.log(`Debug: Top 5 vector search results for "${query}":`);
      finalResults.slice(0, 5).forEach((result, index) => {
        console.log(`${index + 1}. Doc ID: ${result.document.metadata.originalDocumentId}, Similarity: ${result.similarity.toFixed(4)}`);
        console.log(`   Content: ${result.document.content.substring(0, 200)}...`);
        // Check if this content contains XOLO information
        if (result.document.content.includes('XOLO') || result.document.content.includes('โซโล่')) {
          console.log(`   *** FOUND XOLO CHUNK ***`);
        }
      });

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