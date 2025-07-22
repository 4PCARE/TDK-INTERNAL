
import express from "express";
import { vectorService } from "./services/vectorService";
import { storage } from "./storage";

const router = express.Router();

router.post("/debug/ai-input", async (req, res) => {
  try {
    const { userMessage, specificDocumentId, userId } = req.body;
    
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
      
      // Use vector search to get relevant content (same as in openai.ts)
      try {
        const vectorResults = await vectorService.searchDocuments(userMessage, userId, 3, [parseInt(specificDocumentId)]);
        
        console.log(`Found ${vectorResults.length} chunks from document ${specificDocumentId}`);
        
        if (vectorResults.length > 0) {
          // Use only top 3 most relevant chunks
          documentContext = vectorResults
            .slice(0, 3)
            .map(result => 
              `Document: ${doc.name}\nRelevant Content: ${result.document.content}`
            )
            .join("\n\n");
        } else {
          // Fallback
          documentContext = `Document: ${doc.name}\nSummary: ${doc.summary}\nTags: ${doc.tags?.join(", ")}\nContent: ${doc.content?.substring(0, 30000)}`;
        }
      } catch (vectorError) {
        console.error("Vector search failed:", vectorError);
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
      vectorSearchUsed: true
    });

  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: "Debug failed" });
  }
});

export default router;
