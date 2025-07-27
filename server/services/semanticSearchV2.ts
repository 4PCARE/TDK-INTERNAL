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
  private similarityThreshold = 0.3;

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
        const docId = parseInt(vectorResult.document.metadata.originalDocumentId || vectorResult.document.id);
        const doc = docMap.get(docId);
        
        if (doc && vectorResult.similarity >= threshold && !processedDocs.has(docId)) {
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

          results.push({
            id: doc.id,
            name: doc.name,
            content: doc.content || "",
            summary: doc.summary,
            aiCategory: doc.aiCategory,
            aiCategoryColor: doc.aiCategoryColor,
            similarity: vectorResult.similarity,
            createdAt: doc.createdAt.toISOString(),
            // Include all fields needed for proper display (matching DocumentCard interface)
            categoryId: doc.categoryId,
            tags: doc.tags,
            fileSize: doc.fileSize, // Use fileSize instead of size
            mimeType: doc.mimeType, // Use mimeType instead of fileType
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
    try {
      const keywordWeight = options.keywordWeight || 0.4;
      const vectorWeight = options.vectorWeight || 0.6;
      
      console.log(`Hybrid search using weights: keyword=${keywordWeight}, vector=${vectorWeight}`);

      // Use the new chunk split and rank search method
      const chunkResults = await this.performChunkSplitAndRankSearch(query, userId, options);
      
      return chunkResults;

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
      // 1. Get vector-based chunks
      const vectorResults = await vectorService.searchDocuments(query, userId, 50, options.specificDocumentIds);
      const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

      // 2. Prepare keyword score for each chunk
      const keywordChunks = vectorResults.map(result => {
        const chunkId = `${result.document.metadata.originalDocumentId || result.document.id}-${result.document.chunkIndex ?? 0}`;
        const chunkText = result.document.content.toLowerCase();
        const matchedTerms = searchTerms.filter(term => chunkText.includes(term));
        let keywordScore = matchedTerms.length / searchTerms.length;

        // Optional boost for store-type queries
        const storeKeywords = ['xolo', 'kamu', 'floor', 'ชั้น', 'บางกะปิ', 'bangkapi'];
        const hasStoreKeyword = searchTerms.some(term =>
          storeKeywords.some(sk => sk.includes(term) || term.includes(sk))
        );
        if (hasStoreKeyword && keywordScore > 0.5) {
          keywordScore = Math.min(1.0, keywordScore + 0.3);
        }

        return {
          chunkId,
          content: result.document.content,
          docId: parseInt(result.document.metadata.originalDocumentId || result.document.id),
          vectorScore: result.similarity,
          keywordScore,
          combinedScore: result.similarity * (options.vectorWeight ?? 0.5) +
                         keywordScore * (options.keywordWeight ?? 0.5)
        };
      });

      // 3. Sort and select top chunks covering 66% of total combined score
      const totalCombined = keywordChunks.reduce((sum, c) => sum + c.combinedScore, 0);
      const threshold = totalCombined * 0.66;

      keywordChunks.sort((a, b) => b.combinedScore - a.combinedScore);

      const selectedChunks = [];
      let acc = 0;
      for (const c of keywordChunks) {
        selectedChunks.push(c);
        acc += c.combinedScore;
        if (acc >= threshold) break;
      }

      // 4. Get original document metadata
      const allDocIds = [...new Set(selectedChunks.map(c => c.docId))];
      const docMap = new Map((await storage.getDocuments(userId, { limit: 1000 }))
        .filter(doc => allDocIds.includes(doc.id))
        .map(doc => [doc.id, doc]));

      // 5. Wrap result as SearchResult[]
      const finalResults: SearchResult[] = selectedChunks.map(chunk => {
        const originalDoc = docMap.get(chunk.docId);
        return {
          id: originalDoc?.id ?? chunk.docId,
          name: originalDoc?.name ?? "[Unknown]",
          content: chunk.content,
          summary: originalDoc?.summary,
          aiCategory: originalDoc?.aiCategory,
          aiCategoryColor: originalDoc?.aiCategoryColor,
          similarity: chunk.combinedScore,
          createdAt: originalDoc?.createdAt?.toISOString() ?? new Date().toISOString(),
          categoryId: originalDoc?.categoryId ?? null,
          tags: originalDoc?.tags ?? null,
          fileSize: originalDoc?.fileSize ?? null,
          mimeType: originalDoc?.mimeType ?? null,
          isFavorite: originalDoc?.isFavorite ?? null,
          updatedAt: originalDoc?.updatedAt?.toISOString() ?? null,
          userId: originalDoc?.userId ?? userId
        };
      });

      console.log(`ChunkSplitAndRank: Selected ${finalResults.length} chunks covering 66% of total score`);
      return finalResults;

    } catch (error) {
      console.error("Error in performChunkSplitAndRankSearch:", error);
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