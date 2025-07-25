
import { advancedKeywordSearchService } from './services/advancedKeywordSearch';
import { storage } from './storage';
import { db } from './db';
import { documentChunks } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

// Test the keyword search with the exact expanded keywords from the log
async function testKeywordSearch() {
  console.log('=== TESTING CHUNK-BASED KEYWORD SEARCH ===');
  
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
  
  // Get chunks from the specific documents
  const chunks = await db
    .select()
    .from(documentChunks)
    .where(inArray(documentChunks.documentId, specificDocumentIds));
  
  console.log(`\n=== CHUNK CONTENT INSPECTION ===`);
  console.log(`Found ${chunks.length} chunks across ${specificDocumentIds.length} documents`);
  
  for (const chunk of chunks) {
    console.log(`\nChunk ${chunk.id} from Document ${chunk.documentId}:`);
    console.log(`Content length: ${chunk.content?.length || 0}`);
    
    // Check if any expanded keywords exist in this chunk
    for (const keyword of expandedKeywords) {
      const found = chunk.content?.toLowerCase().includes(keyword.toLowerCase());
      if (found) {
        console.log(`✅ Found "${keyword}" in chunk ${chunk.id} (doc ${chunk.documentId})`);
        // Show context around the match
        const content = chunk.content?.toLowerCase() || '';
        const index = content.indexOf(keyword.toLowerCase());
        if (index !== -1) {
          const start = Math.max(0, index - 50);
          const end = Math.min(content.length, index + keyword.length + 50);
          const context = chunk.content?.substring(start, end);
          console.log(`   Context: ...${context}...`);
        }
      }
    }
  }
  
  // Test the search function
  console.log(`\n=== TESTING CHUNK-BASED SEARCH FUNCTION ===`);
  
  // Test basic search first
  const testQuery = expandedKeywords.join(' ');
  console.log(`Testing basic search with query: "${testQuery}"`);
  
  try {
    const basicResults = await advancedKeywordSearchService.searchDocumentChunks(
      testQuery,
      userId,
      20,
      specificDocumentIds
    );
    
    console.log(`Basic search returned ${basicResults.length} chunk results`);
    basicResults.forEach((result, index) => {
      console.log(`  ${index + 1}. Chunk ${result.chunkId} (Doc ${result.documentId}): ${result.documentName} - Score: ${result.similarity}`);
      console.log(`     Matched terms: ${result.matchedTerms.join(', ')}`);
      console.log(`     Content preview: ${result.content.substring(0, 100)}...`);
    });
    
  } catch (error) {
    console.error('Basic search failed:', error);
  }
  
  // Test individual keywords
  console.log(`\n=== TESTING INDIVIDUAL KEYWORDS ON CHUNKS ===`);
  for (const keyword of expandedKeywords) {
    try {
      const results = await advancedKeywordSearchService.searchDocumentChunks(
        keyword,
        userId,
        5,
        specificDocumentIds
      );
      
      console.log(`Keyword "${keyword}": ${results.length} chunk results`);
      if (results.length > 0) {
        results.forEach(result => {
          console.log(`  Chunk ${result.chunkId} (Doc ${result.documentId}): ${result.documentName} - Score: ${result.similarity}`);
        });
      }
    } catch (error) {
      console.error(`Search for "${keyword}" failed:`, error);
    }
  }
}

// Run the test
testKeywordSearch().catch(console.error);
