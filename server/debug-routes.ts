import express from "express";
import { storage } from "./storage";
import { semanticSearchServiceV2 } from "./services/semanticSearchV2";
import { generateChatResponse } from "./services/openai";
import { aiKeywordExpansionService } from "./services/aiKeywordExpansion";

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
  try {
    // Ensure we always set the correct content type
    res.setHeader('Content-Type', 'application/json');

    const { userMessage, specificDocumentId, userId, searchType = 'hybrid', keywordWeight = 0.3, vectorWeight = 0.7, specificDocumentIds } = req.body;

    if (!userMessage || !userId) {
      return res.status(400).json({ error: 'Missing required fields: userMessage, userId' });
    }

    console.log(`=== DEBUG AI INPUT FOR QUERY: "${userMessage}" ===`);
    console.log(`Document ID: ${specificDocumentId}, User ID: ${userId}`);

    let documentContext = '';
    let searchMetrics = null;
    let chunkDetails = [];

    if (specificDocumentId) {
      // Get specific document
      const documents = await storage.getDocuments(userId, { limit: 1000 });
      const document = documents.find(doc => doc.id === parseInt(specificDocumentId));

      if (document) {
        documentContext = `Document: ${document.name}\n\nContent:\n${document.content || 'No content available'}`;
        chunkDetails = [{
          id: document.id,
          content: document.content || '',
          similarity: 1.0,
          type: 'direct_document'
        }];
      } else {
        documentContext = 'Document not found';
      }
    } else if (specificDocumentIds && specificDocumentIds.length > 0) {
      // Multiple specific documents
      const documents = await storage.getDocuments(userId, { limit: 1000 });
      const filteredDocs = documents.filter(doc => specificDocumentIds.includes(doc.id));

      documentContext = filteredDocs.map(doc => 
        `Document: ${doc.name}\n\nContent:\n${doc.content || 'No content available'}`
      ).join('\n\n---\n\n');

      chunkDetails = filteredDocs.map(doc => ({
        id: doc.id,
        content: doc.content || '',
        similarity: 1.0,
        type: 'specific_documents'
      }));
    } else {
      // Use semantic search
      let searchResults = [];
      
      // Use the new chunk split and rank search method
      if (searchType === 'hybrid') {
        try {
          const { semanticSearchServiceV2 } = await import('./services/semanticSearchV2');
          searchResults = await semanticSearchServiceV2.performChunkSplitAndRankSearch(
            userMessage,
            userId,
            {
              limit: 5,
              keywordWeight,
              vectorWeight,
              specificDocumentIds
            }
          );

          console.log(`DEBUG: performChunkSplitAndRankSearch returned ${searchResults.length} results`);

          // Create detailed chunk analysis from the results
          chunkDetails = searchResults.map((result, index) => ({
            chunkId: result.id || `chunk-${index}`,
            content: result.content || '',
            vectorScore: 0, // These aren't exposed in the current implementation
            keywordScore: 0, // These aren't exposed in the current implementation
            combinedScore: result.similarity,
            similarity: result.similarity,
            finalRank: index + 1,
            type: 'chunk_split_rank',
            name: result.name || 'Unknown'
          }));

          searchMetrics = {
            searchType: 'chunk_split_rank',
            vectorResults: searchResults.length,
            combinedResults: searchResults.length,
            weights: { keyword: keywordWeight, vector: vectorWeight }
          };

        } catch (error) {
          console.error('Error with performChunkSplitAndRankSearch:', error);
          console.error('Error stack:', error.stack);

          try {
            // Fallback to regular hybrid search
            console.log('DEBUG: Falling back to regular hybrid search');
            searchResults = await semanticSearchServiceV2.searchDocuments(
              userMessage,
              userId,
              {
                searchType: 'hybrid',
                limit: 5,
                keywordWeight,
                vectorWeight,
                specificDocumentIds
              }
            );

            chunkDetails = searchResults.map((result, index) => ({
              id: result.id,
              content: result.content || '',
              similarity: result.similarity,
              finalRank: index + 1,
              type: 'fallback_hybrid'
            }));

            searchMetrics = {
              searchType: 'fallback_hybrid',
              combinedResults: searchResults.length,
              error: error.message,
              weights: { keyword: keywordWeight, vector: vectorWeight }
            };
          } catch (fallbackError) {
            console.error('Fallback search also failed:', fallbackError);
            // Ultimate fallback - return empty results
            searchResults = [];
            chunkDetails = [];
            searchMetrics = {
              searchType: 'error',
              combinedResults: 0,
              error: `Both primary and fallback searches failed: ${error.message}, ${fallbackError.message}`,
              weights: { keyword: keywordWeight, vector: vectorWeight }
            };
          }
        }
      } else {
        searchResults = await semanticSearchServiceV2.searchDocuments(
          userMessage,
          userId,
          {
            searchType: searchType as 'semantic' | 'keyword' | 'hybrid',
            limit: 5,
            keywordWeight,
            vectorWeight,
            specificDocumentIds
          }
        );

        // Create chunk details for debugging
        chunkDetails = searchResults.map((result, index) => ({
          id: result.id,
          content: result.content,
          similarity: result.similarity,
          finalRank: index + 1,
          type: searchType
        }));

        searchMetrics = {
          searchType: searchType,
          combinedResults: searchResults.length,
          weights: {
            keyword: keywordWeight,
            vector: vectorWeight
          }
        };
      }

      // Create document context from search results
      documentContext = searchResults.map((result, index) => 
        `Document ${index + 1}: ${result.name}\n\nContent:\n${result.content}`
      ).join('\n\n---\n\n');
    }

    // Generate AI prompt
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

    // Return the debug information as JSON
    const responseData = {
      systemMessage,
      userMessage,
      documentContext,
      documentContextLength: documentContext.length,
      searchMetrics,
      chunkDetails
    };

    res.json(responseData);

  } catch (error) {
    console.error('Error in AI input debug:', error);
    console.error('Error stack:', error.stack);

    // Ensure we always return JSON, never HTML
    try {
      res.status(500).json({ 
        error: error.message || 'Unknown error occurred',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        endpoint: '/api/debug/ai-input'
      });
    } catch (jsonError) {
      // If even JSON response fails, send plain text
      console.error('Failed to send JSON error response:', jsonError);
      res.status(500).send('Internal server error - failed to generate proper error response');
    }
  }
});

// Utility function to escape HTML to prevent XSS
function escapeHtml(unsafe) {
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

    } catch (error) {
        console.error("View AI input error:", error);
        res.status(500).send("Error displaying AI input");
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
        let chunkDetails = [];
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
                const searchTerms = userMessage.toLowerCase().split(/\s+/).filter(term => term.length > 0);
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
                    const usedRanges = [];

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

            } else if (searchType === 'vector') {
                // Vector search logic
                console.log(`DEBUG: Performing vector search for "${userMessage}"`);
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
                let vectorResults = [];
                let combinedContent = [];

                // First, get keyword matches using the same logic as pure keyword search
                const searchTerms = userMessage.toLowerCase().split(/\s+/).filter(term => term.length > 0);
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
                    matchingSegments.sort((a, b) => b.score - a.score || a.position - b.position);                    // Take best matches and remove overlaps
                    const uniqueSegments = [];
                    const usedRanges = [];

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
            vectorResults = await vectorService.searchDocuments(userMessage, userId, 3, [parseInt(documentId)]);
            console.log(`DEBUG: Found ${vectorResults.length} vector results for hybrid search`);
          } catch (vectorError) {
            console.error("Vector search failed in hybrid mode:", vectorError);
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

        } catch (searchError) {
            console.error("Search failed:", searchError);
            documentContext = `Document: ${doc.name}\nSummary: ${doc.summary || 'No summary'}\nTags: ${doc.tags?.join(", ") || 'No tags'}\nContent: ${doc.content?.substring(0, 30000) || 'No content available'}`;
            searchMetrics.error = searchError.message;

            chunkDetails.push({
                chunkId: `error-${doc.id}`,
                content: doc.content?.substring(0, 30000) || doc.summary || 'No content available',
                type: 'error'
            });
        }

        const systemMessage = `You are an AI assistant helping users analyze and understand the document: ${doc.name}.\n\nDocument context:\n${documentContext}`;
        const aiInput = { systemMessage, userMessage, documentContext };

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

    } catch (error) {
        console.error("Analyze document debug error:", error);
        res.status(500).json({ error: "Analyze document debug failed" });
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

    } catch (vectorError) {
      console.error("Vector search failed:", vectorError);
      res.json({
        totalDocuments: documents.length,
        documentsWithXolo: xoloResults,
        vectorResults: [],
        vectorError: vectorError.message,
        summary: {
          foundInDocuments: xoloResults.length,
          foundInVector: 0
        }
      });
    }

  } catch (error) {
    console.error("XOLO search debug error:", error);
    res.status(500).json({ error: "XOLO search debug failed" });
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

    } catch (error) {
        console.error("AI keyword expansion debug error:", error);
        res.status(500).json({ error: "AI keyword expansion debug failed", details: error.message });
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

  } catch (error) {
    console.error('Test advanced keyword search error:', error);
    res.status(500).json({ error: error.message });
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

  } catch (error) {
    console.error('Test vector search error:', error);
    res.status(500).json({ error: error.message });
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