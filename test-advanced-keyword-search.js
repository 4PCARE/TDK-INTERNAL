
const fetch = require('node-fetch');

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
      // Test the search endpoint with keyword type
      const response = await fetch(`${baseUrl}/api/documents/search?query=${encodeURIComponent(query)}&type=keyword`);
      
      if (!response.ok) {
        console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
        continue;
      }
      
      const results = await response.json();
      
      console.log(`✅ Search completed successfully`);
      console.log(`📊 Results found: ${results.length}`);
      
      if (results.length > 0) {
        console.log(`📄 Top results:`);
        results.slice(0, 3).forEach((result, index) => {
          console.log(`   ${index + 1}. Doc ID: ${result.id}`);
          console.log(`      Name: ${result.name}`);
          console.log(`      Similarity: ${result.similarity.toFixed(4)}`);
          console.log(`      Matched terms: ${result.matchedTerms?.join(', ') || 'none'}`);
          console.log(`      Content preview: ${result.content.substring(0, 100)}...`);
          console.log('');
        });
      } else {
        console.log(`⚠️  No results found for "${query}"`);
      }
      
    } catch (error) {
      console.log(`❌ Error testing "${query}":`, error.message);
    }
  }

  // Test the advanced search service directly via debug endpoint
  console.log('\n🔧 Testing direct API endpoints...');
  console.log('='.repeat(60));
  
  try {
    // Test vector stats to see if we have documents
    const statsResponse = await fetch(`${baseUrl}/api/vector/stats`);
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      console.log(`📊 Vector database stats:`);
      console.log(`   - User documents: ${stats.userDocuments}`);
      console.log(`   - Unique documents: ${stats.uniqueDocuments}`);
      console.log(`   - Total documents: ${stats.totalDocuments}`);
      
      if (stats.vectorized && stats.vectorized.length > 0) {
        console.log(`   - Vectorized documents:`);
        stats.vectorized.forEach(doc => {
          console.log(`     * ${doc.name}: ${doc.chunks} chunks, ${doc.totalLength} chars`);
        });
      }
    }
  } catch (error) {
    console.log(`⚠️  Could not fetch vector stats:`, error.message);
  }

  // Test chunk-level search
  console.log('\n🧩 Testing chunk-level search behavior...');
  console.log('='.repeat(60));
  
  const testQuery = 'XOLO Japanese restaurant';
  try {
    const response = await fetch(`${baseUrl}/api/documents/search?query=${encodeURIComponent(testQuery)}&type=hybrid`);
    
    if (response.ok) {
      const results = await response.json();
      console.log(`🔀 Hybrid search results for "${testQuery}":`);
      console.log(`   Found ${results.length} results`);
      
      results.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.name} (Score: ${result.similarity.toFixed(4)})`);
        console.log(`      Content length: ${result.content.length} chars`);
        console.log(`      Is chunk content: ${result.content.length < 5000 ? 'YES' : 'NO (likely full document)'}`);
      });
    }
  } catch (error) {
    console.log(`❌ Hybrid search test failed:`, error.message);
  }

  console.log('\n✅ Advanced keyword search testing completed!');
}

// Run the test
testAdvancedKeywordSearch().catch(console.error);
