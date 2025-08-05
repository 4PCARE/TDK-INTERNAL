import { semanticSearchServiceV2 } from './semanticSearchV2';
import { searchSmartHybridDebug, type SearchOptions } from './newSearch';
import { storage } from '../storage';

/**
 * Document Search Tool for LangChain
 * 
 * Searches through documents in the knowledge management system using hybrid search.
 * Combines keyword matching and semantic similarity to find relevant documents.
 * 
 * @param query - The search query string to find relevant documents
 * @param userId - The user ID to search within their document collection
 * @param searchType - Type of search: 'semantic', 'keyword', 'hybrid', or 'smart_hybrid' (default: 'smart_hybrid')
 * @param limit - Maximum number of results to return (default: 10, max: 50)
 * @param threshold - Minimum similarity threshold for results (default: 0.3)
 * @param specificDocumentIds - Optional array of document IDs to limit search scope
 * @returns Promise<Array> - Array of search results with document content, names, and similarity scores
 * 
 * @example
 * const results = await documentSearch({
 *   query: "financial reports Q4",
 *   userId: "user123",
 *   searchType: "smart_hybrid",
 *   limit: 5
 * });
 */
export async function documentSearch({
  query,
  userId,
  searchType = 'smart_hybrid',
  limit = 10,
  threshold = 0.3,
  specificDocumentIds
}: {
  query: string;
  userId: string;
  searchType?: 'semantic' | 'keyword' | 'hybrid' | 'smart_hybrid';
  limit?: number;
  threshold?: number;
  specificDocumentIds?: number[];
}): Promise<Array<{
  id: string;
  name: string;
  content: string;
  summary?: string;
  similarity: number;
  aiCategory?: string;
  tags?: string[];
  createdAt: string;
  fileSize?: number;
  mimeType?: string;
}>> {
  try {
    // Validate inputs
    if (!query || !userId) {
      throw new Error('Query and userId are required parameters');
    }

    if (limit > 50) {
      limit = 50; // Cap at 50 for performance
    }

    // Prepare search options
    const searchOptions: SearchOptions = {
      searchType: searchType as any,
      limit,
      threshold,
      specificDocumentIds,
      keywordWeight: searchType === 'keyword' ? 1.0 : 0.5,
      vectorWeight: searchType === 'semantic' ? 1.0 : 0.5,
      massSelectionPercentage: 0.6 // Use 60% mass selection for comprehensive results
    };

    console.log(`[LangChain Tool] Document search initiated: "${query}" for user ${userId}`);

    // Execute search using the smart hybrid search function
    const searchResults = await searchSmartHybridDebug(
      query,
      userId,
      searchOptions
    );

    // Format results for LangChain consumption
    const formattedResults = searchResults.map(result => ({
      id: result.id,
      name: result.name,
      content: result.content,
      summary: result.summary || undefined,
      similarity: Math.round(result.similarity * 1000) / 1000, // Round to 3 decimal places
      aiCategory: result.aiCategory || undefined,
      tags: result.tags || undefined,
      createdAt: result.createdAt,
      fileSize: result.fileSize || undefined,
      mimeType: result.mimeType || undefined
    }));

    console.log(`[LangChain Tool] Search completed: Found ${formattedResults.length} results`);

    return formattedResults;

  } catch (error) {
    console.error('[LangChain Tool] Document search error:', error);
    throw new Error(`Document search failed: ${error.message}`);
  }
}

/**
 * Get Document by ID Tool for LangChain
 * 
 * Retrieves a specific document by its ID for detailed content access.
 * 
 * @param documentId - The document ID to retrieve
 * @param userId - The user ID who owns or has access to the document
 * @returns Promise<Object> - Document object with full content and metadata
 * 
 * @example
 * const document = await getDocumentById({
 *   documentId: "123",
 *   userId: "user123"
 * });
 */
export async function getDocumentById({
  documentId,
  userId
}: {
  documentId: string;
  userId: string;
}): Promise<{
  id: number;
  name: string;
  content?: string;
  summary?: string;
  aiCategory?: string;
  tags?: string[];
  createdAt: string;
  fileSize?: number;
  mimeType?: string;
  uploaderName?: string;
  departmentName?: string;
}> {
  try {
    if (!documentId || !userId) {
      throw new Error('DocumentId and userId are required parameters');
    }

    const docId = parseInt(documentId);
    if (isNaN(docId)) {
      throw new Error('Invalid document ID format');
    }

    console.log(`[LangChain Tool] Retrieving document ${docId} for user ${userId}`);

    const document = await storage.getDocument(docId, userId);

    if (!document) {
      throw new Error(`Document with ID ${docId} not found or access denied`);
    }

    // Log document access
    await storage.logDocumentAccess(docId, userId, 'view');

    const result = {
      id: document.id,
      name: document.name,
      content: document.content || undefined,
      summary: document.summary || undefined,
      aiCategory: document.aiCategory || undefined,
      tags: document.tags || undefined,
      createdAt: document.createdAt?.toISOString() || new Date().toISOString(),
      fileSize: document.fileSize || undefined,
      mimeType: document.mimeType || undefined,
      uploaderName: document.uploaderName || undefined,
      departmentName: document.departmentName || undefined
    };

    console.log(`[LangChain Tool] Document retrieved: ${document.name}`);

    return result;

  } catch (error) {
    console.error('[LangChain Tool] Get document error:', error);
    throw new Error(`Failed to retrieve document: ${error.message}`);
  }
}

/**
 * List User Documents Tool for LangChain
 * 
 * Lists all documents accessible to a user with basic metadata.
 * Useful for getting an overview of available documents.
 * 
 * @param userId - The user ID to list documents for
 * @param categoryFilter - Optional category filter
 * @param limit - Maximum number of documents to return (default: 100)
 * @returns Promise<Array> - Array of document summaries
 * 
 * @example
 * const documents = await listUserDocuments({
 *   userId: "user123",
 *   limit: 20
 * });
 */
export async function listUserDocuments({
  userId,
  categoryFilter,
  limit = 100
}: {
  userId: string;
  categoryFilter?: string;
  limit?: number;
}): Promise<Array<{
  id: number;
  name: string;
  summary?: string;
  aiCategory?: string;
  tags?: string[];
  createdAt: string;
  fileSize?: number;
  mimeType?: string;
}>> {
  try {
    if (!userId) {
      throw new Error('UserId is required parameter');
    }

    console.log(`[LangChain Tool] Listing documents for user ${userId}`);

    const documents = await storage.getDocuments(userId, {
      categoryId: categoryFilter ? parseInt(categoryFilter) : undefined,
      limit
    });

    const formattedDocuments = documents.map(doc => ({
      id: doc.id,
      name: doc.name,
      summary: doc.summary || undefined,
      aiCategory: doc.aiCategory || undefined,
      tags: doc.tags || undefined,
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
      fileSize: doc.fileSize || undefined,
      mimeType: doc.mimeType || undefined
    }));

    console.log(`[LangChain Tool] Listed ${formattedDocuments.length} documents`);

    return formattedDocuments;

  } catch (error) {
    console.error('[LangChain Tool] List documents error:', error);
    throw new Error(`Failed to list documents: ${error.message}`);
  }
}

// Export the tools in a format compatible with LangChain tool binding
export const langchainTools = {
  documentSearch,
  getDocumentById,
  listUserDocuments
};