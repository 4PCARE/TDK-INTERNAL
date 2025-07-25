
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
      resultType: "markdown",
      verboseMode: true,
      fastMode: false,
      parsingInstruction: `
        COMPREHENSIVE TEXT EXTRACTION - Extract ALL visible text content including:
        
        PRIMARY CONTENT:
        - All body text, paragraphs, and sentences
        - Headers, subheaders, and section titles
        - Footers, page numbers, and references
        - Captions, labels, and annotations
        
        STRUCTURED DATA:
        - Tables: Extract all cell contents with structure
        - Lists: Extract all bullet points and numbered items
        - Forms: Extract field labels and values
        - Multiple columns: Process left-to-right, top-to-bottom
        
        FORMATTING PRESERVATION:
        - Bold, italic, and emphasized text
        - Special characters and symbols
        - Line breaks and paragraph spacing
        - Indentation and hierarchical structure
        
        LANGUAGE HANDLING:
        - Thai text: Extract all Thai characters and diacritics
        - English text: Extract all English content
        - Mixed content: Preserve original language order
        - Numbers, dates, and currency symbols
        
        QUALITY REQUIREMENTS:
        - Extract even small text (footnotes, fine print)
        - Include watermarks and background text if visible
        - Process overlapping or complex layouts
        - Ensure no text is skipped or truncated
        
        Use maximum extraction depth and thoroughness for this credit card document.
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
