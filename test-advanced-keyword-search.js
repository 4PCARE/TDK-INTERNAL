
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
      // Test the debug endpoint (no auth required)
      const response = await fetch(`${baseUrl}/api/debug/test-advanced-keyword-search?query=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
        
        // Try to get the response text to see what's actually being returned
        const responseText = await response.text();
        console.log(`📄 Response content (first 200 chars): ${responseText.substring(0, 200)}`);
        continue;
      }
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.log(`❌ Unexpected content type: ${contentType}`);
        const responseText = await response.text();
        console.log(`📄 Response content (first 200 chars): ${responseText.substring(0, 200)}`);
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
      
      // If it's a JSON parse error, try to fetch the raw response
      if (error.message.includes('Unexpected token')) {
        try {
          const debugResponse = await fetch(`${baseUrl}/api/debug/test-advanced-keyword-search?query=${encodeURIComponent(query)}`);
          const rawText = await debugResponse.text();
          console.log(`📄 Raw response (first 300 chars): ${rawText.substring(0, 300)}`);
        } catch (debugError) {
          console.log(`❌ Could not fetch debug response:`, debugError.message);
        }
      }
    }
  }

  // Test the advanced search service directly via debug endpoint
  console.log('\n🔧 Testing direct API endpoints...');
  console.log('='.repeat(60));
  
  try {
    // Test if server is responding at all
    const healthResponse = await fetch(`${baseUrl}/api/debug/test-advanced-keyword-search?query=test`);
    console.log(`🏥 Health check status: ${healthResponse.status} ${healthResponse.statusText}`);
    console.log(`🏥 Health check content-type: ${healthResponse.headers.get('content-type')}`);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.text();
      console.log(`🏥 Health check response (first 200 chars): ${healthData.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`❌ Health check failed:`, error.message);
  }

  // Test chunk-level search
  console.log('\n🧩 Testing chunk-level search behavior...');
  console.log('='.repeat(60));
  
  console.log('⚠️  Note: Authenticated endpoints require login, skipping for now');
  console.log('✅ Advanced keyword search testing completed!');
}

// Run the test
testAdvancedKeywordSearch().catch(console.error);
