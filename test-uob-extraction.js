
import { LlamaParseReader } from "@llamaindex/cloud";
import Tesseract from "tesseract.js";
import fs from "fs";
import path from "path";

async function testUOBExtraction() {
  console.log('🔍 Testing UOB PDF Extraction');
  console.log('=============================');
  
  // Find the UOB file
  const uploadsDir = './uploads';
  let uobFile = null;
  
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    const uobFiles = files.filter(file => 
      file.toLowerCase().includes('uob') && 
      file.toLowerCase().endsWith('.pdf')
    );
    
    if (uobFiles.length > 0) {
      uobFile = path.join(uploadsDir, uobFiles[0]);
      console.log(`📄 Testing UOB file: ${uobFiles[0]}`);
      
      const stats = fs.statSync(uobFile);
      console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }
  }
  
  // Also check attached_assets
  const attachedDir = './attached_assets';
  if (!uobFile && fs.existsSync(attachedDir)) {
    const files = fs.readdirSync(attachedDir);
    const uobFiles = files.filter(file => 
      file.toLowerCase().includes('uob') && 
      file.toLowerCase().endsWith('.pdf')
    );
    
    if (uobFiles.length > 0) {
      uobFile = path.join(attachedDir, uobFiles[0]);
      console.log(`📄 Testing UOB file from attached: ${uobFiles[0]}`);
      
      const stats = fs.statSync(uobFile);
      console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }
  }
  
  if (!uobFile) {
    console.log('❌ No UOB PDF files found');
    return;
  }
  
  // Check API key
  if (!process.env.LLAMA_CLOUD_API_KEY) {
    console.log('❌ LLAMA_CLOUD_API_KEY not found');
    return;
  }
  
  console.log('✅ LLAMA_CLOUD_API_KEY configured');
  
  try {
    console.log('\n🚀 Testing aggressive LlamaParse extraction...');
    
    const parser = new LlamaParseReader({
      apiKey: process.env.LLAMA_CLOUD_API_KEY,
      resultType: "text",
      verboseMode: true,
      fastMode: false,
      // Enhanced settings for image-scanned Thai documents
      splitByPage: false,
      skipDiagonalText: false,
      takeScreenshot: true,
      useTextractOcr: true,
      premiumMode: true,
      parsingInstruction: `
        ADVANCED THAI OCR EXTRACTION - This is a scanned Thai document requiring intensive OCR processing:
        
        OCR OPTIMIZATION:
        - Apply maximum OCR strength for scanned images
        - Use advanced character recognition for Thai script (ก-ฮ, ะ-ฺ, เ-ไ)
        - Process all diacritics and tone marks accurately
        - Handle mixed Thai-English content with proper language detection
        - Extract numbers in both Thai (๐-๙) and Arabic (0-9) numerals
        
        VISUAL PROCESSING:
        - Analyze entire page as image first before text extraction
        - Process low-contrast text and faded sections
        - Handle rotated or skewed text orientation
        - Extract text from complex backgrounds and overlays
        - Process multi-column layouts carefully (left-to-right, top-to-bottom)
        
        CONTENT EXTRACTION:
        - Extract ALL visible text including headers, body, footers
        - Capture table contents with proper cell structure
        - Include bullet points, numbered lists, and form fields
        - Process promotional text, terms, conditions, and fine print
        - Extract dates, percentages, currency amounts, and contact information
        
        THAI LANGUAGE SPECIFICS:
        - Recognize Thai sentence structure without spaces
        - Handle compound words and technical terms
        - Process banking/financial terminology in Thai
        - Extract proper nouns and brand names accurately
        - Maintain original text flow and reading order
        
        QUALITY ASSURANCE:
        - Double-check OCR accuracy for critical information
        - Verify numerical data and monetary amounts
        - Ensure complete extraction from all page regions
        - Process watermarks and background elements if readable
        
        Document: UOB Credit Card Promotion in Thai - Apply maximum processing power and OCR precision.
        Expected output: Comprehensive Thai text extraction with high fidelity.
      `
    });
    
    const startTime = Date.now();
    const documents = await parser.loadData(uobFile);
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log(`⏱️ Processing completed in ${processingTime.toFixed(2)} seconds`);
    console.log(`📄 Retrieved ${documents?.length || 0} document chunks`);
    
    if (documents && documents.length > 0) {
      let totalText = "";
      
      documents.forEach((doc, index) => {
        const pageText = doc.getText();
        console.log(`📄 Page ${index + 1}: ${pageText?.length || 0} characters`);
        if (pageText && pageText.length > 0) {
          totalText += `--- Page ${index + 1} ---\n${pageText}\n\n`;
        }
      });
      
      console.log(`📝 Total extracted text: ${totalText.length} characters`);
      
      if (totalText.length > 100) {
        console.log(`🔤 Content preview (first 500 chars):`);
        console.log('=' .repeat(50));
        console.log(totalText.substring(0, 500));
        console.log('=' .repeat(50));
        
        // Check for Thai content
        const thaiRegex = /[\u0E00-\u0E7F]/;
        const hasThaiText = thaiRegex.test(totalText);
        console.log(`🇹🇭 Contains Thai text: ${hasThaiText ? 'Yes' : 'No'}`);
        
        // Check for common credit card terms
        const creditTerms = ['บัตรเครดิต', 'credit card', 'UOB', 'เครดิตเงินคืน', 'โปรโมชั่น'];
        const foundTerms = creditTerms.filter(term => 
          totalText.toLowerCase().includes(term.toLowerCase())
        );
        console.log(`💳 Credit card terms found: ${foundTerms.join(', ')}`);
        
        console.log('\n✅ Enhanced LlamaParse extraction successful!');
      } else {
        console.log('⚠️ Very little content extracted');
        console.log('Raw text:', totalText);
      }
    } else {
      console.log('❌ No content extracted from LlamaParse');
    }
    
  } catch (error) {
    console.error('❌ LlamaParse test failed:', error.message);
    console.log('🔍 Error details:', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
  }
  
  // Test Tesseract OCR for Thai content
  console.log('\n🔍 Testing Tesseract OCR for Thai content...');
  try {
    console.log('🚀 Starting Tesseract OCR with Thai+English support...');
    
    const { data: { text } } = await Tesseract.recognize(
      uobFile,
      'tha+eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`📄 OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
        tessedit_char_whitelist: 'กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮะาเแโใไ่้๊๋์ํฯ๐๑๒๓๔๕๖๗๘๙ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?():;-',
        preserve_interword_spaces: '1'
      }
    );
    
    console.log(`📝 Tesseract extracted: ${text.length} characters`);
    
    if (text && text.length > 100) {
      console.log(`🔤 OCR Content preview (first 500 chars):`);
      console.log('=' .repeat(50));
      console.log(text.substring(0, 500));
      console.log('=' .repeat(50));
      
      // Check for Thai content
      const thaiRegex = /[\u0E00-\u0E7F]/;
      const hasThaiText = thaiRegex.test(text);
      console.log(`🇹🇭 Contains Thai text: ${hasThaiText ? 'Yes' : 'No'}`);
      
      // Check for UOB credit card terms
      const creditTerms = ['บัตรเครดิต', 'UOB', 'เครดิตเงินคืน', 'โปรโมชั่น', 'ส่วนลด', 'แลกรับ'];
      const foundTerms = creditTerms.filter(term => 
        text.toLowerCase().includes(term.toLowerCase())
      );
      console.log(`💳 Credit card terms found: ${foundTerms.join(', ')}`);
      
      console.log('\n✅ Tesseract OCR extraction successful!');
    } else {
      console.log('⚠️ Tesseract OCR yielded minimal content');
    }
    
  } catch (ocrError) {
    console.error('❌ Tesseract OCR test failed:', ocrError.message);
  }
}

testUOBExtraction().catch(console.error);
