// Debug upload process to see why LlamaParse isn't being used
import { DocumentProcessor } from "./server/services/documentProcessor.js";

async function debugUploadProcess() {
  console.log('🔍 Debugging PDF Upload Process');
  console.log('================================');
  
  // Test file path (use latest uploaded file)
  const testFile = '/home/runner/workspace/uploads/files-1753086794953-486694263.pdf';
  
  console.log(`📄 Testing file: ${testFile.split('/').pop()}`);
  console.log(`🔑 LLAMA_CLOUD_API_KEY: ${process.env.LLAMA_CLOUD_API_KEY ? 'Available' : 'Missing'}`);
  
  try {
    const processor = new DocumentProcessor();
    
    console.log('\n🚀 Starting DocumentProcessor.extractFromPDF...');
    const result = await processor.extractFromPDF(testFile);
    
    console.log(`\n📊 Results:`);
    console.log(`- Content length: ${result.length} characters`);
    console.log(`- First 100 chars: ${result.substring(0, 100)}...`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

debugUploadProcess().catch(console.error);