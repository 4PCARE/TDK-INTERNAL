import express from "express";
import { storage } from "./storage";
import { semanticSearchServiceV2 } from "./services/semanticSearchV2";
import { generateChatResponse } from "./services/openai";
import { aiKeywordExpansionService } from "./services/aiKeywordExpansion";
// Import search service at the top
import { advancedKeywordSearchService } from './services/advancedKeywordSearch';
import { searchSmartHybridV1 } from './services/newSearch';

// Debug: Check service availability at startup
console.log('DEBUG: Checking service availability...');
console.log('DEBUG: semanticSearchServiceV2 type:', typeof semanticSearchServiceV2);
console.log('DEBUG: semanticSearchServiceV2 methods:', Object.keys(semanticSearchServiceV2 || {}));
console.log('DEBUG: performChunkSplitAndRankSearch available:', typeof semanticSearchServiceV2?.performChunkSplitAndRankSearch);
console.log('DEBUG: searchDocuments available:', typeof semanticSearchServiceV2?.searchDocuments);

const router = express.Router();

// Simple health check endpoint
router.get('/debug/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Debug routes are working'
  });
});

router.post('/api/debug/ai-input', async (req, res) => {
  console.log('=== DEBUG ENDPOINT CALLED ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('=== END REQUEST INFO ===');

  // Force JSON response headers early
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');

  // Capture logs for the debug response
  const debugLogs: string[] = [];
  let originalLog = console.log;
  let originalError = console.error;

  // Override console methods to capture logs
  console.log = (...args) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
    debugLogs.push(`[LOG] ${message}`);
    originalLog(...args);
  };

  console.error = (...args) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
    debugLogs.push(`[ERROR] ${message}`);
    originalError(...args);
  };

  try {
    // Content type already set above

    const { userMessage, specificDocumentId, specificDocumentIds, userId, searchType = 'hybrid', keywordWeight = 0.3, vectorWeight = 0.7 } = req.body;

    console.log(`=== AI INPUT DEBUG FOR USER ${userId} ===`);
    console.log(`Search Type: ${searchType}, User Message: ${userMessage}`);
    console.log(`Document IDs: ${specificDocumentIds ? (specificDocumentIds as number[]).join(', ') : 'All documents'}`);

    let documentContext = '';
    let searchMetrics: any = {};
    let chunkDetails: any[] = [];
    let searchWorkflow: any = {};
    let searchResults: any[] = [];

    // Capture console output
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      debugLogs.push(`[INFO] ${args.join(' ')}`);
      originalLog(...args);
    };

    console.warn = (...args) => {
      debugLogs.push(`[WARN] ${args.join(' ')}`);
      originalWarn(...args);
    };

    console.error = (...args) => {
      debugLogs.push(`[ERROR] ${args.join(' ')}`);
      originalError(...args);
    };

    try {
      let searchResults: any[] = [];
      let vectorResults: any[] = [];
      let combinedContent: Array<{ weightedScore: number; [k: string]: any }> = [];

      if (searchType === 'chunk_split_rank') {
        // Use the enhanced chunk split and rank search
        const { SemanticSearchServiceV2 } = await import('./services/semanticSearchV2');
        const searchService = new SemanticSearchServiceV2();

        // Parse specific document IDs if provided
        const specificDocumentIds: number[] = req.body.specificDocumentIds || [];

        // Get keyword candidates first
        console.log("=== GETTING KEYWORD CANDIDATES ===");
        // If performAdvancedKeywordSearch doesn't exist, call the available method or skip this section for now.
        const keywordResults: any[] = [];
        try {
          const keywordSearchPossible = typeof searchService.performAdvancedKeywordSearch === 'function';
          if (keywordSearchPossible) {
            const keywordResults = await searchService.performAdvancedKeywordSearch(userMessage, userId, {
              maxResults: 20,
              specificDocumentIds: specificDocumentIds
            });
            searchWorkflow.keywordCandidates = keywordResults.map((result: any, index: number) => ({
              id: result.id,
              documentId: result.id,
              content: result.content,
              score: result.keywordScore || result.score || 0,
              matchType: result.matchType || 'unknown'
            }));
          } else {
            console.warn("performAdvancedKeywordSearch is not available on semanticSearchServiceV2.");
          }
        } catch (kwError) {
          console.error("Error during keyword search:", kwError);
          debugLogs.push(`[WARN] Keyword search failed: ${kwError.message}`);
        }


        // Get vector candidates
        console.log("=== GETTING VECTOR CANDIDATES ===");
        const { vectorService } = await import('./services/vectorService');
        const vectorResults = await vectorService.searchDocuments(userMessage, userId, 20, specificDocumentIds);

        searchWorkflow.vectorCandidates = vectorResults.map((result: any, index: number) => ({
          id: result.document.id,
          documentId: result.document.metadata?.originalDocumentId,
          chunkIndex: result.document.chunkIndex,
          content: result.document.content,
          similarity: result.similarity,
          metadata: result.document.metadata
        }));

        // Perform the full search
        searchResults = await searchService.performChunkSplitAndRankSearch(userMessage, userId, {
          maxResults: 10,
          specificDocumentIds: specificDocumentIds,
          keywordWeight,
          vectorWeight
        });

        // Add ranking process details
        searchWorkflow.rankingProcess = {
          keywordWeight,
          vectorWeight,
          formula: `Combined Score = (Keyword Score × ${keywordWeight}) + (Vector Score × ${vectorWeight})`,
          stepByStep: [
            `1. Performed keyword search - found ${keywordResults.length} candidates`,
            `2. Performed vector search - found ${vectorResults.length} chunk candidates`,
            `3. Applied weighted scoring with keyword weight: ${keywordWeight}, vector weight: ${vectorWeight}`,
            `4. Ranked and selected top ${searchResults.length} results`,
            `5. Created document context for AI prompt`
          ]
        };

        chunkDetails = searchResults.map((result: any, index: number) => ({
            chunkId: result.chunkId || result.id,
            id: result.chunkId || result.id,
            type: 'chunk_split_rank',
            content: result.content,
            similarity: result.similarity,
            keywordScore: result.keywordScore,
            vectorScore: result.vectorScore,
            combinedScore: result.combinedScore,
            finalRank: index + 1,
            scoringBreakdown: {
              'Keyword Score': result.keywordScore || 0,
              'Vector Score': result.vectorScore || 0,
              'Keyword Weighted': (result.keywordScore || 0) * keywordWeight,
              'Vector Weighted': (result.vectorScore || 0) * vectorWeight,
              'Combined Score': result.combinedScore || 0
            }
          }));

          // Console log with concise chunk info
          console.log(`📊 SEARCH RESULTS: Found ${searchResults.length} chunks from ${searchType} search`);
          searchResults.forEach((result, index) => {
            const source = (result.keywordScore > 0 && result.vectorScore > 0) ? 'HYBRID' :
                          (result.keywordScore > 0) ? 'KEYWORD' : 'SEMANTIC';
            const score = result.combinedScore || result.similarity;
            const preview = result.content.substring(0, 80).replace(/\n/g, ' ') + (result.content.length > 80 ? '...' : '');
            console.log(`  ${index + 1}. [${source}] Score: ${score.toFixed(4)} | "${preview}"`);

            // Show detailed info for keyword chunks
            if (result.keywordScore > 0) {
              console.log(`    🔍 KEYWORD DETAILS:`);
              console.log(`      Chunk ID: ${result.chunkId || result.id}`);
              console.log(`      Keyword Score: ${result.keywordScore.toFixed(4)}`);
              console.log(`      Vector Score: ${result.vectorScore ? result.vectorScore.toFixed(4) : 'N/A'}`);
              console.log(`      Content Length: ${result.content.length} chars`);
              console.log(`      Content Preview (200 chars): "${result.content.substring(0, 200).replace(/\n/g, ' ')}${result.content.length > 200 ? '...' : ''}"`);
            }
          })

        searchMetrics = {
          searchType: 'chunk_split_rank',
          keywordResults: keywordResults.length,
          vectorResults: vectorResults.length,
          combinedResults: searchResults.length,
          weights: {
            keyword: keywordWeight,
            vector: vectorWeight
          }
        };
      } else if (searchType === 'smart_hybrid') {
        // Use the new smart hybrid search with AI preprocessing
        console.log(`=== USING SMART HYBRID WITH AI PRE-FEED ===`);
        console.log("Memory before search:", process.memoryUsage());

        // Step 1: AI Query Preprocessing
        const { queryPreprocessor } = await import('./services/queryPreprocessor');

        // Get recent chat history if available (mock for now)
        const recentChatHistory = []; // TODO: Integrate with actual chat history

        // Build additional context with search configuration
        let additionalContext = `Document scope: ${specificDocumentIds ? specificDocumentIds.join(', ') : 'All documents'}`;

        // For debug, we can simulate search configuration
        if (req.query.searchConfig) {
          additionalContext += `\n\nSearch Configuration: ${req.query.searchConfig}`;
        }

        const queryAnalysis = await queryPreprocessor.analyzeQuery(
          userMessage,
          recentChatHistory,
          additionalContext
        );

        if (!queryAnalysis.needsSearch) {
          console.log(`🚫 PRE-FEED: Query doesn't need search, skipping pipeline`);
          searchResults = [];
          searchMetrics = {
            searchType: 'smart_hybrid_skipped',
            needsSearch: false,
            preprocessedQuery: queryAnalysis.enhancedQuery,
            reasoning: queryAnalysis.reasoning
          };
        } else {
          console.log(`✅ PRE-FEED: Using enhanced query with AI-determined weights`);

          const { searchSmartHybridDebug } = await import('./services/newSearch');
          searchResults = await searchSmartHybridDebug(queryAnalysis.enhancedQuery, userId, {
            specificDocumentIds: specificDocumentIds,
            keywordWeight: queryAnalysis.keywordWeight,
            vectorWeight: queryAnalysis.vectorWeight
          });

          searchMetrics = {
            searchType: 'smart_hybrid_ai_enhanced',
            originalQuery: userMessage,
            enhancedQuery: queryAnalysis.enhancedQuery,
            aiReasoning: queryAnalysis.reasoning,
            keywordResults: 0,
            vectorResults: 0,
            combinedResults: searchResults.length,
            weights: {
              keyword: queryAnalysis.keywordWeight,
              vector: queryAnalysis.vectorWeight
            }
          };
        }
      } else {
        // Handle other search types with basic workflow tracking
        if (searchType === 'vector') {
          const { vectorService } = await import('./services/vectorService');
          const vectorResults = await vectorService.searchDocuments(userMessage, userId, 10, specificDocumentIds);
          searchResults = vectorResults.map(r => ({
            content: r.document.content,
            name: `Document ${r.document.metadata?.originalDocumentId}`,
            similarity: r.similarity
          }));

          searchWorkflow.vectorCandidates = vectorResults.map(result => ({
            id: result.document.id,
            documentId: result.document.metadata?.originalDocumentId,
            content: result.document.content,
            similarity: result.similarity
          }));

          chunkDetails = searchResults.map((result, index) => ({
            chunkId: `vector_${index}`,
            type: 'vector',
            content: result.content,
            similarity: result.similarity,
            finalRank: index + 1
          }));
        }

        searchMetrics = {
          searchType: searchType,
          vectorResults: searchResults.length,
          combinedResults: searchResults.length,
          weights: {
            keyword: keywordWeight,
            vector: vectorWeight
          }
        };
      }

      // Create document context from search results
      documentContext = searchResults.map((result, index) =>
        `Document ${index + 1}: ${result.name || `Document ${index + 1}`}\n\nContent:\n${result.content}`
      ).join('\n\n---\n\n');
    } catch (error: unknown) {
        console.error('Debug search error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          error: 'Debug search failed',
          details: errorMessage
        });
      } finally {
      // Restore original console methods
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }

    // Generate AI prompt - ensure document names are properly resolved
    let contextDocuments = [];
    if (specificDocumentId) {
      const documents = await storage.getDocuments(userId);
      const doc = documents.find(d => d.id === specificDocumentId);
      if (doc) {
        contextDocuments.push({
          id: doc.id,
          name: doc.name || `Document ${doc.id}`,
          content: documentContext
        });
      }
    }

    const systemMessage = `You are an AI assistant helping users analyze and understand specific documents. You are currently focusing on a specific document provided in the context below.

Document context:
${documentContext || 'No specific document selected for analysis.'}

Answer questions specifically about this document. Provide detailed analysis, explanations, and insights based on the document's content. If the user's question cannot be answered from this specific document, clearly state that and explain what information is available in the document.`;

    console.log('\n=== SYSTEM MESSAGE ===');
    console.log(systemMessage);
    console.log('\n=== USER MESSAGE ===');
    console.log(userMessage);
    console.log('\n=== DOCUMENT CONTEXT LENGTH ===');
    console.log(`${documentContext.length} characters`);
    console.log('\n=== CHUNK DETAILS ===');
    console.log(`Found ${chunkDetails.length} chunks`);
    console.log('\n=== FULL DOCUMENT CONTEXT ===');
    console.log(documentContext);
    console.log('\n=== END DEBUG ===');

    // Return the debug information as JSON including captured logs
    const responseData = {
      systemMessage,
      userMessage,
      documentContext,
      documentContextLength: documentContext.length,
      searchMetrics,
      chunkDetails,
      searchWorkflow,
      debugLogs // Include the captured logs
    };

    // Restore original console methods
    console.log = originalLog;
    console.error = originalError;

    res.json(responseData);

  } catch (error: unknown) {
    // Restore console methods in case of error
    console.log = originalLog;
    console.error = originalError;

    console.error('FATAL ERROR in AI input debug:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : 'N/A';
    const errorType = error instanceof Error ? error.constructor.name : typeof error;
    const errorConstructor = error instanceof Error ? error.constructor.name : 'N/A';

    console.error('FATAL ERROR stack:', errorStack);
    console.error('FATAL ERROR type:', errorType);
    console.error('FATAL ERROR constructor:', errorConstructor);
    console.error('FATAL ERROR occurred at:', new Date().toISOString());
    console.error('FATAL ERROR request body:', JSON.stringify(req.body, null, 2));

    // Log all captured debug information
    console.error('CAPTURED DEBUG LOGS:', debugLogs);

    // Ensure we always return JSON, never HTML
    try {
      const errorResponse = {
        error: errorMessage || 'Unknown error occurred',
        errorType: errorType,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
        timestamp: new Date().toISOString(),
        endpoint: '/api/debug/ai-input',
        requestBody: req.body,
        debugLogs: debugLogs // Include logs even in error case
      };

      console.error('SENDING ERROR RESPONSE:', JSON.stringify(errorResponse, null, 2));
      res.status(500).json(errorResponse);
    } catch (jsonError) {
      // If even JSON response fails, send plain text
      console.error('CRITICAL: Failed to send JSON error response:', jsonError);
      const jsonErrorMessage = jsonError instanceof Error ? jsonError.message : 'Unknown JSON error';
      console.error('CRITICAL: jsonError stack:', jsonError instanceof Error ? jsonError.stack : 'N/A');
      res.status(500).send(`Internal server error - failed to generate proper error response. Original error: ${errorMessage}. JSON error: ${jsonErrorMessage}`);
    }
  }
});

// Utility function to escape HTML to prevent XSS
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

router.get("/debug/view-ai-input/:userId/:documentId", async (req, res) => {
  try {
    const { userId, documentId } = req.params;

    // Fetch the document (you might need to adjust this to match your data fetching)
    const documents = await storage.getDocuments(userId);
    const doc = documents.find(d => d.id === parseInt(documentId));

    if (!doc) {
      return res.status(404).send("Document not found");
    }

    // Dummy data for AI input (replace with actual data if needed)
    const aiInput = {
      systemMessage: `You are an AI assistant helping users analyze and understand the document: ${doc.name}.`,
      userMessage: "Summarize the key points of this document.",
      documentContext: doc.content?.substring(0, 5000) || "No content available."
    };

    // Create HTML to display the AI input
    let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>AI Input Debug</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { width: 80%; margin: 20px auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
                    h2 { color: #444; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
                    .message { margin-bottom: 15px; padding: 10px; border: 1px solid #eee; border-radius: 4px; background: #f9f9f9; }
                    .label { font-weight: bold; color: #555; display: block; margin-bottom: 5px; }
                    pre { white-space: pre-wrap; word-wrap: break-word; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>AI Input for Document: ${escapeHtml(doc.name)} (ID: ${doc.id})</h2>

                    <div class="message">
                        <span class="label">System Message:</span>
                        <pre>${escapeHtml(aiInput.systemMessage)}</pre>
                    </div>

                    <div class="message">
                        <span class="label">User Message:</span>
                        <pre>${escapeHtml(aiInput.userMessage)}</pre>
                    </div>

                    <div class="message">
                        <span class="label">Document Context:</span>
                        <pre>${escapeHtml(aiInput.documentContext)}</pre>
                    </div>
                </div>
            </body>
            </html>
        `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (error: unknown) {
    console.error("View AI input error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).send(`Error displaying AI input: ${errorMessage}`);
  }
});

router.post("/debug/analyze-document/:userId/:documentId", async (req, res) => {
  try {
    const { userId, documentId } = req.params;
    const { searchType = 'vector', userMessage = 'Please analyze this document.', keywordWeight = 0.3, vectorWeight = 0.7 } = req.body;

    console.log(`=== ANALYZING DOCUMENT ${documentId} FOR USER ${userId} ===`);
    console.log(`Search Type: ${searchType}, User Message: ${userMessage}`);

    // Fetch the document
    const documents = await storage.getDocuments(userId);
    const doc = documents.find(d => d.id === parseInt(documentId));

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    let documentContext = "";
    let chunkDetails: any[] = [];
    let searchMetrics = {
      searchType,
      keywordResults: 0,
      vectorResults: 0,
      combinedResults: 0,
      weights: searchType === 'weighted' ? { keyword: keywordWeight, vector: vectorWeight } : null
    };

    try {
      if (searchType === 'keyword') {
        // Keyword search logic
        console.log(`DEBUG: Performing keyword search for "${userMessage}"`);

        // For Thai text, be more flexible with search terms
        const searchTerms = userMessage.toLowerCase().split(/\s+/).filter((term: string) => term.length > 0);
        const docContent = doc.content || '';
        const docContentLower = docContent.toLowerCase();

        console.log(`DEBUG: Searching for terms: ${searchTerms.join(', ')} in document ${doc.name}`);

        let matchingSegments = [];
        let hasMatches = false;

        for (const term of searchTerms) {
          let index = 0;
          while ((index = docContentLower.indexOf(term, index)) !== -1) {
            hasMatches = true;
            const start = Math.max(0, index - 500);
            const end = Math.min(docContent.length, index + term.length + 500);
            const segment = docContent.substring(start, end);

            matchingSegments.push({
              term: term,
              position: index,
              segment: segment,
              score: 1.0
            });

            index += term.length;
            if (matchingSegments.filter(s => s.term === term).length >= 3) break;
          }
        }

        let phraseIndex = 0;
        while ((phraseIndex = docContentLower.indexOf(userMessage.toLowerCase(), phraseIndex)) !== -1) {
          hasMatches = true;
          const start = Math.max(0, phraseIndex - 500);
          const end = Math.min(docContent.length, phraseIndex + userMessage.length + 500);
          const segment = docContent.substring(start, end);

          matchingSegments.push({
            term: `EXACT_PHRASE: ${userMessage}`,
            position: phraseIndex,
            segment: segment,
            score: 2.0
          });

          phraseIndex += userMessage.length;
          if (matchingSegments.filter(s => s.term.startsWith('EXACT_PHRASE')).length >= 2) break;
        }

        if (hasMatches && matchingSegments.length > 0) {
          console.log(`DEBUG: Found ${matchingSegments.length} keyword matches`);
          matchingSegments.sort((a, b) => b.score - a.score || a.position - b.position);
          const uniqueSegments = [];
          const usedRanges: Array<{start: number; end: number}> = [];

          for (const match of matchingSegments) {
            const start = Math.max(0, match.position - 1000);
            const end = Math.min(docContent.length, match.position + match.term.length + 2000);

            const hasOverlap = usedRanges.some(range =>
              Math.max(start, range.start) < Math.min(end, range.end) - 300
            );

            if (!hasOverlap && uniqueSegments.length < 3) {
              const contextSegment = docContent.substring(start, end);
              uniqueSegments.push({
                ...match,
                segment: contextSegment,
                contextStart: start,
                contextEnd: end
              });
              usedRanges.push({ start, end });
            }
          }

          const keywordChunks = uniqueSegments.map((match, idx) =>
            `=== RELEVANT CHUNK ${idx + 1} (Score: ${match.score}) ===\n${match.segment}`
          ).join('\n\n---\n\n');

          documentContext = `Document: ${doc.name}\n\n${keywordChunks}`;

          uniqueSegments.forEach((match, idx) => {
            chunkDetails.push({
              chunkId: `kw-${doc.id}-match-${idx}`,
              content: match.segment || '',
              keywordScore: match.score,
              type: 'keyword',
              matchedTerm: match.term
            });
          });

          searchMetrics.keywordResults = uniqueSegments.length;
        } else {
          console.log(`DEBUG: No keyword matches found for "${userMessage}" in document ${doc.name}`);
          const sampleContent = docContent.substring(0, 2000);
          documentContext = `Document: ${doc.name}\nNo direct keyword matches found for: "${userMessage}"\n\nDocument sample content:\n${sampleContent}${docContent.length > 2000 ? '...' : ''}`;

          chunkDetails.push({
            chunkId: `kw-${doc.id}-sample`,
            content: sampleContent,
            keywordScore: 0.0,
            type: 'keyword-fallback'
          });

          searchMetrics.keywordResults = 0;
        }

      } else if (searchType === 'smart_hybrid') {
        // Use the new smart hybrid search
        const smartResults = await searchSmartHybridV1(userMessage, userId, {
          specificDocumentIds: req.body.specificDocumentIds || [],
          keywordWeight,
          vectorWeight,
          threshold: 0.3
        });

        searchResults = smartResults.map(result => ({
          content: result.content,
          name: result.name,
          similarity: result.similarity
        }));

        chunkDetails = smartResults.map((result, index) => ({
          chunkId: result.id,
          type: 'smart_hybrid',
          content: result.content,
          similarity: result.similarity,
          finalRank: index + 1
        }));

        searchMetrics = {
          searchType: 'smart_hybrid',
          keywordResults: 0,
          vectorResults: 0,
          combinedResults: searchResults.length,
          weights: {
            keyword: keywordWeight,
            vector: vectorWeight
          }
        };
      } else if (searchType === 'vector') {
        // Vector search logic
        console.log(`DEBUG: Performing vector search for "${userMessage}"`);
        const { vectorService } = await import('./services/vectorService');
        const vectorResults = await vectorService.searchDocuments(userMessage, userId, 3, [parseInt(documentId)]);
        searchMetrics.vectorResults = vectorResults.length;

        console.log(`DEBUG: Found ${vectorResults.length} vector results`);
        if (vectorResults.length > 0) {
          documentContext = vectorResults
            .slice(0, 3)
            .map(result =>
              `Document: ${doc.name}\nRelevant Content: ${result.document.content}`
            )
            .join("\n\n");

          vectorResults.slice(0, 3).forEach((result, idx) => {
            chunkDetails.push({
              chunkId: result.document.id || `vec-${doc.id}-${idx}`,
              content: result.document.content,
              similarity: result.similarity,
              vectorScore: result.similarity,
              type: 'vector'
            });
          });
        } else {
          console.log(`DEBUG: No vector results, using fallback content`);
          documentContext = `Document: ${doc.name}\nSummary: ${doc.summary}\nTags: ${doc.tags?.join(", ")}\nContent: ${doc.content?.substring(0, 30000) || 'No content available'}`;

          chunkDetails.push({
            chunkId: `vec-${doc.id}-fallback`,
            content: doc.content?.substring(0, 30000) || doc.summary || 'No content available',
            vectorScore: 0.0,
            type: 'vector-fallback'
          });
        }

      } else if (searchType === 'hybrid' || searchType === 'weighted') {
        // Hybrid search logic
        console.log(`DEBUG: Performing ${searchType} search`);

        let keywordMatches = [];
        let vectorResults: any[] = [];
        let combinedContent: Array<{ weightedScore: number; [k: string]: any }> = [];

        // First, get keyword matches using the same logic as pure keyword search
        const searchTerms = userMessage.toLowerCase().split(/\s+/).filter((term: string) => term.length > 0);
        const docContent = doc.content || '';
        const docContentLower = docContent.toLowerCase();

        console.log(`DEBUG: Searching for terms: ${searchTerms.join(', ')} in document ${doc.name}`);

        // Find all matches and their positions (same as pure keyword search)
        let matchingSegments = [];
        let hasMatches = false;

        // Search for individual terms
        for (const term of searchTerms) {
          let index = 0;
          while ((index = docContentLower.indexOf(term, index)) !== -1) {
            hasMatches = true;
            // Extract context around the match (500 chars before and after)
            const start = Math.max(0, index - 500);
            const end = Math.min(docContent.length, index + term.length + 500);
            const segment = docContent.substring(start, end);

            matchingSegments.push({
              term: term,
              position: index,
              segment: segment,
              score: 1.0
            });

            index += term.length;

            // Limit to 3 matches per term to avoid too much content
            if (matchingSegments.filter(s => s.term === term).length >= 3) break;
          }
        }

        // Also search for the entire query as a phrase
        let phraseIndex = 0;
        while ((phraseIndex = docContentLower.indexOf(userMessage.toLowerCase(), phraseIndex)) !== -1) {
          hasMatches = true;
          const start = Math.max(0, phraseIndex - 500);
          const end = Math.min(docContent.length, phraseIndex + userMessage.length + 500);
          const segment = docContent.substring(start, end);

          matchingSegments.push({
            term: `EXACT_PHRASE: ${userMessage}`,
            position: phraseIndex,
            segment: segment,
            score: 2.0 // Higher score for exact phrase matches
          });

          phraseIndex += userMessage.length;
          if (matchingSegments.filter(s => s.term.startsWith('EXACT_PHRASE')).length >= 2) break;
        }

        if (hasMatches && matchingSegments.length > 0) {
          console.log(`DEBUG: Found ${matchingSegments.length} keyword matches`);

          // Sort by score (exact phrases first) then by position
          matchingSegments.sort((a, b) => b.score - a.score || a.position - b.position);
          // Take best matches and remove overlaps
          const uniqueSegments = [];
          const usedRanges: Array<{start: number; end: number}> = [];

          for (const match of matchingSegments) {
            const start = Math.max(0, match.position - 1000); // Expand context window
            const end = Math.min(docContent.length, match.position + match.term.length + 2000); // Larger context

            // Check if this range overlaps significantly with existing ones
            const hasOverlap = usedRanges.some(range =>
              Math.max(start, range.start) < Math.min(end, range.end) - 300
            );

            if (!hasOverlap && uniqueSegments.length < 3) { // Limit to 3 best matches
              // Extract larger context around the match
              const contextSegment = docContent.substring(start, end);
              uniqueSegments.push({
                ...match,
                segment: contextSegment,
                contextStart: start,
                contextEnd: end
              });
              usedRanges.push({ start, end });
            }
          }

          // Build keyword chunks the same way as pure keyword search
          uniqueSegments.forEach((match, idx) => {
            const similarity = match.score / 2.0; // Normalize score to 0-1 range
            keywordMatches.push({
              content: match.segment,
              matchingTerms: [match.term],
              totalTerms: searchTerms.length,
              score: match.score,
              similarity: similarity,
              chunkId: `kw-${doc.id}-match-${idx}`
            });
          });

          console.log(`DEBUG: Created ${keywordMatches.length} keyword chunks`);
        } else {
          console.log(`DEBUG: No keyword matches found for "${userMessage}" in document ${doc.name}`);
          // Instead of no matches, provide a sample of the document content (same as pure keyword search)
          const sampleContent = docContent.substring(0, 2000);
          keywordMatches.push({
            content: sampleContent + (docContent.length > 2000 ? '...' : ''),
            matchingTerms: [],
            totalTerms: searchTerms.length,
            score: 0.0,
            similarity: 0.0,
            chunkId: `kw-${doc.id}-sample`
          });
        }

        // Get vector results using same logic as pure vector search
        try {
          const { vectorService } = await import('./services/vectorService');
          vectorResults = await vectorService.searchDocuments(userMessage, userId, 3, [parseInt(documentId)]);
          console.log(`DEBUG: Found ${vectorResults.length} vector results for hybrid search`);
        } catch (vectorError: unknown) {
          console.error("Vector search failed in hybrid mode:", vectorError);
          const errorMessage = vectorError instanceof Error ? vectorError.message : 'Unknown vector error';
          console.error(`Vector search error details: ${errorMessage}`);
          vectorResults = [];
        }

        // Get vector content
        if (vectorResults.length > 0) {
          const vWeight = searchType === 'weighted' ? vectorWeight : 0.5;
          vectorResults.forEach((result, idx) => {
            const adjustedWeight = vWeight * (1 - idx * 0.1);
            const weightedScore = result.similarity * adjustedWeight;
            combinedContent.push({
              type: 'vector',
              content: result.document.content,
              weight: adjustedWeight,
              similarity: result.similarity,
              weightedScore: weightedScore,
              source: `Vector chunk ${idx + 1}`,
              chunkId: result.document.id || `vec-${doc.id}-${idx}`,
              vectorScore: result.similarity
            });
          });
        }

        // Get keyword content
        if (keywordMatches.length > 0) {
          const kWeight = searchType === 'weighted' ? keywordWeight : 0.5;
          keywordMatches.forEach((match, idx) => {
            const similarity = match.similarity || 0.0;
            const weightedScore = similarity * kWeight;
            const matchTermsDesc = match.matchingTerms.length > 0 ?
              `(${match.matchingTerms.filter(t => !t.startsWith('EXACT_PHRASE')).length}/${match.totalTerms} terms)` :
              '(sample content)';

            combinedContent.push({
              type: 'keyword',
              content: match.content,
              weight: kWeight,
              similarity: similarity,
              weightedScore: weightedScore,
              source: `Keyword match ${matchTermsDesc}`,
              chunkId: match.chunkId || `kw-${doc.id}-${idx}`,
              keywordScore: similarity
            });
          });
        }

        combinedContent.sort((a, b) => b.weightedScore - a.weightedScore);
        searchMetrics.combinedResults = combinedContent.length;

        documentContext = `Document: ${doc.name}\n\n` +
          combinedContent.slice(0, 5).map((item, index) =>
            `=== RANK #${index + 1} - ${item.source.toUpperCase()} ===\nWeighted Score: ${item.weightedScore.toFixed(4)} (Similarity: ${item.similarity.toFixed(4)} × Weight: ${item.weight.toFixed(2)})\n\n${item.content.length > 3000 ? item.content.substring(0, 3000) + '...' : item.content}`
          ).join("\n\n---\n\n");

        chunkDetails = combinedContent.map((item, index) => ({
          id: item.chunkId,
          content: item.content || '',
          type: item.type,
          similarity: item.type === 'vector' ? item.vectorScore : item.keywordScore,
          weight: item.weight,
          weightedScore: item.weightedScore,
          finalRank: index + 1,
          source: item.source
        }));

      } else {
        console.log(`DEBUG: Unknown search type ${searchType}, using fallback`);
        documentContext = `Document: ${doc.name}\nSummary: ${doc.summary}\nTags: ${doc.tags?.join(", ")}\nContent: ${doc.content?.substring(0, 30000) || 'No content available'}`;

        chunkDetails.push({
          chunkId: `fallback-${doc.id}`,
          content: doc.content?.substring(0, 30000) || doc.summary || 'No content available',
          type: 'fallback'
        });
      }

    } catch (error: unknown) {
      console.error("Search failed:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      documentContext = `Document: ${doc.name}\nSummary: ${doc.summary || 'No summary'}\nTags: ${doc.tags?.join(", ") || 'No tags'}\nContent: ${doc.content?.substring(0, 30000) || 'No content available'}`;
      searchMetrics.error = errorMessage;

      chunkDetails.push({
              chunkId: `error-${doc.id}`,
        content: doc.content?.substring(0, 30000) || doc.summary || 'No content available',
        type: 'error'
      });
    }

    const documentName = doc.name || `Document ${doc.id}`;
    const systemMessage = `You are an AI assistant helping users analyze and understand the document: ${documentName}.\n\nDocument context:\n${documentContext}`;
    const aiInput = { systemMessage, userMessage, documentContext };

    console.log(`📋 Document Analysis Summary:`);
    console.log(`📄 Document: ${documentName} (ID: ${doc.id})`);
    console.log(`🔍 Search Type: ${searchType}`);
    console.log(`📊 Chunks Found: ${chunkDetails.length}`);
    console.log(`📏 Context Length: ${documentContext.length} characters`);

    // Generate HTML output for debug
    let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Document Analysis Debug</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { width: 90%; margin: 20px auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
                    h2 { color: #444; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
                    .section { margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 5px; background: #f9f9f9; }
                    .label { font-weight: bold; color: #555; display: block; margin-bottom: 5px; }
                    pre { white-space: pre-wrap; word-wrap: break-word; font-size: 14px; }
                    .chunk { border: 1px solid #ddd; margin: 10px 0; padding: 10px; border-radius: 5px; }
                    .chunk-header { font-weight: bold; margin-bottom: 5px; }
                    .chunk-content { font-size: 13px; color: #666; background: white; padding: 8px; border-radius: 3px; max-height: 150px; overflow-y: auto; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Document Analysis Debug: ${escapeHtml(doc.name)} (ID: ${doc.id})</h2>

                    <div class="section">
                        <span class="label">System Message:</span>
                        <pre>${escapeHtml(aiInput.systemMessage)}</pre>
                    </div>

                    <div class="section">
                        <span class="label">User Message:</span>
                        <pre>${escapeHtml(aiInput.userMessage)}</pre>
                    </div>

                    <div class="section">
                        <span class="label">Document Context:</span>
                        <pre>${escapeHtml(aiInput.documentContext)}</pre>
                    </div>

                    <div class="section">
                        <span class="label">Chunk Details:</span>
                        <div>
                            ${
                                chunkDetails.length > 0 ?
                                    chunkDetails.map((chunk, idx) => {
                                        const content = chunk.content || '';
                                        return `
                                        <div style="border: 1px solid #ddd; margin: 10px 0; padding: 10px; border-radius: 5px;">
                                            <div style="font-weight: bold; margin-bottom: 5px;">
                                                Chunk ${idx + 1}: ${chunk.id || chunk.chunkId || 'Unknown ID'}
                                                ${chunk.type ? `(${chunk.type})` : ''}
                                                ${chunk.similarity ? ` - Similarity: ${chunk.similarity.toFixed(4)}` : ''}
                                                ${chunk.weight ? ` - Weight: ${chunk.weight.toFixed(2)}` : ''}
                                                ${chunk.weightedScore ? ` - Weighted Score: ${chunk.weightedScore.toFixed(4)}` : ''}
                                                ${chunk.finalRank ? ` - Rank: #${chunk.finalRank}` : ''}
                                            </div>
                                            <div style="font-size: 13px; color: #666; background: white; padding: 8px; border-radius: 3px; max-height: 150px; overflow-y: auto;">
                                                ${escapeHtml(content.substring(0, 300))}${content.length > 300 ? '...' : ''}
                                            </div>
                                        </div>
                                        `;
                                    }).join('')
                                    : '<p>No chunks available.</p>'
                            }
                        </div>
                    </div>

                    <div class="section">
                        <span class="label">Search Metrics:</span>
                        <pre>${JSON.stringify(searchMetrics, null, 2)}</pre>
                    </div>
                </div>
            </body>
            </html>
        `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (error: unknown) {
    console.error("Analyze document debug error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: "Analyze document debug failed", details: errorMessage });
  }
});

router.get("/debug/find-xolo/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`=== SEARCHING FOR XOLO ACROSS ALL DOCUMENTS FOR USER ${userId} ===`);

    // Get all documents for the user
    const documents = await storage.getDocuments(userId);
    console.log(`Found ${documents.length} total documents`);

    const xoloResults = [];

    // Search through each document
    for (const doc of documents) {
      const content = doc.content?.toLowerCase() || '';
      const name = doc.name?.toLowerCase() || '';
      const summary = doc.summary?.toLowerCase() || '';

      // Check for various XOLO variations
      const searchTerms = ['xolo', 'โซโล่', 'โซโล', 'XOLO'];
      let found = false;
      let foundTerms = [];

      for (const term of searchTerms) {
        if (content.includes(term.toLowerCase()) ||
          name.includes(term.toLowerCase()) ||
          summary.includes(term.toLowerCase())) {
          found = true;
          foundTerms.push(term);
        }
      }

      if (found) {
        // Find the specific line/context where XOLO appears
        const lines = content.split('\n');
        const matchingLines = lines.filter(line =>
          searchTerms.some(term => line.toLowerCase().includes(term.toLowerCase()))
        );

        xoloResults.push({
          documentId: doc.id,
          documentName: doc.name,
          foundTerms,
          matchingLines: matchingLines.slice(0, 5), // First 5 matching lines
          contentLength: content.length,
          hasVectorData: doc.isInVectorDb || false
        });

        console.log(`FOUND XOLO in Document ${doc.id}: ${doc.name}`);
        console.log(`Found terms: ${foundTerms.join(', ')}`);
        console.log(`Matching lines: ${matchingLines.slice(0, 2).join(' | ')}`);
      }
    }

    // Also search in vector database if available
    console.log(`\n=== SEARCHING VECTOR DATABASE ===`);
    try {
      const { vectorService } = await import('./services/vectorService');
      const vectorResults = await vectorService.searchDocuments('XOLO', userId, 10);
      console.log(`Vector search returned ${vectorResults.length} results`);

      const vectorXoloResults = vectorResults.map(result => ({
        similarity: result.similarity,
        documentId: result.document.metadata.originalDocumentId || result.document.id,
        content: result.document.content.substring(0, 500),
        hasXolo: result.document.content.toLowerCase().includes('xolo')
      }));

      res.json({
        totalDocuments: documents.length,
        documentsWithXolo: xoloResults,
        vectorResults: vectorXoloResults,
        summary: {
          foundInDocuments: xoloResults.length,
          foundInVector: vectorXoloResults.filter(r => r.hasXolo).length
        }
      });

    } catch (vectorError: unknown) {
      console.error("Vector search failed:", vectorError);
      const errorMessage = vectorError instanceof Error ? vectorError.message : 'Unknown vector error';
      res.json({
        totalDocuments: documents.length,
        documentsWithXolo: xoloResults,
        vectorResults: [],
        vectorError: errorMessage,
        summary: {
          foundInDocuments: xoloResults.length,
          foundInVector: 0
        }
      });
    }

  } catch (error: unknown) {
    console.error("XOLO search debug error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: "XOLO search debug failed", details: errorMessage });
  }
});

// Debug endpoint to test AI keyword expansion
router.post("/debug/ai-keyword-expansion", async (req, res) => {
  try {
    const { userMessage, chatHistory, userId } = req.body;

    if (!userMessage || !userId) {
      return res.status(400).json({ error: "Missing required parameters: userMessage, userId" });
    }

    console.log(`=== AI KEYWORD EXPANSION DEBUG ===`);
    console.log(`User Message: ${userMessage}`);
    console.log(`User ID: ${userId}`);

    // Call the AI keyword expansion service
    const expandedKeywords = await aiKeywordExpansionService.generateRelatedKeywords(
      userMessage,
      chatHistory,
      userId
    );

    console.log(`Expanded Keywords: ${JSON.stringify(expandedKeywords, null, 2)}`);

    res.json({
      originalMessage: userMessage,
      expandedKeywords
    });

  } catch (error: unknown) {
    console.error("AI keyword expansion debug error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: "AI keyword expansion debug failed", details: errorMessage });
  }
});

// Test advanced keyword search without authentication
router.get('/test-advanced-keyword-search', async (req, res) => {
  try {
    const query = req.query.query as string || 'XOLO restaurant';
    const userId = req.query.userId as string || '43981095'; // Default test user

    console.log(`Testing advanced keyword search: "${query}" for user ${userId}`);

    const { advancedKeywordSearchService } = await import('./services/advancedKeywordSearch');

    // Test both regular and AI-enhanced search
    const [regularResults, aiResults] = await Promise.all([
      advancedKeywordSearchService.searchDocuments(query, userId, 10),
      advancedKeywordSearchService.searchDocumentsWithAI(query, userId, [], 10)
    ]);

    res.json({
      query,
      userId,
      regularSearch: {
        results: regularResults.length,
        documents: regularResults.map(r => ({
          id: r.id,
          name: r.name,
          similarity: r.similarity,
          matchedTerms: r.matchedTerms,
          contentPreview: r.content.substring(0, 200) + '...'
        }))
      },
      aiEnhancedSearch: {
        results: aiResults.length,
        documents: aiResults.map(r => ({
          id: r.id,
          name: r.name,
          similarity: r.similarity,
          matchedTerms: r.matchedTerms,
          aiKeywordExpansion: r.aiKeywordExpansion || null,
          contentPreview: r.content.substring(0, 200) + '...'
        }))
      }
    });

  } catch (error: unknown) {
    console.error('Test advanced keyword search error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// Test vector search for specific user and documents
router.get('/test-vector-search', async (req, res) => {
  try {
    const query = req.query.query as string || 'test query';
    const userId = req.query.userId as string || '43981095';
    const limit = parseInt(req.query.limit as string) || 5;

    console.log(`Testing vector search: "${query}" for user ${userId}`);

    const { vectorService } = await import('./services/vectorService');
    const results = await vectorService.searchDocuments(query, userId, limit);

    res.json({
      query,
      userId,
      limit,
      results: results.length,
      documents: results.map(r => ({
        id: r.document.id,
        similarity: r.similarity,
        content: r.document.content.substring(0, 200) + '...',
        metadata: r.document.metadata
      }))
    });

  } catch (error: unknown) {
    console.error('Test vector search error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: errorMessage });
  }
});

// Serve the debug console HTML
router.get('/debug-console', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Advanced Keyword Search Debug</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .test-section {
            margin-bottom: 30px;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .test-section h3 {
            margin-top: 0;
            color: #333;
        }
        .form-group {
            margin-bottom: 15px;
        }
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        .form-group input,
        .form-group select {
            width: 100%;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 14px;
        }
        .btn {
            padding: 10px 20px;
            margin: 5px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .btn-primary {
            background: #007bff;
            color: white;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .output {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
            padding: 15px;
            margin-top: 15px;
            font-family: monospace;
            font-size: 12px;
            white-space: pre-wrap;
            max-height: 400px;
            overflow-y: auto;
        }
        .output.success {
            background: #d4edda;
            border-color: #c3e6cb;
            color: #155724;
        }
        .output.error {
            background: #f8d7da;
            border-color: #f5c6cb;
            color: #721c24;
        }
        .loading {
            color: #007bff;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 Advanced Keyword Search Debug Console</h1>
        <p>Test and debug the advanced keyword search functionality</p>

        <div class="test-section">
            <h3>Advanced Keyword Search Test</h3>
            <div class="form-group">
                <label>Search Query:</label>
                <input type="text" id="searchQuery" value="XOLO restaurant" placeholder="Enter search query">
            </div>
            <div class="form-group">
                <label>User ID:</label>
                <input type="text" id="searchUserId" value="43981095" placeholder="Enter user ID">
            </div>
            <button class="btn btn-primary" onclick="testAdvancedSearch()">🚀 Test Advanced Search</button>
            <button class="btn btn-secondary" onclick="testVectorSearch()">📊 Test Vector Search</button>
            <button class="btn btn-secondary" onclick="findXolo()">🔎 Find XOLO</button>
            <div id="searchOutput" class="output">Ready to test search functionality...</div>
        </div>

        <div class="test-section">
            <h3>Document Analysis</h3>
            <div class="form-group">
                <label>Document ID:</label>
                <input type="number" id="docId" value="213" placeholder="Enter document ID">
            </div>
            <div class="form-group">
                <label>Analysis Query:</label>
                <input type="text" id="docQuery" value="XOLO เดอะมอลล์บางกะปิอยู่ชั้นไหน" placeholder="Enter analysis query">
            </div>
            <div class="form-group">
                <label>Search Type:</label>
                <select id="docSearchType">
                    <option value="keyword">Keyword Search</option>
                    <option value="vector">Vector Search</option>
                    <option value="hybrid">Hybrid Search</option>
                    <option value="weighted">Weighted Search</option>
                    <option value="smart_hybrid">Smart Hybrid Search</option>
                </select>
            </div>
            <button class="btn btn-primary" onclick="analyzeDocument()">📊 Analyze Document</button>
            <div id="docOutput" class="output">Ready to analyze documents...</div>
        </div>
    </div>

    <script>
        async function makeRequest(url, options = {}) {
            try {
                const response = await fetch(url, {
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    },
                    ...options
                });

                let data;
                const contentType = response.headers.get('content-type');

                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    data = await response.text();
                }

                return { response, data, ok: response.ok };
            } catch (error) {
                return { response: null, data: null, ok: false, error: error.message };
            }
        }

        function setOutput(id, content, type = '') {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = content;
                element.className = 'output ' + type;
            }
        }

        async function testAdvancedSearch() {
            const query = document.getElementById('searchQuery').value;
            const userId = document.getElementById('searchUserId').value;

            setOutput('searchOutput', '⏳ Testing advanced keyword search...', 'loading');

            try {
                const { response, data, ok, error } = await makeRequest(
                    '/api/debug/test-advanced-keyword-search?query=' + encodeURIComponent(query) + '&userId=' + userId
                );

                if (error) {
                    setOutput('searchOutput', 'Network Error: ' + error, 'error');
                } else if (!ok) {
                    setOutput('searchOutput', 'HTTP ' + response.status + ': ' + JSON.stringify(data, null, 2), 'error');
                } else if (!data || !data.regularSearch || !data.aiEnhancedSearch) {
                    setOutput('searchOutput', 'Invalid response format: ' + JSON.stringify(data, null, 2), 'error');
                } else {
                    const output = '✅ Advanced Keyword Search Results:\\n' +
                        'Query: "' + query + '"\\n' +
                        'User ID: ' + userId + '\\n\\n' +
                        'Regular Search: ' + (data.regularSearch.results || 0) + ' results\\n' +
                        'AI Enhanced Search: ' + (data.aiEnhancedSearch.results || 0) + ' results\\n\\n' +
                        'Regular Results:\\n' +
                        (data.regularSearch.documents || []).map((doc, i) =>
                            (i+1) + '. ' + doc.name + ' (ID: ' + doc.id + ')\\n' +
                            '   Similarity: ' + (doc.similarity ? doc.similarity.toFixed(4) : 'N/A') + '\\n' +
                            '   Matched Terms: ' + (doc.matchedTerms ? doc.matchedTerms.join(', ') : 'None') + '\\n' +
                            '   Preview: ' + (doc.contentPreview || 'No preview')
                        ).join('\\n\\n') + '\\n\\n' +
                        'AI Enhanced Results:\\n' +
                        (data.aiEnhancedSearch.documents || []).map((doc, i) =>
                            (i+1) + '. ' + doc.name + ' (ID: ' + doc.id + ')\\n' +
                            '   Similarity: ' + (doc.similarity ? doc.similarity.toFixed(4) : 'N/A') + '\\n' +
                            '   Matched Terms: ' + (doc.matchedTerms ? doc.matchedTerms.join(', ') : 'None') + '\\n' +
                            '   AI Keywords: ' + (doc.aiKeywordExpansion?.expandedKeywords ? doc.aiKeywordExpansion.expandedKeywords.join(', ') : 'None') + '\\n' +
                            '   Preview: ' + (doc.contentPreview || 'No preview')
                        ).join('\\n\\n');

                    setOutput('searchOutput', output, 'success');
                }
            } catch (err) {
                setOutput('searchOutput', 'Error: ' + err.message, 'error');
            }
        }

        async function testVectorSearch() {
            const query = document.getElementById('searchQuery').value;
            const userId = document.getElementById('searchUserId').value;

            setOutput('searchOutput', '⏳ Testing vector search...', 'loading');

            try {
                const { response, data, ok, error } = await makeRequest(
                    '/api/debug/test-vector-search?query=' + encodeURIComponent(query) + '&userId=' + userId + '&limit=5'
                );

                if (error) {
                    setOutput('searchOutput', 'Network Error: ' + error, 'error');
                } else if (!ok) {
                    setOutput('searchOutput', 'HTTP ' + response.status + ': ' + JSON.stringify(data, null, 2), 'error');
                } else {
                    const output = '✅ Vector Search Results:\\n' +
                        'Query: "' + query + '"\\n' +
                        'User ID: ' + userId + '\\n' +
                        'Results: ' + data.results + '\\n\\n' +
                        'Documents:\\n' +
                        data.documents.map((doc, i) =>
                            (i+1) + '. Document ID: ' + doc.id + '\\n' +
                            '   Similarity: ' + doc.similarity.toFixed(4) + '\\n' +
                            '   Content: ' + doc.content + '\\n' +
                            '   Metadata: ' + JSON.stringify(doc.metadata, null, 2)
                        ).join('\\n\\n');

                    setOutput('searchOutput', output, 'success');
                }
            } catch (err) {
                setOutput('searchOutput', 'Error: ' + err.message, 'error');
            }
        }

        async function findXolo() {
            const userId = document.getElementById('searchUserId').value;

            setOutput('searchOutput', '⏳ Searching for XOLO...', 'loading');

            try {
                const { response, data, ok, error } = await makeRequest('/api/debug/find-xolo/' + userId);

                if (error) {
                    setOutput('searchOutput', 'Network Error: ' + error, 'error');
                } else if (!ok) {
                    setOutput('searchOutput', 'HTTP ' + response.status + ': ' + JSON.stringify(data, null, 2), 'error');
                } else {
                    const output = '🔍 XOLO Search Results:\\n' +
                        'Total Documents: ' + data.totalDocuments + '\\n' +
                        'Documents with XOLO: ' + data.summary.foundInDocuments + '\\n' +
                        'Vector Results with XOLO: ' + data.summary.foundInVector + '\\n\\n' +
                        'Documents containing XOLO:\\n' +
                        data.documentsWithXolo.map(doc =>
                            '📄 ' + doc.documentName + ' (ID: ' + doc.documentId + ')\\n' +
                            '   Found terms: ' + doc.foundTerms.join(', ') + '\\n' +
                            '   Has vector data: ' + doc.hasVectorData + '\\n' +
                            '   Sample lines: ' + doc.matchingLines.slice(0, 2).join(' | ')
                        ).join('\\n\\n') + '\\n\\n' +
                        'Vector Search Results:\\n' +
                        data.vectorResults.map((result, i) =>
                            (i+1) + '. Document ID: ' + result.documentId + '\\n' +
                            '   Similarity: ' + result.similarity.toFixed(4) + '\\n' +
                            '   Contains XOLO: ' + result.hasXolo + '\\n' +
                            '   Content: ' + result.content.substring(0, 200) + '...'
                        ).join('\\n\\n');

                    setOutput('searchOutput', output, data.documentsWithXolo.length > 0 ? 'success' : 'error');
                }
            } catch (err) {
                setOutput('searchOutput', 'Error: ' + err.message, 'error');
            }
        }

        async function analyzeDocument() {
            const docId = document.getElementById('docId').value;
            const query = document.getElementById('docQuery').value;
            const searchType = document.getElementById('docSearchType').value;
            const userId = document.getElementById('searchUserId').value;

            setOutput('docOutput', '⏳ Analyzing document...', 'loading');

            try {
                const { response, data, ok, error } = await makeRequest('/api/debug/analyze-document/' + userId + '/' + docId, {
                    method: 'POST',
                    body: JSON.stringify({
                        userMessage: query,
                        searchType: searchType,
                        keywordWeight: 0.3,
                        vectorWeight: 0.7
                    })
                });

                if (error) {
                    setOutput('docOutput', 'Network Error: ' + error, 'error');
                } else if (!ok) {
                    if (response.headers.get('content-type')?.includes('text/html')) {
                        // Open HTML response in new tab
                        const newTab = window.open('', '_blank');
                        newTab.document.write(data);
                        setOutput('docOutput', '✅ Document analysis opened in new tab', 'success');
                    } else {
                        setOutput('docOutput', 'HTTP ' + response.status + ': ' + JSON.stringify(data, null, 2), 'error');
                    }
                } else {
                    setOutput('docOutput', '✅ Document analysis completed successfully', 'success');
                }
            } catch (err) {
                setOutput('docOutput', 'Error: ' + err.message, 'error');
            }
        }
    </script>
</body>
</html>`);
});

export default router;