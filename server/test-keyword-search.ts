
import { advancedKeywordSearchService } from './services/advancedKeywordSearch';
import { storage } from './storage';

// Test the keyword search with the exact expanded keywords from the log
async function testKeywordSearch() {
  console.log('=== TESTING KEYWORD SEARCH ===');
  
  const userId = '43981095';
  const expandedKeywords = [
    'โอโตยะ',
    'OOTOYA', 
    'เดอะมอลล์บางกะปิ',
    'The Mall Bangkapi',
    'ชั้น',
    'floor',
    'ร้านอาหารญี่ปุ่น',
    'Japanese restaurant'
  ];
  
  // Get the specific documents that should contain the data
  const specificDocumentIds = [217, 216, 214, 213, 211];
  
  console.log(`Testing with expanded keywords:`, expandedKeywords);
  console.log(`Testing with document IDs:`, specificDocumentIds);
  
  // Get documents to inspect their content
  const documents = await storage.getDocuments(userId);
  const filteredDocs = documents.filter(doc => specificDocumentIds.includes(doc.id));
  
  console.log(`\n=== DOCUMENT CONTENT INSPECTION ===`);
  for (const doc of filteredDocs) {
    console.log(`\nDocument ${doc.id}: ${doc.name}`);
    console.log(`Content length: ${doc.content?.length || 0}`);
    
    // Check if any expanded keywords exist in this document
    for (const keyword of expandedKeywords) {
      const found = doc.content?.toLowerCase().includes(keyword.toLowerCase());
      if (found) {
        console.log(`✅ Found "${keyword}" in document ${doc.id}`);
        // Show context around the match
        const content = doc.content?.toLowerCase() || '';
        const index = content.indexOf(keyword.toLowerCase());
        if (index !== -1) {
          const start = Math.max(0, index - 50);
          const end = Math.min(content.length, index + keyword.length + 50);
          const context = doc.content?.substring(start, end);
          console.log(`   Context: ...${context}...`);
        }
      } else {
        console.log(`❌ "${keyword}" NOT found in document ${doc.id}`);
      }
    }
  }
  
  // Test the search function
  console.log(`\n=== TESTING SEARCH FUNCTION ===`);
  
  // Test basic search first
  const testQuery = expandedKeywords.join(' ');
  console.log(`Testing basic search with query: "${testQuery}"`);
  
  try {
    const basicResults = await advancedKeywordSearchService.searchDocuments(
      testQuery,
      userId,
      20,
      specificDocumentIds
    );
    
    console.log(`Basic search returned ${basicResults.length} results`);
    basicResults.forEach((result, index) => {
      console.log(`  ${index + 1}. Doc ${result.id}: ${result.name} - Score: ${result.similarity}`);
      console.log(`     Matched terms: ${result.matchedTerms.join(', ')}`);
    });
    
  } catch (error) {
    console.error('Basic search failed:', error);
  }
  
  // Test individual keywords
  console.log(`\n=== TESTING INDIVIDUAL KEYWORDS ===`);
  for (const keyword of expandedKeywords) {
    try {
      const results = await advancedKeywordSearchService.searchDocuments(
        keyword,
        userId,
        5,
        specificDocumentIds
      );
      
      console.log(`Keyword "${keyword}": ${results.length} results`);
      if (results.length > 0) {
        results.forEach(result => {
          console.log(`  Doc ${result.id}: ${result.name} - Score: ${result.similarity}`);
        });
      }
    } catch (error) {
      console.error(`Search for "${keyword}" failed:`, error);
    }
  }
}

// Run the test
testKeywordSearch().catch(console.error);
