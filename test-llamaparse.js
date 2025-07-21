// Test LlamaParse directly to debug the PDF processing
import { LlamaParseReader } from "@llamaindex/cloud";
import fs from "fs";
import path from "path";

async function testLlamaParse() {
  console.log('🧪 Testing LlamaParse Direct Integration');
  console.log('=====================================');
  
  // Check API key
  if (!process.env.LLAMA_CLOUD_API_KEY) {
    console.log('❌ LLAMA_CLOUD_API_KEY not found');
    return;
  }
  
  console.log('✅ LLAMA_CLOUD_API_KEY configured');
  
  // Find a test PDF file
  const uploadsDir = './uploads';
  let testFile = null;
  
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    
    if (pdfFiles.length > 0) {
      testFile = path.join(uploadsDir, pdfFiles[0]);
      console.log(`📄 Testing with: ${pdfFiles[0]}`);
      
      const stats = fs.statSync(testFile);
      console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }
  }
  
  if (!testFile) {
    console.log('📁 No PDF files found in uploads directory');
    return;
  }
  
  try {
    console.log('\n🚀 Initializing LlamaParse...');
    
    const parser = new LlamaParseReader({
      apiKey: process.env.LLAMA_CLOUD_API_KEY,
      resultType: "text",
      parsingInstruction: "Extract all text content including tables, headers, and formatted text. Preserve structure and meaning."
    });
    
    console.log('📤 Sending file to LlamaParse...');
    const startTime = Date.now();
    
    const documents = await parser.loadData(testFile);
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log(`⏱️ Processing completed in ${processingTime.toFixed(2)} seconds`);
    console.log(`📄 Retrieved ${documents?.length || 0} document chunks`);
    
    if (documents && documents.length > 0) {
      const totalText = documents.map(doc => doc.getText()).join('\n\n');
      console.log(`📝 Total text length: ${totalText.length} characters`);
      console.log(`🔤 Text preview (first 300 chars):`);
      console.log(totalText.substring(0, 300) + '...');
      console.log('\n✅ LlamaParse test successful!');
    } else {
      console.log('⚠️ No documents returned from LlamaParse');
    }
    
  } catch (error) {
    console.error('❌ LlamaParse test failed:', error);
    console.log('🔍 Error details:', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
  }
}

testLlamaParse().catch(console.error);