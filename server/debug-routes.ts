
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
    
    if (specificDocumentId) {
      // Get the document
      const documents = await storage.getDocuments(userId);
      const doc = documents.find(d => d.id === parseInt(specificDocumentId));
      
      if (!doc) {
        return res.json({ error: "Document not found" });
      }
      
      // Implement different search strategies based on searchType
      let searchMetrics = {
        searchType,
        keywordResults: 0,
        vectorResults: 0,
        combinedResults: 0,
        weights: searchType === 'weighted' ? { keyword: keywordWeight, vector: vectorWeight } : null
      };

      try {
        if (searchType === 'keyword') {
          // Pure keyword search
          const keywordResults = await storage.searchDocuments(userId, userMessage);
          const docResult = keywordResults.find(d => d.id === parseInt(specificDocumentId));
          searchMetrics.keywordResults = keywordResults.length;
          
          if (docResult) {
            documentContext = `Document: ${doc.name}\nKeyword Match Content: ${docResult.content?.substring(0, 30000) || docResult.summary || 'No content available'}`;
          } else {
            documentContext = `Document: ${doc.name}\nNo keyword matches found.\nFull content: ${doc.content?.substring(0, 30000)}`;
          }
          
        } else if (searchType === 'vector') {
          // Pure vector search (current implementation)
          const vectorResults = await vectorService.searchDocuments(userMessage, userId, 3, [parseInt(specificDocumentId)]);
          searchMetrics.vectorResults = vectorResults.length;
          
          if (vectorResults.length > 0) {
            documentContext = vectorResults
              .slice(0, 3)
              .map(result => 
                `Document: ${doc.name}\nRelevant Content: ${result.document.content}`
              )
              .join("\n\n");
          } else {
            documentContext = `Document: ${doc.name}\nSummary: ${doc.summary}\nTags: ${doc.tags?.join(", ")}\nContent: ${doc.content?.substring(0, 30000)}`;
          }
          
        } else if (searchType === 'hybrid' || searchType === 'weighted') {
          // Hybrid or weighted search - combine both approaches
          const [keywordResults, vectorResults] = await Promise.all([
            storage.searchDocuments(userId, userMessage),
            vectorService.searchDocuments(userMessage, userId, 5, [parseInt(specificDocumentId)])
          ]);
          
          searchMetrics.keywordResults = keywordResults.length;
          searchMetrics.vectorResults = vectorResults.length;
          
          let combinedContent = [];
          
          // Get keyword content
          const keywordDoc = keywordResults.find(d => d.id === parseInt(specificDocumentId));
          if (keywordDoc && keywordDoc.content) {
            const kwWeight = searchType === 'weighted' ? keywordWeight : 0.5;
            combinedContent.push({
              type: 'keyword',
              content: keywordDoc.content.substring(0, 15000),
              weight: kwWeight,
              source: 'Full document keyword search'
            });
          }
          
          // Get vector content
          if (vectorResults.length > 0) {
            const vWeight = searchType === 'weighted' ? vectorWeight : 0.5;
            vectorResults.slice(0, 3).forEach((result, idx) => {
              combinedContent.push({
                type: 'vector',
                content: result.document.content,
                weight: vWeight * (1 - idx * 0.1), // Slightly decrease weight for lower ranked results
                similarity: result.similarity,
                source: `Vector chunk ${idx + 1}`
              });
            });
          }
          
          // Sort by weight and build context
          combinedContent.sort((a, b) => b.weight - a.weight);
          searchMetrics.combinedResults = combinedContent.length;
          
          documentContext = `Document: ${doc.name}\n\n` + 
            combinedContent.map(item => 
              `[${item.source.toUpperCase()} - Weight: ${item.weight.toFixed(2)}${item.similarity ? `, Similarity: ${item.similarity.toFixed(4)}` : ''}]\n${item.content}`
            ).join("\n\n---\n\n");
        }
        
      } catch (searchError) {
        console.error("Search failed:", searchError);
        documentContext = `Document: ${doc.name}\nSummary: ${doc.summary}\nTags: ${doc.tags?.join(", ")}\nContent: ${doc.content?.substring(0, 30000)}`;
      }
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
    console.log(`\n=== FULL DOCUMENT CONTEXT ===`);
    console.log(documentContext);
    console.log(`\n=== END DEBUG ===`);

    // Return the full input that would be sent to AI
    res.json({
      systemMessage,
      userMessage,
      documentContextLength: documentContext.length,
      documentContext,
      vectorSearchUsed: searchType !== 'keyword',
      searchMetrics
    });

  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: "Debug failed" });
  }
});

export default router;
