import { semanticSearchServiceV2 } from './semanticSearchV2';
import { searchSmartHybridDebug, type SearchOptions } from './newSearch';
import { storage } from '../storage';
import { db } from '../db';
import { hrEmployees } from '@shared/schema';
import { eq } from 'drizzle-orm';

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
}): Promise<string> {
  const startTime = Date.now();
  console.log(`[LangChain Tool] ⚡ ENTRY: documentSearch called at ${new Date().toISOString()}`);
  console.log(`[LangChain Tool] 📋 Input Parameters:`, {
    query: `"${query}"`,
    userId,
    searchType,
    limit,
    threshold,
    specificDocumentIds: specificDocumentIds ? `[${specificDocumentIds.join(', ')}]` : 'undefined'
  });

  try {
    // Validate inputs
    if (!query || !userId) {
      const errorMsg = `Missing required parameters: query=${!!query}, userId=${!!userId}`;
      console.error(`[LangChain Tool] ❌ ${errorMsg}`);
      return `Error: ${errorMsg}. Please provide both a search query and user ID.`;
    }

    if (query.trim().length === 0) {
      console.log(`[LangChain Tool] ⚠️ Empty query provided`);
      return "Please provide a search query to find documents.";
    }

    if (limit > 50) {
      console.log(`[LangChain Tool] ⚠️ Limit capped from ${limit} to 50 for performance`);
      limit = 50;
    }

    // Prepare search options
    const searchOptions: SearchOptions = {
      searchType: searchType as any,
      limit,
      threshold,
      specificDocumentIds,
      keywordWeight: searchType === 'keyword' ? 1.0 : 0.5,
      vectorWeight: searchType === 'semantic' ? 1.0 : 0.5,
      massSelectionPercentage: 0.6
    };

    console.log(`[LangChain Tool] 🔧 Search options prepared:`, searchOptions);

    // Execute search using the smart hybrid search function
    console.log(`[LangChain Tool] 🔍 Calling searchSmartHybridDebug with trimmed query: "${query.trim()}"`);
    const searchStartTime = Date.now();

    const searchResults = await searchSmartHybridDebug(
      query.trim(),
      userId,
      searchOptions
    );

    const searchDuration = Date.now() - searchStartTime;
    console.log(`[LangChain Tool] ⏱️ Search completed in ${searchDuration}ms`);

    console.log(`[LangChain Tool] 📊 Raw search results received:`, {
      type: typeof searchResults,
      isArray: Array.isArray(searchResults),
      length: searchResults?.length || 0,
      firstResultType: searchResults?.[0] ? typeof searchResults[0] : 'N/A'
    });

    // Ensure we have an array
    if (!Array.isArray(searchResults)) {
      const errorMsg = `searchSmartHybridDebug returned ${typeof searchResults} instead of array`;
      console.error(`[LangChain Tool] ❌ ${errorMsg}:`, searchResults);
      return `Error: Search function returned invalid data type. Expected array but got ${typeof searchResults}.`;
    }

    if (searchResults.length === 0) {
      console.log(`[LangChain Tool] 📭 No results found for query: "${query}"`);
      return `No documents found matching "${query}". The knowledge base may not contain relevant documents for this query. Try using different keywords or upload relevant documents first.`;
    }

    // Format results for LangChain consumption and create response text
    console.log(`[LangChain Tool] 🔧 Formatting ${searchResults.length} results...`);

    const formattedResults = searchResults.slice(0, 5).map((result, index) => {
      console.log(`[LangChain Tool] 🔧 Formatting result ${index + 1}:`, {
        id: result.id,
        name: result.name,
        contentLength: result.content?.length || 0,
        similarity: result.similarity,
        hasContent: !!result.content,
        hasSummary: !!result.summary
      });

      return {
        rank: index + 1,
        document_name: result.name || 'Unknown Document',
        similarity_score: (result.similarity || 0).toFixed(3),
        content_preview: (result.content || '').substring(0, 400) + ((result.content || '').length > 400 ? '...' : ''),
        document_summary: result.summary || 'No summary available',
        category: result.aiCategory || 'Uncategorized',
        created_date: result.createdAt || 'Unknown date',
        document_id: String(result.id)
      };
    });

    // Create structured response text
    const responseText = `Found ${searchResults.length} relevant documents for "${query}":\n\n${formattedResults.map(result => 
      `${result.rank}. **${result.document_name}** (Similarity: ${result.similarity_score})\n` +
      `   Category: ${result.category}\n` +
      `   Summary: ${result.document_summary}\n` +
      `   Content Preview: ${result.content_preview}\n`
    ).join('\n')}`;

    const totalDuration = Date.now() - startTime;
    console.log(`[LangChain Tool] ✅ COMPLETED: Total execution time ${totalDuration}ms`);
    console.log(`[LangChain Tool] 📤 FINAL RETURN: Response length ${responseText.length} characters`);
    console.log(`[LangChain Tool] 📤 FINAL RETURN: Response type: ${typeof responseText}`);
    console.log(`[LangChain Tool] 📤 FINAL RETURN: Is string: ${typeof responseText === 'string'}`);
    console.log(`[LangChain Tool] 📤 FINAL RETURN: Is empty: ${!responseText || responseText.length === 0}`);

    // Log response preview
    console.log(`[LangChain Tool] 📄 Response preview:`, responseText.substring(0, 200) + '...');
    console.log(`[LangChain Tool] === DOCUMENT SEARCH TOOL RETURNING TO LANGCHAIN ===`);

    return responseText;

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[LangChain Tool] 🚨 Document search error after ${totalDuration}ms:`, error);
    console.error('[LangChain Tool] 🚨 Error details:', {
      type: error?.constructor?.name || 'Unknown',
      message: error?.message || 'No message',
      query: `"${query}"`,
      userId,
      searchType,
      limit,
      threshold
    });
    console.error('[LangChain Tool] 🚨 Error stack:', error?.stack);

    // Return descriptive error message instead of empty result
    const errorMessage = `ERROR: Document search failed - ${error?.message || 'unknown error occurred'}. Please try again or contact support if the issue persists.`;
    console.log(`[LangChain Tool] 🔄 Returning error message: ${errorMessage}`);
    return errorMessage;
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

/**
 * Personal HR Query Tool for LangChain
 * 
 * Allows users to query their personal employee information using their citizen ID.
 * Returns specific employee fields as requested by the user.
 * 
 * @param citizenId - The Thai citizen ID (13 digits) to look up employee data
 * @returns Promise<string> - Formatted employee information
 * 
 * @example
 * const employeeInfo = await personalHrQuery({
 *   citizenId: "1234567890123"
 * });
 */
export async function personalHrQuery({
  citizenId
}: {
  citizenId: string;
}): Promise<string> {
  const startTime = Date.now();
  console.log(`[LangChain Tool] ⚡ ENTRY: personalHrQuery called at ${new Date().toISOString()}`);
  console.log(`[LangChain Tool] 📋 Input Parameters:`, {
    citizenId: `"${citizenId}"`,
  });

  try {
    // Validate inputs
    if (!citizenId) {
      const errorMsg = `Missing required parameter: citizenId`;
      console.error(`[LangChain Tool] ❌ ${errorMsg}`);
      return `Error: ${errorMsg}. Please provide your Thai Citizen ID (13 digits).`;
    }

    // Validate Thai Citizen ID format (13 digits)
    if (!/^\d{13}$/.test(citizenId.trim())) {
      console.log(`[LangChain Tool] ⚠️ Invalid citizen ID format: ${citizenId}`);
      return "Please provide a valid Thai Citizen ID with exactly 13 digits.";
    }

    console.log(`[LangChain Tool] 🔍 Looking up employee with citizen ID: ${citizenId}`);
    const searchStartTime = Date.now();

    // Look up employee in HR database
    const [employee] = await db
      .select({
        employeeId: hrEmployees.employeeId,
        firstName: hrEmployees.firstName,
        lastName: hrEmployees.lastName,
        email: hrEmployees.email,
        phone: hrEmployees.phone,
        department: hrEmployees.department,
        position: hrEmployees.position,
        hireDate: hrEmployees.hireDate,
        leaveDays: hrEmployees.leaveDays,
        isActive: hrEmployees.isActive
      })
      .from(hrEmployees)
      .where(eq(hrEmployees.citizenId, citizenId.trim()))
      .limit(1);

    const searchDuration = Date.now() - searchStartTime;
    console.log(`[LangChain Tool] ⏱️ HR database query completed in ${searchDuration}ms`);

    if (!employee || !employee.isActive) {
      console.log(`[LangChain Tool] 📭 No active employee found for citizen ID: ${citizenId}`);
      return `No active employee record found for the provided Thai Citizen ID. Please verify your citizen ID or contact HR for assistance.`;
    }

    // Format employee information
    console.log(`[LangChain Tool] 🔧 Formatting employee information for: ${employee.firstName} ${employee.lastName}`);

    const employeeInfo = {
      employeeId: employee.employeeId,
      citizenId: citizenId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone,
      department: employee.department,
      position: employee.position,
      startDate: employee.hireDate,
      leaveDays: employee.leaveDays
    };

    // Create structured response text in Thai with proper formatting
    const responseText = `## ข้อมูลพนักงานส่วนบุคคล

**รหัสพนักงาน:** ${employeeInfo.employeeId}  
**ชื่อ-นามสกุล:** ${employeeInfo.firstName} ${employeeInfo.lastName}  
**อีเมล:** ${employeeInfo.email || 'ไม่มีข้อมูล'}  
**เบอร์โทรศัพท์:** ${employeeInfo.phone || 'ไม่มีข้อมูล'}  
**แผนก:** ${employeeInfo.department}  
**ตำแหน่ง:** ${employeeInfo.position}  
**วันที่เริ่มงาน:** ${employeeInfo.startDate ? new Date(employeeInfo.startDate).toLocaleDateString('th-TH') : 'ไม่มีข้อมูล'}  
**วันลาคงเหลือ:** ${employeeInfo.leaveDays} วัน  

*ข้อมูลนี้ได้มาจากระบบ HR และเป็นข้อมูลล่าสุด ณ วันที่ ${new Date().toLocaleDateString('th-TH')}*`;

    const totalDuration = Date.now() - startTime;
    console.log(`[LangChain Tool] ✅ COMPLETED: Personal HR query completed in ${totalDuration}ms`);
    console.log(`[LangChain Tool] 📤 FINAL RETURN: Response length ${responseText.length} characters`);
    console.log(`[LangChain Tool] === PERSONAL HR QUERY TOOL RETURNING TO LANGCHAIN ===`);

    return responseText;

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[LangChain Tool] 🚨 Personal HR query error after ${totalDuration}ms:`, error);
    console.error('[LangChain Tool] 🚨 Error details:', {
      type: error?.constructor?.name || 'Unknown',
      message: error?.message || 'No message',
      citizenId: `"${citizenId}"`,
    });
    console.error('[LangChain Tool] 🚨 Error stack:', error?.stack);

    // Return descriptive error message instead of empty result
    const errorMessage = `ERROR: Personal HR query failed - ${error?.message || 'unknown error occurred'}. Please try again or contact HR support if the issue persists.`;
    console.log(`[LangChain Tool] 🔄 Returning error message: ${errorMessage}`);
    return errorMessage;
  }
}

// Export the tools in a format compatible with LangChain tool binding
export const langchainTools = {
  documentSearch,
  getDocumentById,
  listUserDocuments,
  personalHrQuery
};