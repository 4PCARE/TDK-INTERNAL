import { llmRouter } from "./llmRouter";
import { db } from "../db";
import { documentChunkEmbeddings, documents } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface EmbeddingChunk {
  documentId: number;
  chunkIndex: number;
  text: string;
  embedding: number[];
  provider: string;
  model: string;
}

export class EnhancedEmbeddingService {
  async generateDocumentEmbeddings(
    documentId: number,
    chunks: string[],
    userId: string
  ): Promise<EmbeddingChunk[]> {
    try {
      console.log(`🔢 Generating embeddings for document ${documentId} with ${chunks.length} chunks`);

      // Load user's LLM configuration
      const config = await llmRouter.loadUserConfig(userId);
      const provider = config.embeddingProvider;
      const model = this.getEmbeddingModel(provider);

      // Generate embeddings using LLM router
      const embeddings = await llmRouter.generateEmbeddings(chunks, userId);

      const embeddingChunks: EmbeddingChunk[] = [];

      // Store embeddings in database
      for (let i = 0; i < chunks.length; i++) {
        const embeddingData = {
          documentId,
          chunkIndex: i,
          embedding: JSON.stringify(embeddings[i]),
          embeddingProvider: provider,
          embeddingModel: model,
          chunkText: chunks[i],
        };

        // Check if embedding already exists for this chunk and provider
        const [existingEmbedding] = await db
          .select()
          .from(documentChunkEmbeddings)
          .where(
            and(
              eq(documentChunkEmbeddings.documentId, documentId),
              eq(documentChunkEmbeddings.chunkIndex, i),
              eq(documentChunkEmbeddings.embeddingProvider, provider)
            )
          );

        if (existingEmbedding) {
          // Update existing embedding
          await db
            .update(documentChunkEmbeddings)
            .set({
              embedding: embeddingData.embedding,
              embeddingModel: embeddingData.embeddingModel,
              chunkText: embeddingData.chunkText,
              updatedAt: new Date(),
            })
            .where(eq(documentChunkEmbeddings.id, existingEmbedding.id));
        } else {
          // Insert new embedding
          await db.insert(documentChunkEmbeddings).values(embeddingData);
        }

        embeddingChunks.push({
          documentId,
          chunkIndex: i,
          text: chunks[i],
          embedding: embeddings[i],
          provider,
          model,
        });
      }

      console.log(`✅ Generated and stored ${embeddingChunks.length} embeddings using ${provider}`);
      return embeddingChunks;
    } catch (error) {
      console.error("Error generating document embeddings:", error);
      throw new Error("Failed to generate document embeddings");
    }
  }

  async getDocumentEmbeddings(
    documentId: number,
    userId: string
  ): Promise<EmbeddingChunk[]> {
    try {
      const config = await llmRouter.loadUserConfig(userId);
      const provider = config.embeddingProvider;

      const embeddings = await db
        .select()
        .from(documentChunkEmbeddings)
        .where(
          and(
            eq(documentChunkEmbeddings.documentId, documentId),
            eq(documentChunkEmbeddings.embeddingProvider, provider)
          )
        )
        .orderBy(documentChunkEmbeddings.chunkIndex);

      return embeddings.map(e => ({
        documentId: e.documentId,
        chunkIndex: e.chunkIndex,
        text: e.chunkText,
        embedding: JSON.parse(e.embedding),
        provider: e.embeddingProvider,
        model: e.embeddingModel,
      }));
    } catch (error) {
      console.error("Error retrieving document embeddings:", error);
      throw new Error("Failed to retrieve document embeddings");
    }
  }

  async searchSimilarChunks(
    queryEmbedding: number[],
    userId: string,
    options: {
      limit?: number;
      threshold?: number;
      documentIds?: number[];
    } = {}
  ): Promise<Array<EmbeddingChunk & { similarity: number }>> {
    try {
      const config = await llmRouter.loadUserConfig(userId);
      const provider = config.embeddingProvider;
      const { limit = 10, threshold = 0.7, documentIds } = options;

      let query = db
        .select()
        .from(documentChunkEmbeddings)
        .where(eq(documentChunkEmbeddings.embeddingProvider, provider));

      // Filter by document IDs if provided
      if (documentIds && documentIds.length > 0) {
        query = query.where(
          and(
            eq(documentChunkEmbeddings.embeddingProvider, provider),
            // Note: This would need proper implementation with IN clause
            // For now, we'll handle filtering after the query
          )
        );
      }

      const embeddings = await query;

      // Calculate similarities and filter
      const similarities = embeddings
        .map(e => {
          const embedding = JSON.parse(e.embedding);
          const similarity = this.calculateCosineSimilarity(queryEmbedding, embedding);
          
          return {
            documentId: e.documentId,
            chunkIndex: e.chunkIndex,
            text: e.chunkText,
            embedding,
            provider: e.embeddingProvider,
            model: e.embeddingModel,
            similarity,
          };
        })
        .filter(item => {
          // Apply document ID filter if specified
          if (documentIds && documentIds.length > 0) {
            return documentIds.includes(item.documentId) && item.similarity >= threshold;
          }
          return item.similarity >= threshold;
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      console.log(`🔍 Found ${similarities.length} similar chunks using ${provider} embeddings`);
      return similarities;
    } catch (error) {
      console.error("Error searching similar chunks:", error);
      throw new Error("Failed to search similar chunks");
    }
  }

  async reembedAllDocuments(userId: string): Promise<void> {
    try {
      console.log(`🔄 Starting re-embedding process for user ${userId}`);

      const config = await llmRouter.loadUserConfig(userId);
      const newProvider = config.embeddingProvider;

      // Get all user documents that need re-embedding
      const userDocuments = await db
        .select({ id: documents.id, content: documents.content })
        .from(documents)
        .where(eq(documents.userId, userId));

      console.log(`📚 Found ${userDocuments.length} documents to re-embed`);

      for (const doc of userDocuments) {
        if (!doc.content) continue;

        // Delete existing embeddings for this document
        await db
          .delete(documentChunkEmbeddings)
          .where(eq(documentChunkEmbeddings.documentId, doc.id));

        // Chunk the content and generate new embeddings
        const chunks = this.chunkText(doc.content);
        await this.generateDocumentEmbeddings(doc.id, chunks, userId);

        console.log(`✅ Re-embedded document ${doc.id} with ${chunks.length} chunks`);
      }

      console.log(`🎉 Completed re-embedding process for user ${userId}`);
    } catch (error) {
      console.error("Error re-embedding documents:", error);
      throw new Error("Failed to re-embed documents");
    }
  }

  private getEmbeddingModel(provider: string): string {
    switch (provider) {
      case "OpenAI":
        return "text-embedding-3-small";
      case "Gemini":
        return "text-embedding-004";
      default:
        return "text-embedding-3-small";
    }
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

  private chunkText(text: string, maxTokens: number = 500): string[] {
    // Simple chunking by paragraphs and sentences
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = "";

    for (const paragraph of paragraphs) {
      const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 0);
      
      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (!trimmedSentence) continue;

        // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
        const estimatedTokens = (currentChunk + " " + trimmedSentence).length / 4;

        if (estimatedTokens > maxTokens && currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = trimmedSentence;
        } else {
          currentChunk += (currentChunk ? " " : "") + trimmedSentence;
        }
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text]; // Fallback to original text if chunking fails
  }
}

export const enhancedEmbeddingService = new EnhancedEmbeddingService();