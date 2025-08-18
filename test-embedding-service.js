
const axios = require('axios');

const EMBEDDING_SERVICE_URL = 'http://localhost:8080/embedding';
const API_GATEWAY_URL = 'http://localhost:8080';

async function testEmbeddingService() {
  console.log('🧪 Testing Embedding Service via API Gateway\n');

  // First, check if the gateway is responding
  try {
    console.log('🔍 Checking API Gateway health...');
    const gatewayHealth = await axios.get(`${API_GATEWAY_URL}/healthz`);
    console.log('✅ API Gateway is healthy:', gatewayHealth.data);
    console.log('');
  } catch (error) {
    console.error('❌ API Gateway is not responding:', error.message);
    console.log('Make sure the "Microservices Stack" workflow is running');
    return;
  }

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing Embedding Service Health Check...');
    try {
      const healthResponse = await axios.get(`${EMBEDDING_SERVICE_URL}/healthz`);
      console.log('✅ Health Check:', healthResponse.data);
    } catch (error) {
      console.error('❌ Embedding service health check failed:', error.response?.data || error.message);
      console.log('This might mean:');
      console.log('- The embedding service is not running');
      console.log('- The service is starting up (wait a moment and try again)');
      console.log('- There\'s a configuration issue');
      throw error;
    }
    console.log('');

    // Test 2: Get Available Providers
    console.log('2️⃣ Testing Available Providers...');
    const providersResponse = await axios.get(`${EMBEDDING_SERVICE_URL}/providers`);
    console.log('✅ Available Providers:', providersResponse.data);
    console.log('');

    // Test 3: Generate Single Embedding
    console.log('3️⃣ Testing Single Text Embedding...');
    const singleEmbedding = await axios.post(`${EMBEDDING_SERVICE_URL}/embed`, {
      texts: ['Hello, this is a test document about AI and machine learning.'],
      provider: 'openai'
    });
    console.log('✅ Single Embedding Generated:');
    console.log('- Dimensions:', singleEmbedding.data.dimensions);
    console.log('- Provider:', singleEmbedding.data.provider);
    console.log('- Embedding length:', singleEmbedding.data.embeddings[0].length);
    console.log('- First 5 values:', singleEmbedding.data.embeddings[0].slice(0, 5));
    console.log('');

    // Test 4: Generate Multiple Embeddings
    console.log('4️⃣ Testing Multiple Text Embeddings...');
    const multipleTexts = [
      'Artificial Intelligence is revolutionizing technology.',
      'Machine learning algorithms process vast amounts of data.',
      'Natural language processing helps computers understand human language.',
      'Deep learning networks mimic the human brain structure.'
    ];
    
    const multipleEmbeddings = await axios.post(`${EMBEDDING_SERVICE_URL}/embed`, {
      texts: multipleTexts,
      provider: 'openai'
    });
    console.log('✅ Multiple Embeddings Generated:');
    console.log('- Count:', multipleEmbeddings.data.count);
    console.log('- Dimensions:', multipleEmbeddings.data.dimensions);
    console.log('- Usage:', multipleEmbeddings.data.usage);
    console.log('');

    // Test 5: Index a Document
    console.log('5️⃣ Testing Document Indexing...');
    const documentChunks = [
      {
        content: 'This is the first chunk of our test document about embeddings.',
        chunkIndex: 0,
        metadata: { section: 'introduction' }
      },
      {
        content: 'This is the second chunk explaining vector similarity search.',
        chunkIndex: 1,
        metadata: { section: 'technical' }
      },
      {
        content: 'This final chunk covers best practices for embeddings.',
        chunkIndex: 2,
        metadata: { section: 'conclusion' }
      }
    ];

    const testDocumentId = Math.floor(Math.random() * 10000) + 1000;
    const indexResponse = await axios.post(`${EMBEDDING_SERVICE_URL}/index`, {
      documentId: testDocumentId,
      chunks: documentChunks
    });
    console.log('✅ Document Indexed:', indexResponse.data);
    console.log('');

    // Test 6: Search for Similar Content
    console.log('6️⃣ Testing Vector Similarity Search...');
    const searchResponse = await axios.post(`${EMBEDDING_SERVICE_URL}/search`, {
      query: 'vector search algorithms',
      limit: 5,
      threshold: 0.5
    });
    console.log('✅ Search Results:');
    searchResponse.data.forEach((result, index) => {
      console.log(`  Result ${index + 1}:`);
      console.log(`    - Similarity: ${result.similarity.toFixed(4)}`);
      console.log(`    - Content: "${result.content.substring(0, 60)}..."`);
      console.log(`    - Document ID: ${result.documentId}`);
      console.log(`    - Chunk Index: ${result.chunkIndex}`);
    });
    console.log('');

    // Test 7: Get Document Embeddings
    console.log('7️⃣ Testing Document Embeddings Retrieval...');
    const docEmbeddings = await axios.get(`${EMBEDDING_SERVICE_URL}/documents/${testDocumentId}/embeddings`);
    console.log('✅ Document Embeddings Retrieved:');
    console.log('- Chunks found:', docEmbeddings.data.length);
    docEmbeddings.data.forEach((embedding, index) => {
      console.log(`  Chunk ${index + 1}: ${embedding.content.substring(0, 40)}... (${embedding.dimensions}D)`);
    });
    console.log('');

    // Test 8: Get Service Stats
    console.log('8️⃣ Testing Service Statistics...');
    const statsResponse = await axios.get(`${EMBEDDING_SERVICE_URL}/stats`);
    console.log('✅ Service Stats:', statsResponse.data);
    console.log('');

    // Test 9: Cleanup - Delete Test Document
    console.log('9️⃣ Testing Document Cleanup...');
    const deleteResponse = await axios.delete(`${EMBEDDING_SERVICE_URL}/documents/${testDocumentId}/embeddings`);
    console.log('✅ Test Document Deleted:', deleteResponse.data, 'embeddings removed');
    console.log('');

    console.log('🎉 All Embedding Service Tests Passed! 🎉');
    console.log('The embedding service is fully operational and ready for production use.');

  } catch (error) {
    console.error('❌ Test Failed:', error.response ? error.response.data : error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
  }
}

// Run the test
testEmbeddingService();
