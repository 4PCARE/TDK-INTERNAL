import express from "express";
import { vectorService } from "./services/vectorService";
import { storage } from "./storage";

const router = express.Router();

router.post("/debug/ai-input", async (req, res) => {
  try {
    const { userMessage, specificDocumentId, userId, searchType = 'vector', keywordWeight = 0.3, vectorWeight = 0.7 } = req.body;

    console.log(`=== DEBUG AI INPUT FOR QUERY: "${userMessage}" ===`);
    console.log(`Document ID: ${specificDocumentId}, User ID: ${userId}`);

    let documentContext = "";
    let chunkDetails = [];

    // Initialize search metrics
    let searchMetrics = {
      searchType,
      keywordResults: 0,
      vectorResults: 0,
      combinedResults: 0,
      weights: searchType === 'weighted' ? { keyword: keywordWeight, vector: vectorWeight } : null
    };

    if (specificDocumentId) {
      // Get the document
      const documents = await storage.getDocuments(userId);
      const doc = documents.find(d => d.id === parseInt(specificDocumentId));

      if (!doc) {
        return res.json({ error: "Document not found" });
      }

      try {
        if (searchType === 'keyword') {
          // Pure keyword search - find matching content in the specific document
          console.log(`DEBUG: Performing keyword search for "${userMessage}"`);

          // For Thai text, be more flexible with search terms
          const searchTerms = userMessage.toLowerCase().split(/\s+/).filter(term => term.length > 0);
          const docContent = doc.content || '';
          const docContentLower = docContent.toLowerCase();

          console.log(`DEBUG: Searching for terms: ${searchTerms.join(', ')} in document ${doc.name}`);

          // Find all matches and their positions
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
            const usedRanges = [];

            for (const match of matchingSegments) {
              const start = match.position;
              const end = match.position + 1000;

              // Check if this range overlaps significantly with existing ones
              const hasOverlap = usedRanges.some(range => 
                Math.max(start, range.start) < Math.min(end, range.end) - 200
              );

              if (!hasOverlap && uniqueSegments.length < 5) {
                uniqueSegments.push(match);
                usedRanges.push({ start, end });
              }
            }

            const keywordContent = uniqueSegments.map((match, idx) => 
              `[Match ${idx + 1} for "${match.term}"]: ${match.segment}`
            ).join('\n\n');

            documentContext = `Document: ${doc.name}\nKeyword Matches Found:\n${keywordContent}`;

            // Add keyword chunk details for each match
            uniqueSegments.forEach((match, idx) => {
              chunkDetails.push({
                chunkId: `kw-${doc.id}-match-${idx}`,
                content: match.segment,
                keywordScore: match.score,
                type: 'keyword',
                matchedTerm: match.term
              });
            });

            searchMetrics.keywordResults = uniqueSegments.length;
          } else {
            console.log(`DEBUG: No keyword matches found for "${userMessage}" in document ${doc.name}`);
            // Instead of showing "no matches", provide a sample of the document content
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
          // Pure vector search (current implementation)
          console.log(`DEBUG: Performing vector search for "${userMessage}"`);
          const vectorResults = await vectorService.searchDocuments(userMessage, userId, 3, [parseInt(specificDocumentId)]);
          searchMetrics.vectorResults = vectorResults.length;

          console.log(`DEBUG: Found ${vectorResults.length} vector results`);
          if (vectorResults.length > 0) {
            documentContext = vectorResults
              .slice(0, 3)
              .map(result => 
                `Document: ${doc.name}\nRelevant Content: ${result.document.content}`
              )
              .join("\n\n");

            // Add vector chunk details
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
          // Hybrid search combining keyword and vector results
          console.log(`DEBUG: Performing ${searchType} search`);

          let keywordMatches = [];
          let vectorResults = [];
          let combinedContent = [];

          // First, get keyword matches if the document content contains search terms
          const searchTerms = userMessage.toLowerCase().split(/\s+/).filter(term => term.length > 0);
          const docContent = doc.content || '';
          const docContentLower = docContent.toLowerCase();

          if (searchTerms.some(term => docContentLower.includes(term))) {
            console.log(`DEBUG: Found keyword matches in document ${doc.id}`);
            keywordMatches.push({
              content: docContent,
              matchingTerms: searchTerms.filter(term => docContentLower.includes(term)),
              totalTerms: searchTerms.length
            });
          }

          // Then get vector search results
          try {
            const vectorSearchResults = await vectorService.searchDocuments(userMessage, userId, 5);
            vectorResults = vectorSearchResults.filter(result => {
              const resultDocId = parseInt(result.document.metadata.originalDocumentId || result.document.id);
              return resultDocId === parseInt(specificDocumentId);
            });
            console.log(`DEBUG: Found ${vectorResults.length} vector results for document ${doc.id}`);
          } catch (error) {
            console.error('DEBUG: Vector search failed:', error);
          }

          searchMetrics.keywordResults = keywordMatches.length;
          searchMetrics.vectorResults = vectorResults.length;

          // Combine results with weights and calculate final weighted scores
          // Get keyword content
          if (keywordMatches.length > 0) {
            const kWeight = searchType === 'weighted' ? keywordWeight : 0.5;
            keywordMatches.forEach((match, idx) => {
              const similarity = match.matchingTerms.length / match.totalTerms;
              const weightedScore = similarity * kWeight;
              combinedContent.push({
                type: 'keyword',
                content: match.content,
                weight: kWeight,
                similarity: similarity,
                weightedScore: weightedScore,
                source: `Keyword match (${match.matchingTerms.length}/${match.totalTerms} terms)`,
                chunkId: `kw-${doc.id}`,
                keywordScore: similarity
              });
            });
          }

          // Get vector content
          if (vectorResults.length > 0) {
            const vWeight = searchType === 'weighted' ? vectorWeight : 0.5;
            vectorResults.forEach((result, idx) => {
              const adjustedWeight = vWeight * (1 - idx * 0.1); // Slightly decrease weight for lower ranked results
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

          // Sort by final weighted score (this is the key change!)
          combinedContent.sort((a, b) => b.weightedScore - a.weightedScore);
          searchMetrics.combinedResults = combinedContent.length;

          // Build document context using the weighted ranking
          documentContext = `Document: ${doc.name}\n\n` + 
            combinedContent.map((item, index) => 
              `[RANK #${index + 1} - ${item.source.toUpperCase()} - Weighted Score: ${item.weightedScore.toFixed(4)} (Similarity: ${item.similarity.toFixed(4)} × Weight: ${item.weight.toFixed(2)})]\n${item.content}`
            ).join("\n\n---\n\n");

          // Update chunk details to show weighted ranking
          chunkDetails = combinedContent.map((item, index) => ({
            id: item.chunkId,
            type: item.type,
            similarity: item.type === 'vector' ? item.vectorScore : item.keywordScore,
            weight: item.weight,
            weightedScore: item.weightedScore,
            finalRank: index + 1,
            source: item.source
          }));
        } else {
          // Fallback for unknown search types
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
    } else {
      // No specific document provided
      documentContext = "No specific document selected for analysis.";
    }

    const systemMessage = `You are an AI assistant helping users analyze and understand specific documents. You are currently focusing on a specific document provided in the context below.

Document context:
${documentContext}

Answer questions specifically about this document. Provide detailed analysis, explanations, and insights based on the document's content. If the user's question cannot be answered from this specific document, clearly state that and explain what information is available in the document.`;

    console.log(`\n=== SYSTEM MESSAGE ===`);
    console.log(systemMessage);
    console.log(`\n=== USER MESSAGE ===`);
    console.log(userMessage);
    console.log(`\n=== DOCUMENT CONTEXT LENGTH ===`);
    console.log(`${documentContext.length} characters`);
    console.log(`\n=== CHUNK DETAILS ===`);
    console.log(`Found ${chunkDetails.length} chunks`);
    chunkDetails.forEach((chunk, idx) => {
      console.log(`Chunk ${idx + 1}: ID=${chunk.id}, Type=${chunk.type}, Similarity=${chunk.similarity || 'N/A'}, Weight=${chunk.weight || 'N/A'}, WeightedScore=${chunk.weightedScore || 'N/A'}, FinalRank=${chunk.finalRank}`);
    });
    console.log(`\n=== FULL DOCUMENT CONTEXT ===`);
    console.log(documentContext);
    console.log(`\n=== END DEBUG ===`);

    // Return the full input that would be sent to AI
    res.json({
      systemMessage,
      userMessage,
      searchKeywords: userMessage, // The actual keywords used for searching
      documentContextLength: documentContext.length,
      documentContext,
      vectorSearchUsed: searchType !== 'keyword',
      searchMetrics,
      chunkDetails
    });

  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: "Debug failed" });
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

export default router;