// Test latest uploaded PDF with LlamaParse
import { LlamaParseReader } from "@llamaindex/cloud";
import fs from "fs";

async function testLatestPDF() {
  console.log('🧪 Testing Latest PDF Upload with LlamaParse');
  console.log('============================================');
  
  const testFile = '/home/runner/workspace/uploads/files-1753086794953-486694263.pdf';
  
  // Check if file exists
  if (!fs.existsSync(testFile)) {
    console.log('❌ File not found:', testFile);
    return;
  }
  
  const stats = fs.statSync(testFile);
  console.log(`📄 File: ${testFile.split('/').pop()}`);
  console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  
  // Check API key
  console.log(`🔑 LLAMA_CLOUD_API_KEY: ${process.env.LLAMA_CLOUD_API_KEY ? 'Available' : 'Missing'}`);
  
  if (!process.env.LLAMA_CLOUD_API_KEY) {
    console.log('❌ API Key missing - cannot test LlamaParse');
    return;
  }
  
  try {
    console.log('\n🚀 Testing LlamaParse extraction...');
    
    const parser = new LlamaParseReader({
      apiKey: process.env.LLAMA_CLOUD_API_KEY,
      resultType: "text",
      parsingInstruction: "Extract all text content including tables, headers, and formatted text. Preserve structure and meaning."
    });
    
    const startTime = Date.now();
    const documents = await parser.loadData(testFile);
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log(`⏱️ Processing time: ${processingTime.toFixed(2)} seconds`);
    console.log(`📄 Documents returned: ${documents?.length || 0}`);
    
    if (documents && documents.length > 0) {
      const totalText = documents.map(doc => doc.getText()).join('\n\n');
      console.log(`📝 Total extracted text: ${totalText.length} characters`);
      
      if (totalText.length > 100) {
        console.log(`🔤 Content preview (first 200 chars):`);
        console.log(totalText.substring(0, 200) + '...');
        console.log('\n✅ LlamaParse working correctly!');
      } else {
        console.log('⚠️ Very little content extracted');
        console.log('Raw text:', totalText);
      }
    } else {
      console.log('❌ No content extracted from LlamaParse');
    }
    
  } catch (error) {
    console.error('❌ LlamaParse error:', error.message);
    console.log('🔍 Error details:', error);
  }
}

testLatestPDF().catch(console.error);