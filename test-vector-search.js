// Test script to debug vector search for XOLO บางกะปิ
const { vectorService } = require('./server/services/vectorService');

async function testVectorSearch() {
  try {
    console.log('Testing vector search for XOLO บางกะปิ...');
    
    const queries = [
      'XOLO บางกะปิ',
      'XOLO เดอะมอลล์บางกะปิ',
      'XOLO Bangkapi',
      'XOLO The Mall Bangkapi'
    ];
    
    for (const query of queries) {
      console.log(`\n=== Searching for: "${query}" ===`);
      const results = await vectorService.searchDocuments(query, '43981095', 10);
      
      console.log(`Found ${results.length} results:`);
      results.slice(0, 3).forEach((result, index) => {
        console.log(`${index + 1}. Doc ID: ${result.document.metadata.originalDocumentId}, Similarity: ${result.similarity.toFixed(4)}`);
        console.log(`   Content preview: ${result.document.content.substring(0, 200)}...`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testVectorSearch();