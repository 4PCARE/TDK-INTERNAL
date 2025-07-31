
import { storage } from './storage';
import { performAdvancedKeywordSearch } from './services/advancedKeywordSearch';

async function testAliasExpansion() {
  console.log('🧪 Testing Alias Expansion Functionality');
  
  try {
    // Test with a sample agent
    const agentId = 15; // Use your existing agent ID
    const agent = await storage.getAgentChatbot(agentId);
    
    if (!agent) {
      console.log('❌ Agent not found');
      return;
    }
    
    console.log('📋 Agent:', agent.name);
    console.log('🔍 Current aliases:', agent.aliases);
    
    // Test search with aliases
    const testQueries = [
      'The 1 มีโปรมั้ย',
      'promotion',
      'โปรโมชั่น',
      'discount'
    ];
    
    for (const query of testQueries) {
      console.log(`\n🔍 Testing query: "${query}"`);
      
      const agentDocs = await storage.getAgentChatbotDocuments(agentId);
      const documentIds = agentDocs.map(doc => doc.documentId);
      
      const results = await performAdvancedKeywordSearch(
        query,
        documentIds,
        { maxResults: 3 },
        agent.aliases || undefined
      );
      
      console.log(`📊 Found ${results.length} results`);
      results.slice(0, 2).forEach((result, i) => {
        console.log(`  ${i + 1}. Score: ${result.score.toFixed(3)} - ${result.content.substring(0, 100)}...`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  testAliasExpansion().then(() => {
    console.log('✅ Test completed');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}

export { testAliasExpansion };
