import { storage } from '../storage';

// Search result interface
export interface SearchResult {
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
  isFavorite: boolean;
  updatedAt: string | null;
  userId: string;
}

// Search options interface
export interface SearchOptions {
  searchType?: "semantic" | "keyword" | "hybrid";
  limit?: number;
  threshold?: number;
  keywordWeight?: number;
  vectorWeight?: number;
  specificDocumentIds?: number[];
  searchKeywords?: string[];
}

export class SemanticSearchServiceV2 {
  private similarityThreshold = 0.2;

  async search(query: string, userId: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { searchType = "hybrid" } = options;

    console.log(`🔍 SEMANTIC SEARCH V2: query="${query}", type=${searchType}, userId=${userId}`);

    switch (searchType) {
      case "semantic":
        return await this.performSemanticSearch(query, userId, options);
      case "keyword":
        return await this.performKeywordSearch(query, userId, options);
      case "hybrid":
        return await this.performHybridSearch(query, userId, options);
      default:
        throw new Error(`Unsupported search type: ${searchType}`);
    }
  }

  private async performSemanticSearch(
    query: string,
    userId: string,
    options: Omit<SearchOptions, "searchType">
  ): Promise<SearchResult[]> {
    try {
      const { vectorService } = await import('./vectorService');
      const { limit = 20 } = options;

      console.log(`SemanticSearchV2: Performing semantic search for "${query}"`);

      if (options.specificDocumentIds && options.specificDocumentIds.length > 0) {
        console.log(`SemanticSearchV2: Filtering to specific documents: [${options.specificDocumentIds.join(', ')}]`);
      }

      const vectorResults = await vectorService.searchDocuments(
        query, 
        userId, 
        limit, 
        options.specificDocumentIds
      );

      // Get all documents for mapping
      const documents = await storage.getDocuments(userId, { limit: 1000 });
      const docMap = new Map(documents.map(doc => [doc.id, doc]));

      const results: SearchResult[] = vectorResults.map(result => {
        const originalDocId = parseInt(result.document.metadata?.originalDocumentId || result.document.id);
        const doc = docMap.get(originalDocId);
        
        if (!doc) return null;

        return {
          id: originalDocId,
          name: doc.name,
          content: result.document.content,
          summary: doc.summary,
          aiCategory: doc.aiCategory,
          aiCategoryColor: doc.aiCategoryColor,
          similarity: result.similarity,
          createdAt: doc.createdAt.toISOString(),
          categoryId: doc.categoryId,
          tags: doc.tags,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          isFavorite: doc.isFavorite,
          updatedAt: doc.updatedAt?.toISOString() || null,
          userId: doc.userId
        };
      }).filter(result => result !== null);

      console.log(`SemanticSearchV2: Found ${results.length} semantic results`);
      return results;

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
      const { limit = 20, threshold = this.similarityThreshold } = options;

      console.log(`SemanticSearchV2: Performing keyword search for "${query}"`);

      const documents = await storage.getDocuments(userId, { limit: 1000 });
      
      let filteredDocuments = documents;
      if (options.specificDocumentIds && options.specificDocumentIds.length > 0) {
        filteredDocuments = documents.filter(doc => options.specificDocumentIds.includes(doc.id));
        console.log(`SemanticSearchV2: Filtered to ${filteredDocuments.length} specific documents`);
      }

      const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

      const results = filteredDocuments.map(doc => {
        const contentLower = (doc.content || '').toLowerCase();
        const titleLower = doc.name.toLowerCase();
        const summaryLower = (doc.summary || '').toLowerCase();
        const tagsLower = (doc.tags || []).join(' ').toLowerCase();

        let matches = 0;
        const totalTerms = queryTerms.length;

        queryTerms.forEach(term => {
          if (contentLower.includes(term) || titleLower.includes(term) || 
              summaryLower.includes(term) || tagsLower.includes(term)) {
            matches++;
          }
        });

        const similarity = totalTerms > 0 ? matches / totalTerms : 0;

        return {
          id: doc.id,
          name: doc.name,
          content: doc.content || '',
          summary: doc.summary,
          aiCategory: doc.aiCategory,
          aiCategoryColor: doc.aiCategoryColor,
          similarity,
          createdAt: doc.createdAt.toISOString(),
          categoryId: doc.categoryId,
          tags: doc.tags,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          isFavorite: doc.isFavorite,
          updatedAt: doc.updatedAt?.toISOString() || null,
          userId: doc.userId
        };
      }).filter(result => result.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      console.log(`SemanticSearchV2: Found ${results.length} keyword results`);
      return results;

    } catch (error) {
      console.error("Error performing keyword search:", error);
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

    console.log(`🔍 NEW HYBRID SEARCH WORKFLOW: Starting for "${query}"`);
    console.log(`📋 NEW APPROACH: Vector search + nearby strings (no keyword search)`);

    try {
      const { vectorService } = await import('./vectorService');
      
      // Get documents for mapping vector results to proper document data
      const documents = await storage.getDocuments(userId, { limit: 1000 });
      const docMap = new Map(documents.map(doc => [doc.id, doc]));

      // Step 1: Get Vector Search Results
      console.log(`🔍 Step 1: Performing vector search...`);

      if (options.specificDocumentIds && options.specificDocumentIds.length > 0) {
        console.log(`🎯 Passing document ID filter to vector service: [${options.specificDocumentIds.join(', ')}]`);
      } else {
        console.log(`⚠️ No document ID filter - will search ALL user documents`);
      }

      // Use vector search for semantic similarity
      const vectorResults = await vectorService.searchDocuments(
        query, 
        userId, 
        Math.max(limit * 3, 50), // Get more chunks for better coverage
        options.specificDocumentIds // Pass document filtering to vector service
      );
      console.log(`✅ Step 1 Complete: Found ${vectorResults.length} vector results`);

      // Step 2: Extract keywords for nearby string search
      console.log(`🔍 Step 2: Extracting keywords for nearby string search...`);
      
      let searchKeywords = [];
      if (options.searchKeywords && options.searchKeywords.length > 0) {
        searchKeywords = options.searchKeywords;
        console.log(`🔑 Using augmented keywords: [${searchKeywords.join(', ')}]`);
      } else {
        searchKeywords = query.toLowerCase().split(/\s+/).filter(term => term.length > 1);
        console.log(`🔑 Using query keywords: [${searchKeywords.join(', ')}]`);
      }

      // Step 3: Process each vector result to extract nearby strings for keyword matches
      console.log(`🔍 Step 3: Processing chunks for nearby string extraction...`);
      
      const enhancedResults = vectorResults.map(vr => {
        const chunkContent = vr.document.content;
        const chunkContentLower = chunkContent.toLowerCase();
        const originalDocId = parseInt(vr.document.metadata?.originalDocumentId || vr.document.id);
        const chunkIndex = vr.document.metadata?.chunkIndex || vr.document.chunkIndex || 0;
        const doc = docMap.get(originalDocId);
        
        if (!doc) return null;
        
        let keywordBoost = 0;
        let nearbyStrings = [];
        let hasExactMatch = false;
        
        // Check for keyword matches and extract nearby strings
        searchKeywords.forEach(keyword => {
          const keywordLower = keyword.toLowerCase();
          const index = chunkContentLower.indexOf(keywordLower);
          
          if (index !== -1) {
            hasExactMatch = true;
            
            // Extract nearby string (150 chars before and after the keyword)
            const start = Math.max(0, index - 150);
            const end = Math.min(chunkContent.length, index + keywordLower.length + 150);
            const nearbyString = chunkContent.substring(start, end);
            
            nearbyStrings.push({
              keyword: keyword,
              context: nearbyString,
              position: index,
              matchLength: keywordLower.length
            });
            
            // Base keyword boost
            keywordBoost += 0.2;
            
            console.log(`📍 Found "${keyword}" in chunk ${chunkIndex} at position ${index}`);
            console.log(`📝 Context: "${nearbyString.substring(0, 100)}..."`);
          }
        });
        
        // Special boost for store location keywords
        const storeKeywords = ['xolo', 'kamu', 'ชั้น', 'floor', 'บางกะปิ', 'bangkapi', 'level'];
        const hasStoreKeyword = storeKeywords.some(storeKeyword => 
          searchKeywords.some(searchKeyword => 
            searchKeyword.toLowerCase().includes(storeKeyword) || storeKeyword.includes(searchKeyword.toLowerCase())
          ) && chunkContentLower.includes(storeKeyword)
        );
        
        if (hasStoreKeyword) {
          keywordBoost += 0.3;
          console.log(`🏪 Store keyword boost applied to chunk ${chunkIndex}: +0.3`);
        }
        
        // Calculate final score combining vector similarity and keyword boost
        const finalScore = vr.similarity + keywordBoost;
        
        return {
          id: originalDocId,
          name: doc.name,
          content: chunkContent, // Use full chunk content
          summary: doc.summary,
          aiCategory: doc.aiCategory,
          aiCategoryColor: doc.aiCategoryColor,
          similarity: finalScore,
          createdAt: doc.createdAt.toISOString(),
          categoryId: doc.categoryId,
          tags: doc.tags,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          isFavorite: doc.isFavorite,
          updatedAt: doc.updatedAt?.toISOString() || null,
          userId: doc.userId,
          // Additional metadata for debugging
          chunkIndex,
          originalSimilarity: vr.similarity,
          keywordBoost,
          hasExactMatch,
          nearbyStrings
        };
      }).filter(result => result !== null);

      console.log(`✅ Step 3 Complete: Enhanced ${enhancedResults.length} chunks with nearby strings`);

      // Step 4: Filter results with dynamic threshold
      console.log(`🔍 Step 4: Filtering with dynamic threshold...`);
      
      const filteredResults = enhancedResults.filter(result => {
        let dynamicThreshold = threshold;
        
        // Lower threshold for exact keyword matches (especially store keywords)
        if (result.hasExactMatch) {
          const hasStoreContext = result.nearbyStrings.some(ns => 
            ['xolo', 'kamu', 'ชั้น', 'floor', 'บางกะปิ', 'bangkapi'].some(store => 
              ns.context.toLowerCase().includes(store)
            )
          );
          
          if (hasStoreContext) {
            dynamicThreshold = Math.min(threshold, 0.1); // Much lower for store matches
            console.log(`🏪 Store match: Using lower threshold ${dynamicThreshold} for chunk ${result.chunkIndex}`);
          } else {
            dynamicThreshold = Math.min(threshold, 0.15); // Lower for any exact match
            console.log(`🔑 Keyword match: Using lower threshold ${dynamicThreshold} for chunk ${result.chunkIndex}`);
          }
        }
        
        const passed = result.similarity >= dynamicThreshold;
        console.log(`🎯 Filter: Chunk ${result.chunkIndex} score=${result.similarity.toFixed(3)} threshold=${dynamicThreshold.toFixed(2)} ${passed ? '✅ PASS' : '❌ REJECT'}`);
        
        // Debug XOLO specifically
        if (result.content.toLowerCase().includes('xolo')) {
          console.log(`🔍 XOLO CHUNK: ${passed ? 'PASSED' : 'REJECTED'} - score=${result.similarity.toFixed(3)}, threshold=${dynamicThreshold.toFixed(2)}`);
          if (result.nearbyStrings.length > 0) {
            result.nearbyStrings.forEach(ns => {
              console.log(`   📝 XOLO context: "${ns.context.substring(0, 150)}..."`);
            });
          }
        }
        
        return passed;
      });

      console.log(`✅ Step 4 Complete: ${enhancedResults.length} chunks → ${filteredResults.length} chunks passed filter`);

      // Step 5: Sort by final score and return top results
      const finalResults = filteredResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(result => {
          // Remove the extra metadata for final response
          const { chunkIndex, originalSimilarity, keywordBoost, hasExactMatch, nearbyStrings, ...cleanResult } = result;
          return cleanResult;
        });

      console.log(`✅ NEW HYBRID SEARCH COMPLETE: Returning ${finalResults.length} chunks`);
      finalResults.forEach((result, index) => {
        console.log(`${index + 1}. Doc ${result.id}: "${result.name}" (final score: ${result.similarity.toFixed(3)})`);
      });

      return finalResults;

    } catch (error) {
      console.error("❌ Error performing new hybrid search:", error);
      throw new Error("Failed to perform new hybrid search");
    }
  }
}

export const semanticSearchServiceV2 = new SemanticSearchServiceV2();