import { Document } from "@shared/schema";
import { vectorService } from './vectorService';
import { storage } from '../storage';

export interface SearchResult {
  id: string;
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
  private similarityThreshold = 0.3;

  async searchDocuments(
    query: string,
    userId: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[] & { searchStats?: any }> {
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

      // Get document details from storage for metadata
      const uniqueDocIds = [...new Set(vectorResults.map(result => 
        parseInt(result.document.metadata.originalDocumentId || result.document.id)
      ))];
      const documents = await storage.getDocuments(userId, { limit: 1000 });
      const docMap = new Map(documents.map(doc => [doc.id, doc]));

      // Process each chunk individually (no deduplication by document)
      const results: SearchResult[] = [];

      for (const vectorResult of vectorResults) {
        const docId = parseInt(vectorResult.document.metadata.originalDocumentId || vectorResult.document.id);
        const chunkIndex = vectorResult.document.chunkIndex ?? 0;
        const doc = docMap.get(docId);

        if (doc && vectorResult.similarity >= threshold) {
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

          // Create chunk-level result
          const chunkId = `${docId}-${chunkIndex ?? 0}`;
          const chunkLabel = chunkIndex !== undefined ? ` (Chunk ${(chunkIndex ?? 0) + 1})` : "";

          // Debug: Verify we're getting chunk content, not full document
          if (vectorResult.document.content.length > 3000) {
            console.warn(`⚠️  SEMANTIC SEARCH: Doc ${docId} chunk ${chunkIndex} has ${vectorResult.document.content.length} chars - might be full document!`);
          }

          // Debug: Log what we're actually getting from vectorResult
          console.log(`DEBUG SEMANTIC: Doc ${docId} chunk ${chunkIndex} - vectorResult content length: ${vectorResult.document.content.length}`);
          console.log(`DEBUG SEMANTIC: Content preview: "${vectorResult.document.content.substring(0, 100)}..."`);

          results.push({
            id: chunkId, // Use string ID to avoid conflicts
            name: doc.name + chunkLabel,
            content: vectorResult.document.content, // ✅ This should be chunk content from vectorService
            summary: vectorResult.document.content.slice(0, 200) + "...",
            aiCategory: doc.aiCategory,
            aiCategoryColor: doc.aiCategoryColor,
            similarity: vectorResult.similarity,
            createdAt: doc.createdAt.toISOString(),
            // Include all fields needed for proper display (matching DocumentCard interface)
            categoryId: doc.categoryId,
            tags: doc.tags,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            isFavorite: doc.isFavorite,
            updatedAt: doc.updatedAt?.toISOString() || null,
            userId: doc.userId
          });
        }
      }

      console.log(`SemanticSearchV2: Processed ${results.length} chunk-level results`);

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
  ): Promise<SearchResult[] & { searchStats?: any }> {
    try {
      const keywordWeight = options.keywordWeight || 0.4;
      const vectorWeight = options.vectorWeight || 0.6;

      console.log(`Hybrid search using weights: keyword=${keywordWeight}, vector=${vectorWeight}`);

      // Use the new chunk split and rank search method
      console.log(`🔄 Hybrid search: Using performChunkSplitAndRankSearch method`);

    const startTime = Date.now();
    const results = await this.performChunkSplitAndRankSearch(query, userId, options);
    const endTime = Date.now();

    // Add search statistics to results
    (results as any).searchStats = {
      totalDocuments: options.specificDocumentIds?.length || 0,
      retrievedChunks: results.length,
      searchTime: endTime - startTime,
      searchMethod: 'chunk_split_rank'
    };

      console.log(`🔄 Hybrid search: Returning ${results.length} chunk-based results`);
      return results;

    } catch (error) {
      console.error("Error performing hybrid search:", error);
      throw new Error("Failed to perform hybrid search");
    }
  }

  async performChunkSplitAndRankSearch(
    query: string,
    userId: string,
    options: Omit<SearchOptions, "searchType">
  ): Promise<SearchResult[]> {
    try {
      const keywordWeight = options.keywordWeight ?? 0.5;
      const vectorWeight = options.vectorWeight ?? 0.5;

      console.log(`🔍 Chunk split search: Starting with weights - keyword: ${keywordWeight}, vector: ${vectorWeight}`);

      // Step 1: Retrieve top vector chunks from document_vectors table
      const vectorResults = await vectorService.searchDocuments(query, userId, 50, options.specificDocumentIds);
      const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

      console.log(`📊 Found ${vectorResults.length} vector chunks from document_vectors table`);

      if (vectorResults.length === 0) {
        console.log("❌ No vector chunks found");
        return [];
      }

      // Step 2: Score chunks with both vector and keyword
      const scoredChunks = vectorResults.map(result => {
        const docId = parseInt(result.document.metadata.originalDocumentId || result.document.id);
        const chunkIndex = result.document.chunkIndex ?? 0;
        const chunkId = `${docId}-${chunkIndex}`;
        const chunkText = result.document.content.toLowerCase();

        // Debug: Log chunk content length to catch any full documents sneaking in
        if (result.document.content.length > 3000) {
          console.warn(`⚠️  Vector result for doc ${docId} chunk ${chunkIndex} has ${result.document.content.length} chars - suspiciously large for a chunk!`);
        }

        const matchedTerms = searchTerms.filter(term => chunkText.includes(term));
        let keywordScore = matchedTerms.length / searchTerms.length;

        // Boost keyword score for store-related queries
        const storeKeywords = ['xolo', 'kamu', 'floor', 'ชั้น', 'บางกะปิ', 'bangkapi'];
        const hasStoreKeyword = searchTerms.some(term =>
          storeKeywords.some(sk => sk.includes(term) || term.includes(sk))
        );
        if (hasStoreKeyword && keywordScore > 0.5) {
          keywordScore = Math.min(1.0, keywordScore + 0.3);
        }

        // Calculate combined score
        const combinedScore = Math.min(1.0, result.similarity * vectorWeight + keywordScore * keywordWeight);

        return {
          docId,
          chunkIndex,
          chunkId,
          content: result.document.content,
          similarity: combinedScore,
          vectorScore: result.similarity,
          keywordScore: keywordScore
        };
      });

      console.log(`📈 Scored ${scoredChunks.length} chunks with combined vector+keyword scoring`);

      // Step 3: Rank and select top 10% score mass for strict filtering
      const totalScore = scoredChunks.reduce((sum, c) => sum + c.similarity, 0);
      const scoreThreshold = totalScore * 0.10;

      scoredChunks.sort((a, b) => b.similarity - a.similarity);

      const selectedChunks = [];
      let accumulatedScore = 0;
      const maxChunks = Math.min(8, scoredChunks.length); // Cap at 8 chunks
      for (const chunk of scoredChunks) {
        selectedChunks.push(chunk);
        accumulatedScore += chunk.similarity;
        if (accumulatedScore >= scoreThreshold || selectedChunks.length >= maxChunks) break;
      }

      console.log(`🎯 STRICT SELECTION: Selected ${selectedChunks.length} top chunks (10% score mass threshold, max 8 chunks)`);

      // Step 4: Load document metadata for display purposes
      const uniqueDocIds = [...new Set(selectedChunks.map(c => c.docId))];
      const documents = await storage.getDocuments(userId, { limit: 1000 });
      const docMap = new Map(documents.filter(doc => uniqueDocIds.includes(doc.id)).map(doc => [doc.id, doc]));

      // Step 5: Format final results - return chunks, not documents
      const finalResults: SearchResult[] = selectedChunks.map((chunk, index) => {
        const doc = docMap.get(chunk.docId);
        const chunkLabel = chunk.chunkIndex !== undefined ? ` (Chunk ${chunk.chunkIndex + 1})` : "";

        return {
          id: `${chunk.docId}-${chunk.chunkIndex ?? 0}`, // Use string ID to avoid conflicts
          name: (doc?.name ?? "Untitled") + chunkLabel,
          content: chunk.content, // ✅ Use chunk content, not full document
          summary: chunk.content.slice(0, 200) + "...", // ✅ Generate summary from chunk
          aiCategory: doc?.aiCategory ?? null,
          aiCategoryColor: doc?.aiCategoryColor ?? null,
          similarity: chunk.similarity,
          createdAt: doc?.createdAt?.toISOString() ?? new Date().toISOString(),
          categoryId: doc?.categoryId ?? null,
          tags: doc?.tags ?? null,
          fileSize: doc?.fileSize ?? null,
          mimeType: doc?.mimeType ?? null,
          isFavorite: doc?.isFavorite ?? null,
          updatedAt: doc?.updatedAt?.toISOString() ?? null,
          userId: doc?.userId ?? userId
        };
      });

      console.log(`✅ Chunk split search: Returned ${finalResults.length} ranked chunks from document_vectors table`);

      // Debug: Log first few results to confirm chunk content (not full doc)
      finalResults.slice(0, 3).forEach((result, index) => {
        console.log(`${index + 1}. ${result.name} - Score: ${result.similarity.toFixed(4)}`);
        console.log(`   Content (${result.content.length} chars): ${result.content.substring(0, 150)}...`);

        // Additional debugging to catch if we're accidentally getting full documents
        if (result.content.length > 3000) {
          console.warn(`⚠️  POTENTIAL ISSUE: Result ${index + 1} has ${result.content.length} characters - might be full document instead of chunk!`);
        }
      });

      return finalResults;

    } catch (error) {
      console.error("❌ Error in performChunkSplitAndRankSearch:", error);
      throw new Error("Failed to perform chunk-based split-and-rank search");
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
        50, // Get more chunks to work with
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

        console.log(`Chunk from doc ${result.document.metadata.originalDocumentId}: vector=${result.similarity.toFixed(3)}, keyword=${keywordScore.toFixed(3)}, hybrid=${hybridScore.toFixed(3)}`);

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

      for (const hybridResult of hybridResults) {
        const originalDocId = parseInt(hybridResult.vectorResult.document.metadata.originalDocumentId);

        // Get original document metadata
        const documents = await storage.getDocuments(userId, { limit: 1000 });
        const originalDoc = documents.find(doc => doc.id === originalDocId);

        if (originalDoc) {
          finalResults.push({
            id: originalDocId.toString(),
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

export async function searchSmartHybridDebug(
  query: string,
  userId: string,
  options: Omit<SearchOptions, 'searchType'> = {}
): Promise<SearchResult[]> {
  console.log(`🔍 SMART HYBRID SEARCH: Starting for query "${query}" by user ${userId}`);
  console.log(`📋 Search options:`, options);

  try {
    // Get document IDs and agent configuration if restricted
    let searchDocumentIds = options.documentIds;
    let agentAliases: Record<string, string[]> | undefined;

    if (options.agentId) {
      console.log(`🤖 Agent-restricted search: Getting documents for agent ${options.agentId}`);
      const agentDocuments = await storage.getAgentChatbotDocuments(options.agentId);
      searchDocumentIds = agentDocuments.map(doc => doc.documentId);
      console.log(`📚 Agent documents: [${searchDocumentIds.join(', ')}]`);

      // Get agent configuration including aliases
      const agent = await storage.getAgentChatbot(options.agentId);
      if (agent?.aliases) {
        agentAliases = agent.aliases;
        console.log(`🔍 AGENT ALIASES: Loaded ${Object.keys(agentAliases).length} alias mappings`);
      }
    }

    // Phase 1: Advanced Keyword Search with BM25
    console.log(`🔍 PHASE 1: Starting advanced keyword search`);
    const keywordResults = await performAdvancedKeywordSearch(
      query, 
      searchDocumentIds, 
      { 
        ...options, 
        searchType: 'keyword',
        maxResults: 200  // Get more for hybrid scoring
      },
      agentAliases  // Pass agent aliases for term expansion
    );

    console.log(`✅ PHASE 1 COMPLETE: Found ${keywordResults.length} keyword results`);

    return keywordResults.slice(0, options.limit || 20);

  } catch (error) {
    console.error("❌ SMART HYBRID SEARCH ERROR:", error);
    throw new Error("Failed to perform smart hybrid search");
  }
}