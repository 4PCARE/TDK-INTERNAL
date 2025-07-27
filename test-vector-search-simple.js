
import { vectorService } from './server/services/vectorService.js';

async function testVectorSearch() {
  try {
    console.log('🔍 Testing Vector Search with "OPPO Shop" query...\n');
    
    const query = 'OPPO Shop';
    const userId = '43981095';
    const limit = 5;
    const specificDocumentIds = [213, 214]; // Test with documents 213 and 214
    
    console.log(`Query: "${query}"`);
    console.log(`User ID: ${userId}`);
    console.log(`Limit: ${limit * 2} (limit * 2)`);
    console.log(`Specific Document IDs: [${specificDocumentIds.join(', ')}]`);
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test the exact code you provided
    const vectorResults = await vectorService.searchDocuments(
      query, 
      userId, 
      limit * 2, 
      specificDocumentIds
    );
    
    console.log(`📊 Vector Search Results: Found ${vectorResults.length} results\n`);
    
    if (vectorResults.length === 0) {
      console.log('❌ No vector results found');
      console.log('Possible reasons:');
      console.log('- Documents 213, 214 may not exist in vector database');
      console.log('- No chunks contain "OPPO Shop" or similar content');
      console.log('- Vector embeddings may not be similar enough');
    } else {
      console.log('✅ Vector results found! Details:\n');
      
      vectorResults.forEach((result, index) => {
        console.log(`--- Result ${index + 1} ---`);
        console.log(`Document ID: ${result.document.metadata.originalDocumentId}`);
        console.log(`Chunk ID: ${result.document.id}`);
        console.log(`Similarity Score: ${result.similarity.toFixed(4)}`);
        console.log(`Chunk Index: ${result.document.chunkIndex}/${result.document.totalChunks}`);
        console.log(`Content Length: ${result.document.content.length} characters`);
        console.log(`Content Preview: ${result.document.content.substring(0, 200)}...`);
        
        // Check if content contains OPPO-related terms
        const content = result.document.content.toLowerCase();
        const oppoTerms = ['oppo', 'oppo shop', 'oppo brand'];
        const foundTerms = oppoTerms.filter(term => content.includes(term));
        
        if (foundTerms.length > 0) {
          console.log(`🎯 Found OPPO terms: [${foundTerms.join(', ')}]`);
        } else {
          console.log('❓ No direct OPPO terms found in content');
        }
        
        console.log('');
      });
    }
    
    // Additional debug info
    console.log('\n' + '='.repeat(50));
    console.log('📈 Search Statistics:');
    console.log(`Total results returned: ${vectorResults.length}`);
    console.log(`Requested limit: ${limit * 2}`);
    
    if (vectorResults.length > 0) {
      const avgSimilarity = vectorResults.reduce((sum, r) => sum + r.similarity, 0) / vectorResults.length;
      const maxSimilarity = Math.max(...vectorResults.map(r => r.similarity));
      const minSimilarity = Math.min(...vectorResults.map(r => r.similarity));
      
      console.log(`Average similarity: ${avgSimilarity.toFixed(4)}`);
      console.log(`Highest similarity: ${maxSimilarity.toFixed(4)}`);
      console.log(`Lowest similarity: ${minSimilarity.toFixed(4)}`);
      
      // Show document distribution
      const docDistribution = {};
      vectorResults.forEach(result => {
        const docId = result.document.metadata.originalDocumentId;
        docDistribution[docId] = (docDistribution[docId] || 0) + 1;
      });
      
      console.log('\n📋 Results by Document:');
      Object.entries(docDistribution).forEach(([docId, count]) => {
        console.log(`  Document ${docId}: ${count} chunks`);
      });
    }
    
  } catch (error) {
    console.error('❌ Vector search test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testVectorSearch().then(() => {
  console.log('\n✅ Vector search test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test script failed:', error);
  process.exit(1);
});
