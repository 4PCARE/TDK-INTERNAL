
import express from 'express';
import { vectorService } from './services/vectorService';
import { semanticSearchServiceV2 } from './services/semanticSearchV2';
import { storage } from './storage';

const router = express.Router();

// Debug endpoint to test chunk retrieval
router.post('/debug-chunk-test', async (req, res) => {
  try {
    const { query = "XOLO บางกะปิ", userId = "43981095" } = req.body;
    
    console.log(`🔍 DEBUG CHUNK TEST: Starting test for query "${query}"`);
    
    // Step 1: Test vectorService directly
    console.log("📊 Step 1: Testing vectorService.searchDocuments()");
    const vectorResults = await vectorService.searchDocuments(query, userId, 5);
    
    console.log(`✅ VectorService returned ${vectorResults.length} results:`);
    vectorResults.forEach((result, idx) => {
      console.log(`  ${idx + 1}. Doc ${result.document.metadata.originalDocumentId} chunk ${result.document.chunkIndex}`);
      console.log(`      Content length: ${result.document.content.length} chars`);
      console.log(`      Similarity: ${result.similarity.toFixed(4)}`);
      console.log(`      Content preview: "${result.document.content.substring(0, 100)}..."`);
      
      if (result.document.content.length > 3000) {
        console.log(`      ⚠️  WARNING: This chunk is ${result.document.content.length} chars - suspiciously large!`);
      }
    });
    
    // Step 2: Test semantic search
    console.log("\n📊 Step 2: Testing semanticSearchServiceV2.searchDocuments() with semantic search");
    const semanticResults = await semanticSearchServiceV2.searchDocuments(query, userId, {
      searchType: 'semantic',
      limit: 5
    });
    
    console.log(`✅ Semantic search returned ${semanticResults.length} results:`);
    semanticResults.forEach((result, idx) => {
      console.log(`  ${idx + 1}. ${result.name}`);
      console.log(`      Content length: ${result.content.length} chars`);
      console.log(`      Similarity: ${result.similarity.toFixed(4)}`);
      console.log(`      Content preview: "${result.content.substring(0, 100)}..."`);
      
      if (result.content.length > 3000) {
        console.log(`      ⚠️  WARNING: This result is ${result.content.length} chars - suspiciously large!`);
      }
    });
    
    // Step 3: Check actual document content in database
    console.log("\n📊 Step 3: Checking a few sample documents from storage");
    const allDocs = await storage.getDocuments(userId, { limit: 5 });
    
    console.log(`✅ Found ${allDocs.length} documents in storage:`);
    allDocs.slice(0, 3).forEach((doc, idx) => {
      console.log(`  ${idx + 1}. Doc ${doc.id}: "${doc.name}"`);
      console.log(`      Full document content length: ${doc.content?.length || 0} chars`);
      if (doc.content) {
        console.log(`      Full doc preview: "${doc.content.substring(0, 100)}..."`);
      }
    });
    
    // Step 4: Compare results
    console.log("\n🔍 ANALYSIS:");
    const hasLargeChunks = vectorResults.some(r => r.document.content.length > 3000);
    const hasLargeSemanticResults = semanticResults.some(r => r.content.length > 3000);
    
    if (hasLargeChunks) {
      console.log("❌ ISSUE FOUND: VectorService is returning chunks larger than 3000 chars");
    } else {
      console.log("✅ VectorService chunks look correct (all under 3000 chars)");
    }
    
    if (hasLargeSemanticResults) {
      console.log("❌ ISSUE FOUND: Semantic search is returning results larger than 3000 chars");
    } else {
      console.log("✅ Semantic search results look correct (all under 3000 chars)");
    }
    
    res.json({
      success: true,
      query,
      vectorResults: vectorResults.length,
      semanticResults: semanticResults.length,
      analysis: {
        vectorServiceChunksOk: !hasLargeChunks,
        semanticSearchResultsOk: !hasLargeSemanticResults
      },
      vectorSample: vectorResults.slice(0, 2).map(r => ({
        docId: r.document.metadata.originalDocumentId,
        chunkIndex: r.document.chunkIndex,
        contentLength: r.document.content.length,
        similarity: r.similarity,
        preview: r.document.content.substring(0, 100)
      })),
      semanticSample: semanticResults.slice(0, 2).map(r => ({
        name: r.name,
        contentLength: r.content.length,
        similarity: r.similarity,
        preview: r.content.substring(0, 100)
      }))
    });
    
  } catch (error) {
    console.error("❌ DEBUG CHUNK TEST ERROR:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
});

export default router;
