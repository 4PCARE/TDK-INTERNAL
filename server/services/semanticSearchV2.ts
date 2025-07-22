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
      const vectorResults = await vectorService.searchDocuments(query, userId, limit * 2);
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
        options.limit || 20
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
      const documents = await storage.searchDocuments(userId, query);
      
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
      // Get semantic results
      const semanticResults = await this.performSemanticSearch(query, userId, {
        ...options,
        limit: Math.floor((options.limit || 20) * 0.7)
      });

      // Get keyword results
      const keywordResults = await this.performKeywordSearch(query, userId, {
        ...options,
        limit: Math.floor((options.limit || 20) * 0.3)
      });

      // Combine and deduplicate results
      const combinedResults = new Map<number, SearchResult>();
      
      // Add semantic results first (higher priority)
      semanticResults.forEach(result => {
        combinedResults.set(result.id, result);
      });

      // Add keyword results if not already present
      keywordResults.forEach(result => {
        if (!combinedResults.has(result.id)) {
          combinedResults.set(result.id, {
            ...result,
            similarity: result.similarity * 0.8 // Slightly lower priority for keyword matches
          });
        }
      });

      // Sort by similarity and return
      return Array.from(combinedResults.values())
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, options.limit || 20);

    } catch (error) {
      console.error("Error performing hybrid search:", error);
      throw new Error("Failed to perform hybrid search");
    }
  }
}

export const semanticSearchServiceV2 = new SemanticSearchServiceV2();