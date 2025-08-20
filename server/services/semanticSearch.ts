import { db } from "../db";
import { documents } from "@shared/schema";
import { embeddingService } from "./embeddings";
import { eq, sql, desc, and, or, ilike } from "drizzle-orm";

export interface SearchResult {
  id: number;
  name: string;
  content: string;
  summary?: string;
  category?: string;
  aiCategory?: string;
  similarity: number;
  chunkContent?: string;
  chunkIndex?: number;
  createdAt: string;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number; // Minimum similarity threshold
  searchType?: "semantic" | "keyword" | "hybrid";
  categoryFilter?: string;
  dateRange?: { from: Date; to: Date };
}

export class SemanticSearchService {
  private similarityThreshold = 0.9; // Default threshold for semantic similarity

  async searchDocuments(
    query: string,
    userId: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const {
      limit = 20,
      threshold = this.similarityThreshold,
      searchType = "hybrid",
      categoryFilter,
      dateRange,
    } = options;

    // Log search session (simplified for now)
    console.log(
      `Search session: ${userId} searched for "${query}" using ${searchType}`,
    );

    switch (searchType) {
      case "semantic":
        return this.performSemanticSearch(query, userId, {
          limit,
          threshold,
          categoryFilter,
          dateRange,
        });
      case "keyword":
        return this.performKeywordSearch(query, userId, {
          limit,
          categoryFilter,
          dateRange,
        });
      case "hybrid":
        return this.performHybridSearch(query, userId, {
          limit,
          threshold,
          categoryFilter,
          dateRange,
        });
      default:
        return this.performHybridSearch(query, userId, {
          limit,
          threshold,
          categoryFilter,
          dateRange,
        });
    }
  }

  private async performSemanticSearch(
    query: string,
    userId: string,
    options: Omit<SearchOptions, "searchType">,
  ): Promise<SearchResult[]> {
    const {
      limit = 20,
      threshold = this.similarityThreshold,
      categoryFilter,
      dateRange,
    } = options;

    try {
      // Generate embedding for the query
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Get documents with content for semantic search
      let documentsQuery = db
        .select({
          id: documents.id,
          name: documents.name,
          content: documents.content,
          summary: documents.summary,
          aiCategory: documents.aiCategory,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(
          and(
            eq(documents.userId, userId),
            sql`${documents.content} IS NOT NULL AND LENGTH(${documents.content}) > 0`,
          ),
        );

      // Apply category filter by rebuilding the query
      if (categoryFilter && categoryFilter !== "all") {
        documentsQuery = db
          .select({
            id: documents.id,
            name: documents.name,
            content: documents.content,
            summary: documents.summary,
            aiCategory: documents.aiCategory,
            createdAt: documents.createdAt,
          })
          .from(documents)
          .where(
            and(
              eq(documents.userId, userId),
              sql`${documents.content} IS NOT NULL AND LENGTH(${documents.content}) > 0`,
              eq(documents.aiCategory, categoryFilter),
            ),
          );
      }

      if (dateRange) {
        documentsQuery = documentsQuery.where(
          and(
            eq(documents.userId, userId),
            sql`${documents.embedding} IS NOT NULL`,
            sql`${documents.createdAt} >= ${dateRange.from}`,
            sql`${documents.createdAt} <= ${dateRange.to}`,
          ),
        );
      }

      const documentsWithEmbeddings = await documentsQuery;

      // Calculate similarities and sort
      const results: SearchResult[] = [];

      for (const doc of documentsWithEmbeddings) {
        if (!doc.embedding) continue;

        try {
          const docEmbedding = JSON.parse(doc.embedding);
          const similarity = embeddingService.calculateSimilarity(
            queryEmbedding,
            docEmbedding,
          );

          if (similarity >= threshold) {
            results.push({
              id: doc.id,
              name: doc.name,
              content: doc.content || "",
              summary: doc.summary || undefined,
              category: doc.category || undefined,
              aiCategory: doc.aiCategory || undefined,
              similarity,
              createdAt: doc.createdAt?.toISOString() || "",
            });
          }
        } catch (error) {
          console.error(
            `Error parsing embedding for document ${doc.id}:`,
            error,
          );
        }
      }

      // Sort by similarity (highest first) and limit results
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      console.error("Error performing semantic search:", error);
      throw new Error("Failed to perform semantic search");
    }
  }

  private async performKeywordSearch(
    query: string,
    userId: string,
    options: Omit<SearchOptions, "searchType">,
  ): Promise<SearchResult[]> {
    const { limit = 20, categoryFilter, dateRange } = options;

    try {
      const searchTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 2);

      let whereConditions = eq(documents.userId, userId);

      // Add text search conditions
      if (searchTerms.length > 0) {
        const searchConditions = searchTerms.map((term) =>
          or(
            ilike(documents.name, `%${term}%`),
            ilike(documents.content, `%${term}%`),
            ilike(documents.summary, `%${term}%`),
            sql`${documents.tags} && ARRAY[${term}]::text[]`,
          ),
        );
        whereConditions = and(whereConditions, or(...searchConditions));
      }

      // Apply filters
      if (categoryFilter && categoryFilter !== "all") {
        whereConditions = and(
          whereConditions,
          or(
            eq(documents.category, categoryFilter),
            eq(documents.aiCategory, categoryFilter),
          ),
        );
      }

      if (dateRange) {
        whereConditions = and(
          whereConditions,
          sql`${documents.createdAt} >= ${dateRange.from}`,
          sql`${documents.createdAt} <= ${dateRange.to}`,
        );
      }

      const results = await db
        .select({
          id: documents.id,
          name: documents.name,
          content: documents.content,
          summary: documents.summary,
          category: documents.category,
          aiCategory: documents.aiCategory,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(whereConditions)
        .orderBy(desc(documents.createdAt))
        .limit(limit);

      return results.map((doc) => ({
        id: doc.id,
        name: doc.name,
        content: doc.content || "",
        summary: doc.summary || undefined,
        category: doc.category || undefined,
        aiCategory: doc.aiCategory || undefined,
        similarity: 0.8, // Fixed similarity for keyword search
        createdAt: doc.createdAt?.toISOString() || "",
      }));
    } catch (error) {
      console.error("Error performing keyword search:", error);
      throw new Error("Failed to perform keyword search");
    }
  }

  private async performHybridSearch(
    query: string,
    userId: string,
    options: Omit<SearchOptions, "searchType">,
  ): Promise<SearchResult[]> {
    const { limit = 20 } = options;
    const halfLimit = Math.ceil(limit / 2);

    try {
      // Get results from both semantic and keyword search
      const [semanticResults, keywordResults] = await Promise.all([
        this.performSemanticSearch(query, userId, {
          ...options,
          limit: halfLimit,
        }),
        this.performKeywordSearch(query, userId, {
          ...options,
          limit: halfLimit,
        }),
      ]);

      // Combine and deduplicate results
      const combinedResults = new Map<number, SearchResult>();

      // Add semantic results with higher weight
      semanticResults.forEach((result) => {
        combinedResults.set(result.id, {
          ...result,
          similarity: result.similarity * 1.2, // Boost semantic results
        });
      });

      // Add keyword results, boosting if not already present
      keywordResults.forEach((result) => {
        if (combinedResults.has(result.id)) {
          // Combine scores if document appears in both results
          const existing = combinedResults.get(result.id)!;
          existing.similarity = Math.min(1.0, existing.similarity + 0.2);
        } else {
          combinedResults.set(result.id, result);
        }
      });

      // Sort by combined similarity and limit
      return Array.from(combinedResults.values())
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      console.error("Error performing hybrid search:", error);
      throw new Error("Failed to perform hybrid search");
    }
  }

  async generateDocumentEmbedding(documentId: number): Promise<void> {
    try {
      const [document] = await db
        .select({
          id: documents.id,
          content: documents.content,
          name: documents.name,
          summary: documents.summary,
        })
        .from(documents)
        .where(eq(documents.id, documentId));

      if (!document) {
        throw new Error("Document not found");
      }

      // Combine document text for embedding
      const textToEmbed = [
        document.name,
        document.summary || "",
        document.content || "",
      ]
        .filter(Boolean)
        .join("\n\n");

      if (!textToEmbed.trim()) {
        console.warn(`No content to embed for document ${documentId}`);
        return;
      }

      // Generate embedding
      const embedding = await embeddingService.generateEmbedding(textToEmbed);

      // Update document with embedding
      await db
        .update(documents)
        .set({
          embedding: JSON.stringify(embedding),
          embeddingModel: embeddingService.getModel(),
          lastEmbeddingUpdate: new Date(),
          isInVectorDb: true,
        })
        .where(eq(documents.id, documentId));

      // Generate chunk embeddings for better search granularity
      await this.generateChunkEmbeddings(documentId, document.content || "");
    } catch (error) {
      console.error(
        `Error generating embedding for document ${documentId}:`,
        error,
      );
      throw error;
    }
  }

  private async generateChunkEmbeddings(
    documentId: number,
    content: string,
  ): Promise<void> {
    try {
      if (!content || content.trim().length === 0) {
        return;
      }

      // Delete existing chunks
      await db
        .delete(documentChunks)
        .where(eq(documentChunks.documentId, documentId));

      // Chunk the content
      const chunks = embeddingService.chunkText(content);

      if (chunks.length === 0) {
        return;
      }

      // Generate embeddings for chunks
      const embeddings = await embeddingService.generateEmbeddings(chunks);

      // Insert chunks with embeddings
      const chunkInserts = chunks.map((chunk, index) => ({
        documentId,
        chunkIndex: index,
        content: chunk,
        embedding: JSON.stringify(embeddings[index]),
        startPosition: 0, // TODO: Calculate actual positions
        endPosition: chunk.length,
        tokenCount: Math.ceil(chunk.length / 4), // Rough token estimate
      }));

      if (chunkInserts.length > 0) {
        await db.insert(documentChunks).values(chunkInserts);
      }
    } catch (error) {
      console.error(
        `Error generating chunk embeddings for document ${documentId}:`,
        error,
      );
    }
  }

  private async logSearchSession(
    query: string,
    userId: string,
    searchType: string,
  ): Promise<void> {
    try {
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      await db.insert(searchSessions).values({
        userId,
        query,
        searchType,
        queryEmbedding: JSON.stringify(queryEmbedding),
        resultsCount: 0, // Will be updated later
      });
    } catch (error) {
      console.error("Error logging search session:", error);
      // Don't throw error for logging failures
    }
  }

  async reindexAllDocuments(
    userId: string,
  ): Promise<{ processed: number; failed: number }> {
    try {
      const userDocuments = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.userId, userId));

      let processed = 0;
      let failed = 0;

      for (const doc of userDocuments) {
        try {
          await this.generateDocumentEmbedding(doc.id);
          processed++;
        } catch (error) {
          console.error(`Failed to reindex document ${doc.id}:`, error);
          failed++;
        }
      }

      return { processed, failed };
    } catch (error) {
      console.error("Error reindexing documents:", error);
      throw new Error("Failed to reindex documents");
    }
  }
}

// Export singleton instance
export const semanticSearchService = new SemanticSearchService();
