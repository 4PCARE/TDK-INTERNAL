import { Document } from "@shared/schema";
import { vectorService } from './vectorService';
import { storage } from '../storage';

export interface SearchResult {
  id: number;
  name: string;
  content: string;
  summary?: string | null;
  aiCategory?: string | null;
  aiCategoryColor?: string | null;
  similarity: number;
  createdAt: string;
  // Include all fields needed for proper display (matching DocumentCard interface)
  categoryId?: number | null;
  tags?: string[] | null;
  fileSize?: number; // Changed from size to fileSize
  mimeType?: string; // Changed from fileType to mimeType
  isFavorite?: boolean | null;
  updatedAt?: string | null;
  userId?: string;
}

export interface SearchOptions {
  searchType: 'semantic' | 'keyword' | 'hybrid';
  limit?: number;
  threshold?: number;
  categoryFilter?: string;
  dateRange?: {
    from: Date;
    to: Date;
  };
  keywordWeight?: number;
  vectorWeight?: number;
  specificDocumentIds?: number[];
}

export class SemanticSearchServiceV2 {
  private similarityThreshold = 0.2;

  async searchDocuments(
    query: string,
    userId: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const { searchType, limit = 20, threshold = this.similarityThreshold } = options;

    try {
      if (searchType === 'semantic') {
        return await this.performSemanticSearch(query, userId, options);
      } else if (searchType === 'keyword') {
        return await this.performKeywordSearch(query, userId, options);
      } else { // hybrid
        return await this.performHybridSearch(query, userId, options);
      }
    } catch (error) {
      console.error("Error in semantic search:", error);
      throw error;
    }
  }

  private async performSemanticSearch(
    query: string,
    userId: string,
    options: Omit<SearchOptions, "searchType">
  ): Promise<SearchResult[]> {
    const { limit = 20, threshold = this.similarityThreshold } = options;

    try {
      // Use vector service for semantic search
      console.log(`SemanticSearchV2: Searching for "${query}" for user ${userId}`);
      const vectorResults = await vectorService.searchDocuments(
        query, 
        userId, 
        limit * 2, 
        options.specificDocumentIds
      );
      console.log(`SemanticSearchV2: Vector service returned ${vectorResults.length} results`);

      if (vectorResults.length === 0) {
        console.log("SemanticSearchV2: No vector results found");
        return []; // Semantic search should return empty when no vector data
      }

      // Get unique document IDs from vector results
      const documentIds = [...new Set(vectorResults.map(result => 
        parseInt(result.document.metadata.originalDocumentId || result.document.id)
      ))];

      // Get document details from storage
      const documents = await storage.getDocuments(userId, { limit: 1000 });
      const docMap = new Map(documents.map(doc => [doc.id, doc]));

      // Combine vector results with document data
      const results: SearchResult[] = [];
      const processedDocs = new Set<number>();

      for (const vectorResult of vectorResults) {
        const originalDocId = vectorResult.document.metadata?.originalDocumentId || vectorResult.document.id;
        const docId = originalDocId ? parseInt(originalDocId) : null;

        if (!docId) {
          console.warn("SemanticSearchV2: Skipping vector result with no document ID");
          continue;
        }

        const doc = docMap.get(docId);

        if (doc && vectorResult.similarity >= 0 && !processedDocs.has(docId)) { // Always include results, filter later
          // Apply filters
          if (options.categoryFilter && options.categoryFilter !== "all" && 
              doc.aiCategory !== options.categoryFilter) {
            continue;
          }

          if (options.dateRange) {
            const docDate = new Date(doc.createdAt);
            if (docDate < options.dateRange.from || docDate > options.dateRange.to) {
              continue;
            }
          }

          // Use chunk content if available, otherwise use document content
          const contentToUse = vectorResult.content || vectorResult.document?.content || doc.content || "";

          results.push({
            id: doc.id,
            name: doc.name || `Document ${doc.id}`,
            content: contentToUse,
            summary: doc.summary,
            aiCategory: doc.aiCategory,
            aiCategoryColor: doc.aiCategoryColor,
            similarity: vectorResult.similarity || 0,
            createdAt: doc.createdAt.toISOString(),
            // Include all fields needed for proper display (matching DocumentCard interface)
            categoryId: doc.categoryId,
            tags: doc.tags,
            fileSize: doc.fileSize, // Changed from size to fileSize
            mimeType: doc.mimeType, // Changed from fileType to mimeType
            isFavorite: doc.isFavorite,
            updatedAt: doc.updatedAt?.toISOString() || null,
            userId: doc.userId
          });

          processedDocs.add(docId);
        }
      }

      // Sort by similarity and limit results
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
    options: Omit<SearchOptions, "searchType">
  ): Promise<SearchResult[]> {
    try {
      // Use the new advanced keyword search service
      const { advancedKeywordSearchService } = await import('./advancedKeywordSearch');
      const results = await advancedKeywordSearchService.searchDocuments(
        query,
        userId,
        options.limit || 20,
        options.specificDocumentIds
      );

      // Convert to the expected SearchResult format
      const searchResults: SearchResult[] = results.map(result => ({
        id: result.id,
        name: result.name,
        content: result.content,
        summary: result.summary,
        aiCategory: result.aiCategory,
        aiCategoryColor: null, // Will be filled from original document if available
        similarity: result.similarity,
        createdAt: result.createdAt,
        categoryId: null,
        tags: null,
        fileSize: null,
        mimeType: null,
        isFavorite: null,
        updatedAt: null,
        userId: userId
      }));

      // Get full document details to fill missing fields
      const documents = await storage.getDocuments(userId, { limit: 1000 });
      const docMap = new Map(documents.map(doc => [doc.id, doc]));

      // Fill in missing fields from original documents
      searchResults.forEach(result => {
        const originalDoc = docMap.get(result.id);
        if (originalDoc) {
          result.aiCategoryColor = originalDoc.aiCategoryColor;
          result.categoryId = originalDoc.categoryId;
          result.tags = originalDoc.tags;
          result.fileSize = originalDoc.fileSize;
          result.mimeType = originalDoc.mimeType;
          result.isFavorite = originalDoc.isFavorite;
          result.updatedAt = originalDoc.updatedAt?.toISOString() || null;
        }
      });

      console.log(`Advanced keyword search returned ${searchResults.length} results`);
      return searchResults;

    } catch (error) {
      console.error("Error performing advanced keyword search:", error);
      // Fallback to basic search if advanced search fails
      return this.performBasicKeywordSearch(query, userId, options);
    }
  }

  private async performBasicKeywordSearch(
    query: string,
    userId: string,
    options: Omit<SearchOptions, "searchType">
  ): Promise<SearchResult[]> {
    try {
      let documents = await storage.searchDocuments(userId, query);

      // Filter by specific document IDs if provided
      if (options.specificDocumentIds && options.specificDocumentIds.length > 0) {
        documents = documents.filter(doc => options.specificDocumentIds!.includes(doc.id));
        console.log(`Filtered to ${documents.length} documents from specific IDs: [${options.specificDocumentIds.join(', ')}]`);
      }

      // Calculate keyword matching score for each document
      const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

      return documents.map(doc => {
        // Calculate how many keywords match in this document
        const docText = [
          doc.name || "",
          doc.content || "",
          doc.summary || "",
          doc.aiCategory || "",
          ...(doc.tags || [])
        ].join(" ").toLowerCase();

        const matchingTerms = searchTerms.filter(term => 
          docText.includes(term.toLowerCase())
        );

        // Calculate similarity score based on keyword match ratio
        const similarity = matchingTerms.length / searchTerms.length;

        console.log(`Document ${doc.id}: ${matchingTerms.length}/${searchTerms.length} keywords matched, similarity: ${similarity.toFixed(2)}`);

        return {
          id: doc.id,
          name: doc.name,
          content: doc.content || "",
          summary: doc.summary,
          aiCategory: doc.aiCategory,
          aiCategoryColor: doc.aiCategoryColor,
          similarity: similarity,
          createdAt: doc.createdAt.toISOString(),
          categoryId: doc.categoryId,
          tags: doc.tags,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          isFavorite: doc.isFavorite,
          updatedAt: doc.updatedAt?.toISOString() || null,
          userId: doc.userId
        };
      }).sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      console.error("Error performing basic keyword search:", error);
      throw new Error("Failed to perform keyword search");
    }
  }

  private async performHybridSearch(
    query: string,
    userId: string,
    options: Omit<SearchOptions, "searchType">
  ): Promise<SearchResult[]> {
    const { 
      limit = 20, 
      threshold = this.similarityThreshold,
      keywordWeight = 0.4,
      vectorWeight = 0.6
    } = options;

    console.log(`🔍 HYBRID SEARCH WORKFLOW: Starting for "${query}"`);
    console.log(`⚖️ WEIGHTS: Keyword=${keywordWeight}, Vector=${vectorWeight}, Threshold=${threshold}`);

    try {
      // Get documents for mapping vector results to proper document data
      const documents = await storage.getDocuments(userId, { limit: 1000 });
      const docMap = new Map(documents.map(doc => [doc.id, doc]));

      // Step 3A: Perform Keyword Search (get ALL results without threshold filtering)
      console.log(`🔍 Step 3A: Performing keyword search...`);
      const keywordResults = await this.performKeywordSearch(query, userId, { 
        ...options, 
        limit: limit * 3, // Get more results for combination
        threshold: 0 // Don't filter during individual searches
      });
      console.log(`✅ Step 3A Complete: Found ${keywordResults.length} keyword results`);

      // Step 3B: Semantic/Vector Search
      console.log(`🔍 Step 3B: Performing semantic/vector search...`);
      console.log(`SemanticSearchV2: Searching for "${query}" for user ${userId}`);

      if (options.specificDocumentIds && options.specificDocumentIds.length > 0) {
        console.log(`🎯 SemanticSearchV2: Passing document ID filter to vector service: [${options.specificDocumentIds.join(', ')}]`);
      } else {
        console.log(`⚠️ SemanticSearchV2: No document ID filter - will search ALL user documents`);
      }

      // Use vector search for semantic similarity
      const vectorResults = await vectorService.searchDocuments(
        query, 
        userId, 
        limit,
        options.specificDocumentIds // Pass document filtering to vector service
      );
      console.log(`✅ Step 3B Complete: Found ${vectorResults.length} semantic results`);

      // Step 4: Aggregate scores with weighted calculation for each chunk
      console.log(`🔍 Step 4: Aggregating scores with weighted calculation...`);
      const combinedResults = new Map<number, SearchResult>();

      // Process semantic results first (apply vector weight)
      vectorResults.forEach(result => {
        const originalDocId = parseInt(result.document.metadata?.originalDocumentId || result.document.id);
        const chunkIndex = result.document.metadata?.chunkIndex || result.document.chunkIndex || 0;
        const weightedScore = result.similarity * vectorWeight;
        console.log(`📊 Vector: Doc ${originalDocId} (chunk ${chunkIndex}) = ${result.similarity.toFixed(3)} × ${vectorWeight} = ${weightedScore.toFixed(3)}`);

        const doc = docMap.get(originalDocId);
        if (doc) {
          combinedResults.set(originalDocId, {
            id: originalDocId,
            name: doc.name,
            content: result.document.content,
            summary: doc.summary,
            aiCategory: doc.aiCategory,
            aiCategoryColor: doc.aiCategoryColor,
            similarity: weightedScore,
            createdAt: doc.createdAt.toISOString(),
            categoryId: doc.categoryId,
            tags: doc.tags,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            isFavorite: doc.isFavorite,
            updatedAt: doc.updatedAt?.toISOString() || null,
            userId: doc.userId
          });
        }
      });

      // Process keyword results and combine (apply keyword weight)
      keywordResults.forEach(result => {
        const weightedKeywordScore = result.similarity * keywordWeight;
        
        // Find the corresponding vector result to get chunk info
        const vectorResult = vectorResults.find(vr => 
          parseInt(vr.document.metadata?.originalDocumentId || vr.document.id) === result.id
        );
        const chunkIndex = vectorResult?.document.metadata?.chunkIndex || vectorResult?.document.chunkIndex || 0;
        
        console.log(`📊 Keyword: Doc ${result.id} (chunk ${chunkIndex}) = ${result.similarity.toFixed(3)} × ${keywordWeight} = ${weightedKeywordScore.toFixed(3)}`);

        const existing = combinedResults.get(result.id);
        if (existing) {
          // Combine both weighted scores
          const finalScore = existing.similarity + weightedKeywordScore;
          console.log(`📊 Combined: Doc ${result.id} (chunk ${chunkIndex}) = ${existing.similarity.toFixed(3)} + ${weightedKeywordScore.toFixed(3)} = ${finalScore.toFixed(3)}`);
          existing.similarity = finalScore;
        } else {
          // Only keyword match (no vector score)
          console.log(`📊 Keyword Only: Doc ${result.id} (chunk ${chunkIndex}) = ${weightedKeywordScore.toFixed(3)}`);
          combinedResults.set(result.id, {
            ...result,
            similarity: weightedKeywordScore
          });
        }
      });

      console.log(`✅ Step 4 Complete: Aggregated ${combinedResults.size} unique documents`);

      // Step 5: Filtering out low-score chunks (below threshold)
      console.log(`🔍 Step 5: Filtering chunks below threshold ${threshold}...`);
      const beforeFilter = Array.from(combinedResults.values());
      const afterFilter = beforeFilter.filter(result => {
        const passed = result.similarity >= threshold;
        console.log(`🎯 Filter: Doc ${result.id} score=${result.similarity.toFixed(3)} ${passed ? '✅ PASS' : '❌ REJECT'}`);
        return passed;
      });

      console.log(`✅ Step 5 Complete: ${beforeFilter.length} → ${afterFilter.length} documents passed filter`);

      // Step 6: Sort by final score and limit results for ChatAgent
      const finalResults = afterFilter
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      // Debug: Log top results with similarity scores and check for XOLO
      console.log(`Debug: Top 5 hybrid search results for "${query}":`);
      finalResults.slice(0, 5).forEach((result, index) => {
        // Find the corresponding vector result to get actual chunk info
        const vectorResult = vectorResults.find(vr => 
          parseInt(vr.document.metadata?.originalDocumentId || vr.document.id) === result.id
        );
        const actualChunkIndex = vectorResult?.document.metadata?.chunkIndex || vectorResult?.document.chunkIndex || 'unknown';
        
        console.log(`${index + 1}. Doc ID: ${result.id} (chunk ${actualChunkIndex}), Similarity: ${result.similarity.toFixed(4)}`);
        console.log(`   Content: ${result.content.substring(0, 300)}...`);

        // Check for XOLO in various formats
        const content = result.content.toLowerCase();
        const hasXolo = content.includes('xolo') || content.includes('โซโล่') || content.includes('โซโลว์') || content.includes('solo');
        if (hasXolo) {
          console.log(`   *** FOUND XOLO CHUNK *** - Contains XOLO reference`);
        } else {
          console.log(`   No XOLO reference found in this chunk`);
        }
      });

      console.log(`✅ HYBRID SEARCH COMPLETE: Returning ${finalResults.length} chunks for ChatAgent`);
      finalResults.forEach((result, index) => {
        console.log(`${index + 1}. Doc ${result.id}: "${result.name}" (final score: ${result.similarity.toFixed(3)})`);
      });

      return finalResults;

    } catch (error) {
      console.error("❌ Error performing hybrid search:", error);
      throw new Error("Failed to perform hybrid search");
    }
  }

  private async performChunkLevelHybridSearch(
    query: string,
    userId: string,
    options: Omit<SearchOptions, "searchType">,
    keywordWeight: number,
    vectorWeight: number
  ): Promise<SearchResult[]> {
    try {
      const { vectorService } = await import('./vectorService');

      // Get vector chunk results (already returns top chunks globally)
      const vectorResults = await vectorService.searchDocuments(
        query, 
        userId, 
        options.limit || 100, // Use the full limit passed from caller
        options.specificDocumentIds
      );

      console.log(`Hybrid search: Got ${vectorResults.length} vector chunk results`);

      // Extract search terms for keyword scoring
      const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

      // Calculate hybrid scores for each chunk
      const hybridResults = vectorResults.map(result => {
        const chunkText = result.document.content.toLowerCase();

        // Calculate keyword score (how many terms match in this chunk)
        const matchingTerms = searchTerms.filter(term => chunkText.includes(term));
        const keywordScore = matchingTerms.length / searchTerms.length;

        // Boost keyword score if it's a store location query (like "XOLO Bangkapi")
        let boostedKeywordScore = keywordScore;
        const storeKeywords = ['xolo', 'kamu', 'floor', 'ชั้น', 'บางกะปิ', 'bangkapi'];
        const hasStoreKeyword = searchTerms.some(term => 
          storeKeywords.some(storeKeyword => term.includes(storeKeyword) || storeKeyword.includes(term))
        );
        if (hasStoreKeyword && keywordScore > 0.5) {
          boostedKeywordScore = Math.min(1.0, keywordScore + 0.3);
        }

        // Combine vector and keyword scores with weights
        const hybridScore = (result.similarity * vectorWeight) + (boostedKeywordScore * keywordWeight);

        return {
          vectorResult: result,
          hybridScore: hybridScore,
          keywordScore: boostedKeywordScore
        };
      })
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, options.limit || 2); // Take only top N chunks globally

      console.log(`Hybrid search: Selected top ${hybridResults.length} chunks globally`);

      // Convert back to SearchResult format
      const finalResults: SearchResult[] = [];

      // Log summary instead of individual chunks
      console.log(`Hybrid search: Processed ${hybridResults.length} chunks, top score: ${hybridResults[0]?.hybridScore.toFixed(3) || 'N/A'}`);

      for (const hybridResult of hybridResults) {
        const originalDocId = parseInt(hybridResult.vectorResult.document.metadata.originalDocumentId);

        // Get original document metadata
        const documents = await storage.getDocuments(userId, { limit: 1000 });
        const originalDoc = documents.find(doc => doc.id === originalDocId);

        if (originalDoc) {
          finalResults.push({
            id: originalDocId,
            name: originalDoc.name,
            content: hybridResult.vectorResult.document.content, // Use chunk content
            summary: originalDoc.summary,
            aiCategory: originalDoc.aiCategory,
            aiCategoryColor: originalDoc.aiCategoryColor,
            similarity: hybridResult.hybridScore,
            createdAt: originalDoc.createdAt.toISOString(),
            categoryId: originalDoc.categoryId,
            tags: originalDoc.tags,
            fileSize: originalDoc.fileSize,
            mimeType: originalDoc.mimeType,
            isFavorite: originalDoc.isFavorite,
            updatedAt: originalDoc.updatedAt?.toISOString() || null,
            userId: originalDoc.userId
          });
        }
      }

      return finalResults;

    } catch (error) {
      console.error("Error performing chunk-level hybrid search:", error);
      throw new Error("Failed to perform chunk-level hybrid search");
    }
  }
}

export const semanticSearchServiceV2 = new SemanticSearchServiceV2();