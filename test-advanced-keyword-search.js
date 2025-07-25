
import fetch from 'node-fetch';

async function testAdvancedKeywordSearch() {
  const baseUrl = 'http://localhost:5000';
  
  // Test queries
  const testQueries = [
    'XOLO restaurant',
    'โซโล่ อาหารญี่ปุ่น',
    'Bangkapi location',
    'ชั้นไหน floor',
    'โอโตยะ ชั้นไหน',
    'Japanese food'
  ];

  console.log('🔍 Testing Advanced Keyword Search with document_vectors');
  console.log('='.repeat(60));

  for (const query of testQueries) {
    console.log(`\n📝 Testing query: "${query}"`);
    console.log('-'.repeat(40));
    
    try {
      // Test the debug endpoint (no auth required) - fix the URL path
      const response = await fetch(`${baseUrl}/api/debug/test-advanced-keyword-search?query=${encodeURIComponent(query)}`);
      
      console.log(`🔍 Response status: ${response.status} ${response.statusText}`);
      console.log(`🔍 Response content-type: ${response.headers.get('content-type')}`);
      
      if (!response.ok) {
        console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
        
        // Try to get the response text to see what's actually being returned
        const responseText = await response.text();
        console.log(`📄 Response content (first 500 chars): ${responseText.substring(0, 500)}`);
        continue;
      }
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.log(`❌ Unexpected content type: ${contentType}`);
        const responseText = await response.text();
        console.log(`📄 Response content (first 500 chars): ${responseText.substring(0, 500)}`);
        continue;
      }
      
      const data = await response.json();
      
      console.log(`✅ Search completed successfully`);
      console.log(`📊 Regular search results: ${data.regularSearch.results}`);
      console.log(`🤖 AI-enhanced search results: ${data.aiEnhancedSearch.results}`);
      
      if (data.regularSearch.results > 0) {
        console.log(`📄 Regular search top results:`);
        data.regularSearch.documents.slice(0, 3).forEach((result, index) => {
          console.log(`   ${index + 1}. Doc ID: ${result.id}`);
          console.log(`      Name: ${result.name}`);
          console.log(`      Similarity: ${result.similarity.toFixed(4)}`);
          console.log(`      Matched terms: ${result.matchedTerms?.join(', ') || 'none'}`);
          console.log(`      Content preview: ${result.contentPreview}`);
          console.log('');
        });
      }
      
      if (data.aiEnhancedSearch.results > 0) {
        console.log(`🤖 AI-enhanced search top results:`);
        data.aiEnhancedSearch.documents.slice(0, 3).forEach((result, index) => {
          console.log(`   ${index + 1}. Doc ID: ${result.id}`);
          console.log(`      Name: ${result.name}`);
          console.log(`      Similarity: ${result.similarity.toFixed(4)}`);
          console.log(`      Matched terms: ${result.matchedTerms?.join(', ') || 'none'}`);
          console.log(`      AI expansion: ${result.aiKeywordExpansion?.expandedKeywords?.join(', ') || 'none'}`);
          console.log(`      Content preview: ${result.contentPreview}`);
          console.log('');
        });
      }
      
    } catch (error) {
      console.log(`❌ Error testing "${query}":`, error.message);
      
      // If it's a network error, try to diagnose
      if (error.code === 'ECONNREFUSED') {
        console.log('🔍 Connection refused - is the server running on port 5000?');
      }
    }
  }

  // Test server health first
  console.log('\n🔧 Testing server health...');
  console.log('='.repeat(60));
  
  try {
    // Test if server is responding at all - try a simple endpoint first
    const healthResponse = await fetch(`${baseUrl}/api/auth/user`);
    console.log(`🏥 Auth endpoint status: ${healthResponse.status} ${healthResponse.statusText}`);
    console.log(`🏥 Auth endpoint content-type: ${healthResponse.headers.get('content-type')}`);
    
    // Now test the specific debug endpoint
    const debugResponse = await fetch(`${baseUrl}/api/debug/test-advanced-keyword-search?query=test`);
    console.log(`🔧 Debug endpoint status: ${debugResponse.status} ${debugResponse.statusText}`);
    console.log(`🔧 Debug endpoint content-type: ${debugResponse.headers.get('content-type')}`);
    
    if (debugResponse.ok) {
      const debugData = await debugResponse.text();
      console.log(`🔧 Debug response (first 300 chars): ${debugData.substring(0, 300)}`);
    }
  } catch (error) {
    console.log(`❌ Server health check failed:`, error.message);
    console.log('🔍 Make sure the server is running with: npm run dev');
  }

  console.log('✅ Advanced keyword search testing completed!');
}

// Run the test
testAdvancedKeywordSearch().catch(console.error);
