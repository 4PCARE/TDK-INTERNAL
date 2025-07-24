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
  searchKeywords?: string[];
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
      
      // For filtering, we need to go back to individual chunks, not aggregated documents
      const chunkResults: Array<{result: SearchResult, vectorResult?: any, chunkIndex: number}> = [];
      
      // Add vector results as individual chunks
      vectorResults.forEach(vr => {
        const originalDocId = parseInt(vr.document.metadata?.originalDocumentId || vr.document.id);
        const chunkIndex = vr.document.metadata?.chunkIndex || vr.document.chunkIndex || 0;
        const doc = docMap.get(originalDocId);
        
        if (doc) {
          const weightedVectorScore = vr.similarity * vectorWeight;
          
          // Check if this chunk also has keyword score
          const keywordResult = keywordResults.find(kr => kr.id === originalDocId);
          let weightedKeywordScore = keywordResult ? (keywordResult.similarity * keywordWeight) : 0;
          
          // Boost keyword score for exact store matches in the chunk content
          const chunkContent = vr.document.content.toLowerCase();
          const storeKeywords = ['xolo', 'kamu', 'ชั้น', 'floor', 'บางกะปิ', 'bangkapi'];
          const hasExactStoreMatch = storeKeywords.some(keyword => chunkContent.includes(keyword));
          
          if (hasExactStoreMatch && weightedKeywordScore > 0) {
            weightedKeywordScore = Math.min(0.6, weightedKeywordScore + 0.3); // Significant boost for exact matches
            console.log(`🏪 Store Boost: Chunk ${chunkIndex} boosted keyword score to ${weightedKeywordScore.toFixed(3)} for exact store match`);
          }
          
          const finalScore = weightedVectorScore + weightedKeywordScore;
          
          chunkResults.push({
            result: {
              id: originalDocId,
              name: doc.name,
              content: vr.document.content,
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
              userId: doc.userId
            },
            vectorResult: vr,
            chunkIndex: chunkIndex
          });
        }
      });
      
      // Filter each chunk individually with special handling for exact store matches
      const passedChunks = chunkResults.filter(chunkData => {
        let dynamicThreshold = threshold;
        
        // Check if this chunk contains exact store keywords - lower threshold for exact matches
        const content = chunkData.result.content.toLowerCase();
        const storeKeywords = ['xolo', 'kamu', 'ชั้น', 'floor', 'บางกะปิ', 'bangkapi', 'level'];
        const hasExactStoreMatch = storeKeywords.some(keyword => content.includes(keyword));
        
        if (hasExactStoreMatch) {
          dynamicThreshold = Math.min(threshold, 0.1); // Lower threshold for store matches
          console.log(`🏪 Store Match: Chunk ${chunkData.chunkIndex} contains store keywords, using lower threshold ${dynamicThreshold}`);
        }
        
        const passed = chunkData.result.similarity >= dynamicThreshold;
        console.log(`🎯 Filter: Chunk ${chunkData.chunkIndex} from Doc ${chunkData.result.id} score=${chunkData.result.similarity.toFixed(3)} threshold=${dynamicThreshold.toFixed(2)} ${passed ? '✅ PASS' : '❌ REJECT'}`);
        
        // Additional debug for XOLO specifically
        if (content.includes('xolo')) {
          console.log(`🔍 XOLO CHUNK FILTER: score=${chunkData.result.similarity.toFixed(3)}, threshold=${dynamicThreshold.toFixed(2)}, passed=${passed}`);
          console.log(`🔍 XOLO CONTENT PREVIEW: ${content.substring(0, 200)}...`);
        }
        
        return passed;
      });

      console.log(`✅ Step 5 Complete: ${chunkResults.length} chunks → ${passedChunks.length} chunks passed filter`);
      
      // Convert back to SearchResult array and take top results
      const afterFilter = passedChunks.map(chunkData => chunkData.result);

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

        // Check for XOLO in various formats (case insensitive and more variations)
        const content = result.content.toLowerCase();
        const xoloVariations = ['xolo', 'โซโล่', 'โซโลว์', 'โซโล', 'solo', 'xolo.', 'xolo,', 'xolo '];
        const hasXolo = xoloVariations.some(variation => content.includes(variation));
        
        if (hasXolo) {
          console.log(`   *** FOUND XOLO CHUNK *** - Contains XOLO reference`);
          // Show which variation was found
          const foundVariations = xoloVariations.filter(variation => content.includes(variation));
          console.log(`   Found variations: ${foundVariations.join(', ')}`);
        } else {
          console.log(`   No XOLO reference found in this chunk`);
        }
      });

      // Additional debug: Check if chunk 31 exists in vector results
      console.log(`\n🔍 DEBUG: Checking for chunk 31 in all vector results...`);
      const chunk31Results = vectorResults.filter(vr => {
        const chunkIndex = vr.document.metadata?.chunkIndex || vr.document.chunkIndex;
        return chunkIndex === 31 || chunkIndex === '31';
      });
      
      if (chunk31Results.length > 0) {
        console.log(`✅ Found chunk 31 in vector results:`);
        chunk31Results.forEach((result, idx) => {
          const docId = parseInt(result.document.metadata?.originalDocumentId || result.document.id);
          console.log(`   Chunk 31 from Doc ${docId}: Similarity ${result.similarity.toFixed(4)}`);
          console.log(`   Content preview: ${result.document.content.substring(0, 500)}...`);
          
          // Check for XOLO in chunk 31
          const content = result.document.content.toLowerCase();
          const xoloVariations = ['xolo', 'โซโล่', 'โซโลว์', 'โซโล', 'solo'];
          const hasXolo = xoloVariations.some(variation => content.includes(variation));
          console.log(`   Contains XOLO: ${hasXolo}`);
        });
      } else {
        console.log(`❌ Chunk 31 not found in vector results (total ${vectorResults.length} chunks returned)`);
      }

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