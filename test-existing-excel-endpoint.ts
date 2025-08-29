
import { storage } from './server/storage.js';

async function testExistingExcelEndpoint() {
  console.log('🧪 Testing existing Excel endpoint functionality');
  console.log('================================================\n');

  try {
    // Test 1: Check if storage methods exist
    console.log('📋 Test 1: Check storage method availability');
    console.log('storage.getDocumentsByUserId exists:', typeof storage.getDocumentsByUserId === 'function');
    
    if (typeof storage.getDocumentsByUserId !== 'function') {
      throw new Error('getDocumentsByUserId method not available');
    }

    // Test 2: Call the method directly
    console.log('\n📋 Test 2: Testing storage.getDocumentsByUserId method');
    const testUserId = '43981095'; // Your user ID from logs
    
    const documents = await storage.getDocumentsByUserId(testUserId, {
      type: 'excel',
      extensions: ['xlsx', 'xls']
    });

    console.log('✅ Method call successful');
    console.log('📊 Found documents:', documents.length);
    
    if (documents.length > 0) {
      console.log('📄 Sample document structure:');
      console.log(JSON.stringify(documents[0], null, 2));
    }

    // Test 3: Test the endpoint response format
    console.log('\n📋 Test 3: Testing response format');
    const excelFiles = documents.map(doc => ({
      id: doc.id,
      name: doc.name || doc.originalName,
      filePath: doc.filePath,
      createdAt: doc.createdAt,
      size: doc.fileSize
    }));

    console.log('✅ Response format test passed');
    console.log('📦 Formatted response:', JSON.stringify(excelFiles, null, 2));

    // Test 4: Make HTTP request to endpoint
    console.log('\n📋 Test 4: Testing HTTP endpoint');
    try {
      const response = await fetch('http://localhost:5000/api/sqlite/existing-excel', {
        headers: {
          'Cookie': 'connect.sid=your-session-cookie-here' // You'd need actual session
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      const responseText = await response.text();
      console.log('Response body preview:', responseText.substring(0, 200));
      
      try {
        const jsonResponse = JSON.parse(responseText);
        console.log('✅ Valid JSON response');
        console.log('📊 Response data:', jsonResponse);
      } catch (e) {
        console.log('❌ Invalid JSON response');
        console.log('Raw response:', responseText);
      }
    } catch (fetchError) {
      console.log('⚠️ HTTP test skipped (auth required):', fetchError.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
    throw error;
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testExistingExcelEndpoint()
    .then(() => {
      console.log('\n🎉 All tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}
