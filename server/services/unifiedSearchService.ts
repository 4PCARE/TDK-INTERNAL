import { semanticSearchServiceV2 } from './semanticSearchV2';
import { queryAugmentationService } from './queryAugmentationService';

export interface UnifiedSearchOptions {
  searchType: 'semantic' | 'keyword' | 'hybrid';
  limit?: number;
  keywordWeight?: number;
  vectorWeight?: number;
  specificDocumentIds?: number[];
  enableQueryAugmentation?: boolean;
  chatType?: string;
  contextId?: string;
  agentId?: number;
}

export interface UnifiedSearchResult {
  id: number;
  name: string;
  content: string;
  summary: string | null;
  aiCategory: string | null;
  aiCategoryColor: string | null;
  similarity: number;
  createdAt: string;
  categoryId: number | null;
  tags: string[] | null;
  fileSize: number | null;
  mimeType: string | null;
  isFavorite: boolean | null;
  updatedAt: string | null;
  userId: string;
}

/**
 * Unified Search Service
 * 
 * This is the single source of truth for all search operations in the application.
 * All components (Line OA, Widget Chat, Agent Console, Document Chat) should use this service.
 * 
 * Key Features:
 * - Hybrid search combining keyword and vector similarity
 * - Global chunk ranking (returns top N chunks across ALL documents)
 * - Document filtering by specific document IDs
 * - Consistent search behavior across all platforms
 */
export class UnifiedSearchService {

  /**
   * Perform search using the unified search system with optional query augmentation
   * 
   * @param query - The search query
   * @param userId - User ID for document filtering
   * @param options - Search configuration options
   * @returns Array of search results, globally ranked and limited
   */
  async searchDocuments(
    query: string,
    userId: string,
    options: UnifiedSearchOptions
  ): Promise<UnifiedSearchResult[]> {

    console.log(`🔍 Unified Search: "${query}" | Type: ${options.searchType} | Limit: ${options.limit || 2} | User: ${userId}`);

    if (options.specificDocumentIds && options.specificDocumentIds.length > 0) {
      console.log(`📋 Unified Search: Filtering to ${options.specificDocumentIds.length} specific documents: [${options.specificDocumentIds.join(', ')}]`);
      console.log(`🎯 Unified Search: Document IDs being passed to semanticSearchV2: ${JSON.stringify(options.specificDocumentIds)}`);
    } else {
      console.log(`⚠️ Unified Search: No document ID filter specified - searching ALL user documents`);
    }

    let finalQuery = query;
    let searchKeywords: string[] = [];

    // Apply query augmentation if enabled
    if (options.enableQueryAugmentation) {
      try {
        console.log(`🧠 Query Augmentation: Enabled for "${query}"`);

        const augmentationResult = await queryAugmentationService.augmentQuery(
          query,
          userId,
          options.chatType || "general",
          options.contextId || "general",
          options.agentId || undefined, // Pass the agent ID for proper history retrieval
          10 // Analyze last 10 messages
        );

        if (augmentationResult.shouldUseAugmented && augmentationResult.confidence >= 0.6) {
          finalQuery = augmentationResult.augmentedQuery;
          searchKeywords = augmentationResult.extractedKeywords;

          console.log(`✅ Query Augmentation: Applied (confidence: ${augmentationResult.confidence.toFixed(2)})`);
          console.log(`   📝 Original: "${query}"`);
          console.log(`   🎯 Augmented: "${finalQuery}"`);
          console.log(`   🔑 Keywords: [${searchKeywords.join(', ')}]`);
          console.log(`   💡 Insights: ${augmentationResult.contextualInsights}`);
        } else {
          console.log(`⚠️ Query Augmentation: Low confidence (${augmentationResult.confidence.toFixed(2)}), using original query`);
        }
      } catch (error) {
        console.error("❌ Query Augmentation: Failed, falling back to original query", error);
      }
    }

    try {
      // Use semantic search V2 for all search types
      const results = await semanticSearchServiceV2.searchDocuments(
        finalQuery, // Use augmented query if available
        userId,
        {
          searchType: options.searchType,
          limit: options.limit || 2, // Default to 2 chunks globally
          keywordWeight: options.keywordWeight || 0.4,
          vectorWeight: options.vectorWeight || 0.6,
          specificDocumentIds: options.specificDocumentIds
        }
      );

      // Additional logging to verify document filtering is working
      if (options.specificDocumentIds && options.specificDocumentIds.length > 0) {
        const resultDocIds = [...new Set(results.map(r => r.id))];
        console.log(`🔍 Unified Search: Results came from document IDs: [${resultDocIds.join(', ')}]`);

        // Check if any results came from outside the specified documents
        const outsideResults = resultDocIds.filter(id => !options.specificDocumentIds!.includes(id));
        if (outsideResults.length > 0) {
          console.log(`⚠️ Unified Search: WARNING - Found results from unfiltered documents: [${outsideResults.join(', ')}]`);
        } else {
          console.log(`✅ Unified Search: Document filtering working correctly - all results from specified documents`);
        }
      }

      const totalChars = results.map(r => (r.content || '').length).reduce((a, b) => a + b, 0);
      console.log(`✅ Unified Search: Found ${results.length} results (${totalChars} total characters)`);

      // Log search results for debugging
      results.forEach((result, index) => {
        const contentLength = (result.content || '').length;
        console.log(`${index + 1}. Doc ${result.id}: "${result.name}" (${contentLength} chars, similarity: ${result.similarity.toFixed(3)})`);
      });

      return results;

    } catch (error) {
      console.error("❌ Unified Search: Search failed:", error);
      throw new Error("Search operation failed");
    }
  }

  /**
   * Search for content within a specific document only
   * 
   * @param query - The search query
   * @param userId - User ID for document access
   * @param documentId - Specific document ID to search within
   * @param options - Search configuration options
   * @returns Array of search results from the specific document only
   */
  async searchWithinDocument(
    query: string,
    userId: string,
    documentId: number,
    options: Omit<UnifiedSearchOptions, 'specificDocumentIds'> = { searchType: 'hybrid' }
  ): Promise<UnifiedSearchResult[]> {

    console.log(`🎯 Unified Search (Document-specific): "${query}" in document ${documentId}`);

    return this.searchDocuments(query, userId, {
      ...options,
      specificDocumentIds: [documentId]
    });
  }

  /**
   * Search for content within specific agent documents
   * 
   * @param query - The search query
   * @param userId - User ID for document access
   * @param agentDocumentIds - Array of document IDs assigned to the agent
   * @param options - Search configuration options
   * @returns Array of search results from the agent's documents only
   */
  async searchAgentDocuments(
    query: string,
    userId: string,
    agentDocumentIds: number[],
    options: Omit<UnifiedSearchOptions, 'specificDocumentIds'> = { searchType: 'hybrid' }
  ): Promise<UnifiedSearchResult[]> {

    console.log(`🤖 Unified Search (Agent-specific): "${query}" in ${agentDocumentIds.length} agent documents`);

    return this.searchDocuments(query, userId, {
      ...options,
      specificDocumentIds: agentDocumentIds
    });
  }


}

// Export singleton instance
export const unifiedSearchService = new UnifiedSearchService();