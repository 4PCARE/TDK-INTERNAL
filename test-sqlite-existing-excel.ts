
import { storage } from './server/storage.js';

async function testExistingExcelEndpoint() {
  console.log('🧪 Testing SQLite existing Excel files endpoint');
  console.log('================================================');

  try {
    // Test 1: Check if storage.getDocumentsByUserId method exists
    console.log('\n📋 Test 1: Check storage method availability');
    console.log('storage.getDocumentsByUserId exists:', typeof storage.getDocumentsByUserId === 'function');
    
    // Test 2: Try to call the method directly
    console.log('\n📋 Test 2: Testing storage.getDocumentsByUserId method');
    
    // Use a test user ID (you can replace with your actual user ID)
    const testUserId = '43981095'; // Based on your logs
    
    try {
      const documents = await storage.getDocumentsByUserId(testUserId, {
        type: 'excel',
        extensions: ['xlsx', 'xls']
      });
      
      console.log('✅ Storage method works!');
      console.log(`📄 Found ${documents.length} documents`);
      
      // Show details of first few documents
      documents.slice(0, 3).forEach((doc, index) => {
        console.log(`Document ${index + 1}:`, {
          id: doc.id,
          name: doc.name,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          filePath: doc.filePath
        });
      });
      
    } catch (storageError) {
      console.error('❌ Storage method failed:', storageError.message);
      console.error('Full error:', storageError);
      return;
    }
    
    // Test 3: Check if the method signature is correct
    console.log('\n📋 Test 3: Testing method signature');
    
    try {
      // Try without the options parameter
      const allDocuments = await storage.getDocumentsByUserId(testUserId);
      console.log(`✅ Method works without options. Found ${allDocuments.length} total documents`);
      
      // Filter manually to see Excel files
      const excelFiles = allDocuments.filter(doc => 
        doc.fileName && (
          doc.fileName.toLowerCase().endsWith('.xlsx') || 
          doc.fileName.toLowerCase().endsWith('.xls') ||
          (doc.mimeType && doc.mimeType.includes('spreadsheet'))
        )
      );
      
      console.log(`📊 Excel files found by manual filtering: ${excelFiles.length}`);
      excelFiles.slice(0, 3).forEach((file, index) => {
        console.log(`Excel file ${index + 1}:`, {
          id: file.id,
          name: file.name,
          fileName: file.fileName,
          mimeType: file.mimeType
        });
      });
      
    } catch (alternativeError) {
      console.error('❌ Alternative method also failed:', alternativeError.message);
    }
    
    // Test 4: Test the actual endpoint logic
    console.log('\n📋 Test 4: Simulating endpoint logic');
    
    try {
      // Simulate what the endpoint should do
      const userId = testUserId;
      
      // Check if the user exists
      const user = await storage.getUser(userId);
      console.log('User exists:', !!user);
      console.log('User email:', user?.email);
      
      // Try to get documents with different approaches
      console.log('\n🔍 Trying different document retrieval approaches...');
      
      // Approach 1: Get all documents and filter
      const allDocs = await storage.getDocuments(userId);
      console.log(`Total documents for user: ${allDocs.length}`);
      
      const manualExcelFilter = allDocs.filter(doc => {
        const isExcel = doc.fileName && (
          doc.fileName.toLowerCase().endsWith('.xlsx') || 
          doc.fileName.toLowerCase().endsWith('.xls')
        );
        const isMimeExcel = doc.mimeType && (
          doc.mimeType.includes('spreadsheet') ||
          doc.mimeType.includes('excel')
        );
        return isExcel || isMimeExcel;
      });
      
      console.log(`Excel files found: ${manualExcelFilter.length}`);
      
      // Show the Excel files we found
      const excelFiles = manualExcelFilter.map(doc => ({
        id: doc.id,
        name: doc.name,
        filePath: doc.filePath,
        createdAt: doc.createdAt,
        size: doc.fileSize
      }));
      
      console.log('Excel files data:', JSON.stringify(excelFiles, null, 2));
      
    } catch (endpointError) {
      console.error('❌ Endpoint simulation failed:', endpointError.message);
      console.error('Full error:', endpointError);
    }
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
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

export { testExistingExcelEndpoint };
