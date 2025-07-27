
const { storage } = require('./server/storage');

async function searchOppoInDocuments() {
  try {
    console.log('🔍 Searching for "OPPO Shop" in documents 213 and 214...\n');
    
    const userId = '43981095'; // Based on your debug logs
    const searchTerm = 'OPPO Shop';
    const targetDocIds = [213, 214];
    
    // Get all documents for the user
    const documents = await storage.getDocuments(userId);
    
    // Filter to get only documents 213 and 214
    const targetDocs = documents.filter(doc => targetDocIds.includes(doc.id));
    
    console.log(`📄 Found ${targetDocs.length} target documents to search\n`);
    
    for (const doc of targetDocs) {
      console.log(`=== DOCUMENT ${doc.id}: ${doc.name} ===`);
      console.log(`Content length: ${doc.content?.length || 0} characters`);
      
      if (!doc.content) {
        console.log('❌ No content available for search\n');
        continue;
      }
      
      // Case-insensitive search
      const content = doc.content.toLowerCase();
      const searchTermLower = searchTerm.toLowerCase();
      
      // Find all occurrences
      const matches = [];
      let index = 0;
      
      while ((index = content.indexOf(searchTermLower, index)) !== -1) {
        matches.push(index);
        index += searchTermLower.length;
      }
      
      if (matches.length > 0) {
        console.log(`✅ Found ${matches.length} occurrence(s) of "${searchTerm}"`);
        
        // Show context around each match
        matches.forEach((matchIndex, i) => {
          const start = Math.max(0, matchIndex - 100);
          const end = Math.min(doc.content.length, matchIndex + searchTerm.length + 100);
          const context = doc.content.substring(start, end);
          
          console.log(`\n  Match ${i + 1} at position ${matchIndex}:`);
          console.log(`  Context: ...${context}...`);
        });
      } else {
        console.log(`❌ No occurrences of "${searchTerm}" found`);
      }
      
      console.log('\n' + '='.repeat(50) + '\n');
    }
    
    // Also search for variations
    const variations = ['OPPO', 'oppo', 'Oppo Shop', 'OPPO BRAND', 'oppo brand'];
    
    console.log('🔍 Searching for variations...\n');
    
    for (const variation of variations) {
      console.log(`--- Searching for "${variation}" ---`);
      
      for (const doc of targetDocs) {
        if (!doc.content) continue;
        
        const content = doc.content.toLowerCase();
        const variationLower = variation.toLowerCase();
        
        const count = (content.match(new RegExp(variationLower, 'g')) || []).length;
        
        if (count > 0) {
          console.log(`  Doc ${doc.id}: Found ${count} occurrence(s)`);
          
          // Show first occurrence context
          const firstIndex = content.indexOf(variationLower);
          if (firstIndex !== -1) {
            const start = Math.max(0, firstIndex - 50);
            const end = Math.min(doc.content.length, firstIndex + variation.length + 50);
            const context = doc.content.substring(start, end);
            console.log(`    First context: ...${context}...`);
          }
        }
      }
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Search failed:', error);
  }
}

// Run the search
searchOppoInDocuments().then(() => {
  console.log('✅ Search completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
