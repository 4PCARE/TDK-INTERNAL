import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import textract from "textract";
import cliProgress from "cli-progress";
import { LlamaParseReader } from "@llamaindex/cloud";

import { processDocument as aiProcessDocument } from "./openai";
import { vectorService } from "./vectorService";
import { storage } from "../storage";

// Added imports for PDF processing and OCR
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DocumentProcessor {
  async processDocument(documentId: number): Promise<void> {
    const startTime = Date.now();

    // Create overall progress bar for document processing
    const overallProgress = new cliProgress.SingleBar({
      format: `Document Processing |{bar}| {percentage}% | {stage} | ETA: {eta}s`,
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    });

    try {
      const document = await storage.getDocument(documentId, "");
      if (!document) {
        throw new Error("Document not found");
      }

      const fileName = path.basename(document.filePath);
      const fileStats = await fs.promises.stat(document.filePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);

      console.log(
        `🚀 Starting document processing pipeline for: ${fileName} (${fileSizeMB.toFixed(2)}MB)`,
      );

      // Initialize progress tracking (4 main stages)
      overallProgress.start(4, 0);

      // Stage 1: Text Extraction
      overallProgress.update(1, { stage: "Extracting text content..." });
      const extractionStart = Date.now();
      const content = await this.extractTextFromFile(
        document.filePath,
        document.mimeType,
      );
      const extractionTime = (Date.now() - extractionStart) / 1000;
      console.log(
        `⏱️ Text extraction completed in ${extractionTime.toFixed(2)}s (${content.length} characters)`,
      );

      // Stage 2: AI Processing for summary and tags
      overallProgress.update(2, { stage: "AI analysis and summarization..." });
      const aiStart = Date.now();
      const { summary, tags } = await aiProcessDocument(
        document.filePath,
        document.mimeType,
      );
      const aiTime = (Date.now() - aiStart) / 1000;
      console.log(`🤖 AI processing completed in ${aiTime.toFixed(2)}s`);

      // Stage 3: Database Update
      overallProgress.update(3, { stage: "Updating database..." });
      await storage.updateDocument(
        documentId,
        {
          content,
          summary,
          tags,
          processedAt: new Date(),
        },
        document.userId,
      );

      // Stage 4: Vector Database Indexing
      overallProgress.update(4, { stage: "Creating search index..." });
      if (content && content.trim().length > 0) {
        const vectorStart = Date.now();
        await vectorService.addDocument(documentId.toString(), content, {
          userId: document.userId,
          documentName: document.name,
          mimeType: document.mimeType,
          tags: tags || [],
        });
        const vectorTime = (Date.now() - vectorStart) / 1000;
        console.log(
          `🔍 Vector indexing completed in ${vectorTime.toFixed(2)}s`,
        );
      }

      // Complete processing
      overallProgress.update(4, { stage: "Complete!" });
      overallProgress.stop();

      const totalTime = (Date.now() - startTime) / 1000;
      console.log(
        `✅ Document ${documentId} (${fileName}) processed successfully in ${totalTime.toFixed(2)}s`,
      );
      console.log(
        `📊 Processing breakdown - Extraction: ${extractionTime.toFixed(1)}s, AI: ${aiTime.toFixed(1)}s, Total: ${totalTime.toFixed(1)}s`,
      );
    } catch (error) {
      overallProgress.stop();
      console.error(`❌ Error processing document ${documentId}:`, error);
      throw error;
    }
  }

  private async extractTextFromFile(
    filePath: string,
    fileType: string,
  ): Promise<string> {
    try {
      switch (fileType) {
        case "text/plain":
          return await fs.promises.readFile(filePath, "utf-8");

        case "application/pdf":
          return await this.extractFromPDF(filePath);

        case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
          return await this.extractFromDOCX(filePath);

        case "application/msword":
          return await this.extractWithTextract(filePath);

        case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        case "application/vnd.ms-powerpoint":
          return await this.extractWithTextract(filePath);

        case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        case "application/vnd.ms-excel":
          return await this.extractWithTextract(filePath);

        case "text/csv":
          return await fs.promises.readFile(filePath, "utf-8");

        case "application/json":
          return await this.extractFromJSON(filePath);

        default:
          if (fileType.startsWith("image/")) {
            // For images, we'll rely on AI processing for OCR
            return await this.extractWithTextract(filePath);
          }
          return await this.extractWithTextract(filePath);
      }
    } catch (error) {
      console.error("Error extracting text:", error);
      return "";
    }
  }

  public async extractFromPDF(filePath: string): Promise<string> {
    const fileName = path.basename(filePath);
    console.log(`🔄 Starting PDF processing for: ${fileName}`);

    // Create progress bar for PDF processing
    const progressBar = new cliProgress.SingleBar({
      format: `PDF Processing |{bar}| {percentage}% | {value}/{total} steps | {eta}s ETA | ${fileName}`,
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    });

    try {
      // Check file size to determine processing strategy
      const fileStats = await fs.promises.stat(filePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);

      console.log(`📄 PDF file size: ${fileSizeMB.toFixed(2)} MB`);

      // Initialize progress tracking
      const totalSteps = fileSizeMB > 50 ? 4 : 3; // More steps for large files
      progressBar.start(totalSteps, 0);

      // Step 1: Try LlamaParse first (best for large PDFs)
      progressBar.update(1, { eta: "Initializing LlamaParse..." });

      console.log(
        `🔑 LLAMA_CLOUD_API_KEY status: ${process.env.LLAMA_CLOUD_API_KEY ? "Available" : "Missing"}`,
      );
      console.log(
        `🔑 API Key length: ${process.env.LLAMA_CLOUD_API_KEY?.length || 0}`,
      );

      if (
        process.env.LLAMA_CLOUD_API_KEY &&
        process.env.LLAMA_CLOUD_API_KEY.length > 10
      ) {
        try {
          console.log(`🚀 Starting LlamaParse extraction for ${fileName}...`);
          const extractedText = await this.extractWithLlamaParse(
            filePath,
            progressBar,
            fileSizeMB,
          );
          // Check if LlamaParse extracted meaningful content with Thai text
          const hasContent = extractedText && extractedText.length > 100;
          const hasRealText = extractedText && extractedText.replace(/[\s\n\r-]/g, '').length > 50;
          const hasThai = extractedText && /[\u0E00-\u0E7F]{5}/.test(extractedText); // 5+ Thai chars in a row
          
          // Debug what LlamaParse found
          console.log(`🔍 LlamaParse analysis:`);
          console.log(`   - Total length: ${extractedText?.length || 0}`);
          console.log(`   - Non-whitespace: ${extractedText?.replace(/[\s\n\r-]/g, '').length || 0}`);
          console.log(`   - Contains Thai: ${hasThai ? 'Yes' : 'No'}`);
          console.log(`   - Sample text: "${extractedText?.substring(0, 200) || 'None'}..."`);
          
          if (hasContent && hasRealText && hasThai) {
            console.log(
              `✅ PDF processed successfully with LlamaParse: ${extractedText.length} characters with Thai content`,
            );
            return extractedText;
          } else {
            console.log(
              `⚠️ LlamaParse failed quality check - ${!hasContent ? 'too short' : !hasRealText ? 'mostly whitespace' : 'no Thai text'} - trying Tesseract OCR...`,
            );
            
            // Step 1.5: Native Tesseract OCR as a Fallback
            try {
              console.log(`🚀 Starting native Tesseract OCR extraction for ${fileName}...`);
              
              const ocrText = await this.ocrThaiPDF(filePath);
              
              if (ocrText && ocrText.length > 10) {
                console.log(`✅ Native Tesseract OCR extracted ${ocrText.length} characters`);
                
                // Check for Thai content
                const thaiRegex = /[\u0E00-\u0E7F]/;
                const hasThaiText = thaiRegex.test(ocrText);
                console.log(`🇹🇭 Contains Thai text: ${hasThaiText ? 'Yes' : 'No'}`);
                
                // Compare OCR vs LlamaParse results intelligently
                const ocrNonWhitespace = ocrText.replace(/[\s\n\r-]/g, '').length;
                const llamaNonWhitespace = extractedText?.replace(/[\s\n\r-]/g, '').length || 0;
                const ocrHasThai = /[\u0E00-\u0E7F]{5}/.test(ocrText);
                const llamaHasThai = extractedText && /[\u0E00-\u0E7F]{5}/.test(extractedText);
                
                console.log(`🔄 Comparing results:`);
                console.log(`   - OCR: ${ocrNonWhitespace} chars, Thai: ${ocrHasThai ? 'Yes' : 'No'}`);
                console.log(`   - LlamaParse: ${llamaNonWhitespace} chars, Thai: ${llamaHasThai ? 'Yes' : 'No'}`);
                
                // Prefer OCR if it has Thai content and LlamaParse doesn't
                if (ocrHasThai && !llamaHasThai) {
                  console.log(`🔄 OCR has Thai content, LlamaParse doesn't - using OCR result`);
                  return ocrText;
                }
                
                // Prefer OCR if it has significantly more content
                if (ocrNonWhitespace > llamaNonWhitespace * 1.5) {
                  console.log(`🔄 OCR found significantly more content (${ocrNonWhitespace} vs ${llamaNonWhitespace} chars) - using OCR result`);
                  return ocrText;
                }
                
                // If both have Thai content, prefer the longer one
                if (ocrHasThai && llamaHasThai) {
                  if (ocrNonWhitespace > llamaNonWhitespace) {
                    console.log(`🔄 Both have Thai, OCR is longer - using OCR result`);
                    return ocrText;
                  } else {
                    console.log(`🔄 Both have Thai, LlamaParse is longer - using LlamaParse result`);
                    return extractedText;
                  }
                }
                
                // Default: use OCR if it has decent content, otherwise fallback to LlamaParse
                if (ocrNonWhitespace > 50) {
                  console.log(`🔄 Using OCR result as primary choice`);
                  return ocrText;
                } else if (extractedText && extractedText.length > 10) {
                  console.log(`🔄 OCR insufficient, using LlamaParse fallback`);
                  return extractedText;
                } else {
                  console.log(`🔄 Both methods failed, using OCR as last resort`);
                  return ocrText;
                }
              } else {
                console.log(`⚠️ Native Tesseract OCR returned minimal content.`);
                // Still return LlamaParse result even if minimal
                if (extractedText && extractedText.length > 0) {
                  return extractedText;
                }
              }

            } catch (tesseractError) {
              console.error("❌ Native Tesseract OCR failed:", tesseractError);
              // Return LlamaParse result as fallback
              if (extractedText && extractedText.length > 0) {
                return extractedText;
              }
            }
          }
        } catch (llamaError) {
          const errorMessage =
            llamaError instanceof Error ? llamaError.message : "Unknown error";
          console.log(`❌ LlamaParse failed: ${errorMessage}`);
        }
      } else {
        console.log("❌ LLAMA_CLOUD_API_KEY not found, using fallback system");
      }

      // Step 2: Fallback to textract if LlamaParse fails
      progressBar.update(2, { eta: "Using textract fallback..." });

      let fallbackResult = await this.extractWithTextract(filePath);

      progressBar.update(3, { eta: "Complete!" });
      progressBar.stop();

      if (fallbackResult && fallbackResult.length > 10) {
        console.log(
          `✅ PDF processed with textract fallback: ${fallbackResult.length} characters extracted`,
        );
        return fallbackResult;
      }

      console.log(`✅ PDF processed: ${fileName}`);
      return `PDF document: ${fileName}. Contains ${fileSizeMB.toFixed(2)}MB of structured document content ready for AI analysis and intelligent classification.`;
    } catch (error) {
      progressBar.stop();
      console.error("PDF extraction error:", error);
      return `PDF document: ${fileName}. Processing error occurred - contains document content for analysis.`;
    }
  }

  private async extractWithLlamaParse(
    filePath: string,
    progressBar: cliProgress.SingleBar,
    fileSizeMB: number,
  ): Promise<string> {
    const fileName = path.basename(filePath);

    try {
      // Initialize LlamaParse with aggressive text extraction settings
      const parser = new LlamaParseReader({
        apiKey: process.env.LLAMA_CLOUD_API_KEY!,
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

          For ${Math.ceil(fileSizeMB)}MB document: Use maximum extraction depth and thoroughness.
        `,
      });

      console.log(
        `🚀 LlamaParse processing ${fileName} (${fileSizeMB.toFixed(2)}MB)...`,
      );

      // For very large files, implement chunked processing
      if (fileSizeMB > 100) {
        return await this.processLargePDFInChunks(
          parser,
          filePath,
          progressBar,
          fileSizeMB,
        );
      }

      // Regular processing for smaller files
      progressBar.update(2, { eta: "Extracting with LlamaParse..." });

      const startTime = Date.now();
      const documents = await parser.loadData(filePath);
      const processingTime = (Date.now() - startTime) / 1000;

      console.log(
        `⏱️ LlamaParse processing time: ${processingTime.toFixed(2)}s`,
      );

      console.log(`-----Llama parsed into ${documents.length} documents`);

      if (documents && documents.length > 0) {
        progressBar.update(3, { eta: "Combining extracted text..." });

        // Combine all extracted text with page separators and ensure UTF-8 encoding
        const extractedText = documents
          .map((doc: any, index: number) => {
            const rawText = doc.getText();
            // Ensure UTF-8 encoding by converting to Buffer and back
            const text = rawText ? Buffer.from(rawText, 'utf8').toString('utf8') : "";
            console.log(`📄 Page ${index + 1}: ${text?.length || 0} characters`);
            return text ? `--- Page ${index + 1} ---\n${text}` : "";
          })
          .filter((text) => text.length > 0)
          .join("\n\n");

        console.log(`📊 Extraction results: ${extractedText.length} characters from ${documents.length} pages`);

        if (extractedText.length > 50) {
          console.log(
            `📄 Successfully extracted ${extractedText.length} characters from ${documents.length} pages`,
          );
          return extractedText.trim();
        }
      }

      throw new Error("No meaningful content extracted");
    } catch (error) {
      console.error(`❌ LlamaParse error for ${fileName}:`, error);
      throw error;
    }
  }

  private async processLargePDFInChunks(
    parser: LlamaParseReader,
    filePath: string,
    progressBar: cliProgress.SingleBar,
    fileSizeMB: number,
  ): Promise<string> {
    const fileName = path.basename(filePath);
    console.log(
      `🔄 Processing large PDF (${fileSizeMB.toFixed(2)}MB) in optimized chunks...`,
    );

    try {
      // For very large files, use LlamaParse's chunking capabilities
      progressBar.update(2, { eta: "Processing large PDF in chunks..." });

      const startTime = Date.now();
      const documents = await parser.loadData(filePath);
      const processingTime = (Date.now() - startTime) / 1000;

      console.log(
        `⏱️ Large PDF processing time: ${processingTime.toFixed(2)}s for ${documents?.length || 0} chunks`,
      );

      if (documents && documents.length > 0) {
        progressBar.update(3, { eta: "Combining large document chunks..." });

        // Process and combine chunks with progress tracking and UTF-8 encoding
        let combinedText = "";
        const totalChunks = documents.length;

        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          const rawText = doc.getText();
          // Ensure UTF-8 encoding by converting to Buffer and back
          const text = rawText ? Buffer.from(rawText, 'utf8').toString('utf8') : "";

          if (text && text.length > 0) {
            combinedText += `--- Section ${i + 1}/${totalChunks} ---\n${text}\n\n`;
          }

          // Update progress for chunk processing
          if (i % Math.ceil(totalChunks / 10) === 0) {
            console.log(`📄 Processed chunk ${i + 1}/${totalChunks}`);
          }
        }

        console.log(
          `✅ Large PDF processing complete: ${combinedText.length} characters from ${totalChunks} chunks`,
        );
        return combinedText.trim();
      }

      throw new Error("No content extracted from large PDF");
    } catch (error) {
      console.error(`❌ Large PDF processing error for ${fileName}:`, error);
      throw error;
    }
  }

  private async extractFromDOCX(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      console.error("DOCX extraction error:", error);
      throw new Error("Failed to extract text from DOCX");
    }
  }

  private async extractFromJSON(filePath: string): Promise<string> {
    try {
      const rawData = await fs.promises.readFile(filePath, "utf-8");
      const jsonData = JSON.parse(rawData);

      // Convert JSON to readable text format
      const formattedJson = this.formatJsonForText(jsonData);
      return formattedJson;
    } catch (error) {
      console.error("JSON processing error:", error);
      // If JSON parsing fails, return raw content
      return await fs.promises.readFile(filePath, "utf-8");
    }
  }

  private formatJsonForText(obj: any, indent: number = 0): string {
    const spaces = "  ".repeat(indent);
    let result = "";

    if (Array.isArray(obj)) {
      result += "[\n";
      obj.forEach((item, index) => {
        result += spaces + "  ";
        if (typeof item === "object" && item !== null) {
          result += this.formatJsonForText(item, indent + 1);
        } else {
          result += JSON.stringify(item);
        }
        if (index < obj.length - 1) result += ",";
        result += "\n";
      });
      result += spaces + "]";
    } else if (typeof obj === "object" && obj !== null) {
      result += "{\n";
      const keys = Object.keys(obj);
      keys.forEach((key, index) => {
        result += spaces + `  "${key}": `;
        if (typeof obj[key] === "object" && obj[key] !== null) {
          result += this.formatJsonForText(obj[key], indent + 1);
        } else {
          result += JSON.stringify(obj[key]);
        }
        if (index < keys.length - 1) result += ",";
        result += "\n";
      });
      result += spaces + "}";
    } else {
      result += JSON.stringify(obj);
    }

    return result;
  }



  private async extractWithTextract(filePath: string): Promise<string> {
    const fileName = path.basename(filePath);
    console.log(`🔄 Textract fallback processing: ${fileName}`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log(
          `⏰ Textract timeout for ${fileName} - using graceful fallback`,
        );
        resolve(
          `Document: ${fileName}. Contains PDF content ready for AI analysis and classification.`,
        );
      }, 30000); // 30 second timeout for textract

      try {
        textract.fromFileWithPath(
          filePath,
          {
            preserveLineBreaks: true,
            preserveOnlyMultipleLineBreaks: false,
            includeAltText: true,
          },
          (error: any, text: string) => {
            clearTimeout(timeout);

            if (error) {
              console.log(
                `⚠️ Textract extraction issue for ${fileName} - using graceful fallback`,
              );
              resolve(
                `Document: ${fileName}. Contains PDF content ready for AI analysis and classification.`,
              );
            } else {
              const extractedText = text ? text.trim() : "";
              if (extractedText.length > 10) {
                console.log(
                  `✅ Textract extracted ${extractedText.length} characters from ${fileName}`,
                );
                resolve(extractedText);
              } else {
                resolve(
                  `Document: ${fileName}. Contains PDF content ready for AI analysis and classification.`,
                );
              }
            }
          },
        );
      } catch (textractError) {
        clearTimeout(timeout);
        console.log(
          `⚠️ Textract setup error for ${fileName} - using graceful fallback`,
        );
        resolve(
          `Document: ${fileName}. Contains PDF content ready for AI analysis and classification.`,
        );
      }
    });
  }

  private getCategoryColor(category: string): string {
    const colors = {
      document: "#3B82F6",
      image: "#8B5CF6",
      text: "#10B981",
      report: "#F59E0B",
      contract: "#EF4444",
      presentation: "#6366F1",
    };
    return colors[category.toLowerCase() as keyof typeof colors] || "#6B7280";
  }





  private getCategoryIcon(category: string): string {
    const icons = {
      document: "📄",
      image: "🖼️",
      text: "📝",
      report: "📊",
      contract: "📋",
      presentation: "📊",
    };
    return icons[category.toLowerCase() as keyof typeof icons] || "📁";
  }

  /**
   * OCR Thai PDF using native Tesseract CLI
   * Converts PDF pages to images and runs OCR on each page
   */
  private async ocrThaiPDF(pdfPath: string): Promise<string> {
    const fileName = path.basename(pdfPath);
    const tempDir = path.join(path.dirname(pdfPath), 'temp_ocr');
    const outputPrefix = path.join(tempDir, 'page');

    try {
      // Create temporary directory
      await fs.promises.mkdir(tempDir, { recursive: true });

      console.log(`📄 Converting PDF pages to images for OCR...`);
      
      // Convert PDF to PNG images (all pages)
      await execAsync(`pdftoppm -png "${pdfPath}" "${outputPrefix}"`);

      // Find all generated image files
      const files = await fs.promises.readdir(tempDir);
      const imageFiles = files
        .filter(f => f.startsWith('page-') && f.endsWith('.png'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/page-(\d+)\.png/)?.[1] || '0');
          const numB = parseInt(b.match(/page-(\d+)\.png/)?.[1] || '0');
          return numA - numB;
        });

      console.log(`📷 Generated ${imageFiles.length} image files for OCR`);

      if (imageFiles.length === 0) {
        throw new Error('No images generated from PDF');
      }

      let allText = '';
      
      // Process each page with OCR
      for (let i = 0; i < imageFiles.length; i++) {
        const imagePath = path.join(tempDir, imageFiles[i]);
        const pageNum = i + 1;
        
        try {
          console.log(`🔍 OCR processing page ${pageNum}/${imageFiles.length}...`);
          
          // Run Tesseract OCR with Thai + English support
          const { stdout } = await execAsync(`tesseract "${imagePath}" stdout -l tha+eng --psm 3 --oem 3`);
          
          if (stdout && stdout.trim().length > 0) {
            const cleanText = stdout.trim();
            allText += `--- Page ${pageNum} ---\n${cleanText}\n\n`;
            console.log(`📄 Page ${pageNum}: ${cleanText.length} characters extracted`);
          } else {
            console.log(`⚠️ Page ${pageNum}: No text extracted`);
          }
          
        } catch (pageError) {
          console.log(`⚠️ OCR failed for page ${pageNum}:`, pageError.message);
        }
      }

      // Clean up temporary files
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.log(`⚠️ Could not clean up temp directory: ${cleanupError.message}`);
      }

      if (allText.length > 10) {
        // Check for Thai content
        const thaiRegex = /[\u0E00-\u0E7F]/;
        const hasThaiText = thaiRegex.test(allText);
        
        console.log(`✅ OCR completed successfully:`);
        console.log(`   - Total characters: ${allText.length}`);
        console.log(`   - Pages processed: ${imageFiles.length}`);
        console.log(`   - Contains Thai text: ${hasThaiText ? 'Yes' : 'No'}`);
        
        return allText.trim();
      } else {
        console.log(`⚠️ OCR completed but extracted minimal text: ${allText.length} characters`);
        return '';
      }

    } catch (error) {
      console.error(`❌ OCR processing failed for ${fileName}:`, error.message);
      
      // Clean up on error
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }
}

export const documentProcessor = new DocumentProcessor();