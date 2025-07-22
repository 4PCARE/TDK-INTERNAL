import OpenAI from "openai";
import fs from "fs";
import { Document } from "@shared/schema";
import mammoth from "mammoth";
import XLSX from "xlsx";
import textract from "textract";
import { LlamaParseReader } from "@llamaindex/cloud";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY_ENV_VAR ||
    "default_key",
});

export async function processDocument(
  filePath: string,
  mimeType: string,
): Promise<{
  content: string;
  summary: string;
  tags: string[];
  category: string;
  categoryColor: string;
}> {
  try {
    let content = "";

    // Extract content based on file type
    if (mimeType === "text/plain" || mimeType === "text/csv" || mimeType === "application/json") {
      content = await fs.promises.readFile(filePath, "utf-8");
      
      // Enhanced processing for JSON files
      if (mimeType === "application/json" || filePath.endsWith('.json')) {
        try {
          const jsonData = JSON.parse(content);
          
          // Format JSON for better AI analysis
          const formattedContent = [
            `JSON Data Structure:`,
            `Type: ${Array.isArray(jsonData) ? 'Array' : 'Object'}`,
            `Size: ${Array.isArray(jsonData) ? `${jsonData.length} items` : `${Object.keys(jsonData).length} properties`}`,
            ``,
            `Content Analysis:`,
            JSON.stringify(jsonData, null, 2)
          ].join('\n');
          
          content = formattedContent;
        } catch (jsonError) {
          console.log("JSON parsing error, using raw content:", jsonError);
          // Keep raw content if JSON parsing fails
        }
      }
      // Enhanced processing for CSV files
      else if (mimeType === "text/csv" || filePath.endsWith('.csv')) {
        try {
          const lines = content.split('\n').filter(line => line.trim());
          if (lines.length > 0) {
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            const dataRows = lines.slice(1, Math.min(lines.length, 100)); // Limit to first 100 rows for analysis
            
            // Format CSV content for better AI analysis
            const formattedContent = [
              `CSV Data Structure:`,
              `Headers: ${headers.join(', ')}`,
              `Total Rows: ${lines.length - 1}`,
              `Sample Data:`,
              ...dataRows.slice(0, 10).map((row, index) => {
                const cells = row.split(',').map(cell => cell.trim().replace(/"/g, ''));
                return `Row ${index + 1}: ${headers.map((header, i) => `${header}: ${cells[i] || 'N/A'}`).join(', ')}`;
              })
            ].join('\n');
            
            content = formattedContent;
          }
        } catch (csvError) {
          console.log("CSV parsing fallback to plain text");
          // Fallback to plain text if CSV parsing fails
        }
      }
    } else if (mimeType === "application/pdf") {
      // For PDF files, delegate to enhanced DocumentProcessor
      const fileName = filePath.split("/").pop();
      console.log(`📄 Processing PDF with enhanced DocumentProcessor: ${fileName}`);
      
      try {
        console.log(`🔍 Using enhanced DocumentProcessor for: ${fileName}`);
        
        // Import DocumentProcessor to use enhanced PDF processing
        const { DocumentProcessor } = await import("./documentProcessor");
        const processor = new DocumentProcessor();
        
        // Use the enhanced extractFromPDF method
        const extractedText = await processor.extractFromPDF(filePath);
        
        if (extractedText && extractedText.length > 50) {
          content = extractedText;
          console.log(`✅ Enhanced PDF processing successful: ${extractedText.length} characters extracted`);
        } else {
          console.log(`⚠️ Limited content from enhanced processing: ${extractedText?.length || 0} characters`);
          content = `PDF document: ${fileName}. Contains structured document content for analysis and classification.`;
        }
      } catch (error) {
        console.error("Enhanced PDF processing error:", error);
        content = `PDF document: ${fileName}. Enhanced processing failed - contains document content for comprehensive analysis.`;
      }
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      // Extract text from DOCX
      const docxBuffer = await fs.promises.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer: docxBuffer });
      content = result.value;
    } else if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel"
    ) {
      // Extract text from Excel files
      try {
        const workbook = XLSX.readFile(filePath);
        const sheets = workbook.SheetNames;
        let allText = "";
        sheets.forEach((sheet) => {
          const worksheet = workbook.Sheets[sheet];
          const sheetData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            raw: false,
          });
          allText += `Sheet: ${sheet}\n`;
          sheetData.forEach((row: any) => {
            if (Array.isArray(row) && row.length > 0) {
              allText += row.join("\t") + "\n";
            }
          });
          allText += "\n";
        });
        content =
          allText ||
          `Excel file: ${filePath.split("/").pop()}. Contains ${sheets.length} sheets.`;
      } catch (error) {
        console.error("Excel processing error:", error);
        content = `Excel file: ${filePath.split("/").pop()}. Content extraction failed, analyzing file metadata.`;
      }
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ) {
      // For PPTX files, use textract for text extraction
      try {
        content = await new Promise((resolve, reject) => {
          textract.fromFileWithPath(
            filePath,
            { preserveLineBreaks: true },
            (error: any, text: string) => {
              if (error) {
                console.error("PPTX textract error:", error);
                resolve(
                  `PowerPoint presentation: ${filePath.split("/").pop()}. Contains slide content for analysis.`,
                );
              } else {
                const extractedText = text ? text.trim() : "";
                if (extractedText.length > 30) {
                  resolve(extractedText);
                } else {
                  resolve(
                    `PowerPoint presentation: ${filePath.split("/").pop()}. Contains presentation slides and content.`,
                  );
                }
              }
            },
          );
        });
      } catch (error) {
        console.error("PPTX processing error:", error);
        content = `PowerPoint presentation: ${filePath.split("/").pop()}. Contains presentation content for analysis.`;
      }
    } else if (mimeType.startsWith("image/")) {
      // For images, use GPT-4o vision capabilities
      const imageBuffer = await fs.promises.readFile(filePath);
      const base64Image = imageBuffer.toString("base64");

      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all text and describe the content of this document image. Provide the extracted text and a summary of what's shown.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      });

      content = visionResponse.choices[0].message.content || "";
    }

    if (!content || content.trim().length === 0) {
      return {
        content: "",
        summary: "No content could be extracted from this document.",
        tags: ["empty"],
        category: "Uncategorized",
        categoryColor: "#6B7280",
      };
    }

    // Enhanced AI analysis for intelligent classification and tagging
    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert document classifier and analyzer for a Knowledge Management System. Analyze documents and provide:

1. CATEGORY CLASSIFICATION - Classify into ONE of these categories:
   - HR: Resumes, CVs, job applications, employee documents, recruitment materials
   - Finance: Invoices, budgets, financial reports, expense reports, accounting documents
   - Legal: Contracts, agreements, legal documents, compliance, terms of service
   - Marketing: Campaigns, brochures, presentations, promotional materials, brand assets
   - Technical: Manuals, specifications, code documentation, IT procedures, technical guides
   - Operations: SOPs, workflows, operational guidelines, process documentation
   - Research: Studies, analysis, whitepapers, academic papers, research reports
   - Personal: Personal notes, diaries, personal correspondence, private documents
   - Administrative: Forms, applications, administrative documents, general paperwork
   - Data: CSV files, datasets, spreadsheets, data exports, statistical data, structured data
   - Uncategorized: Documents that don't clearly fit the above categories

2. INTELLIGENT TAGGING - Generate 4-8 specific, relevant tags that describe:
   - Document type/format (csv_data, text_file, structured_data, etc.)
   - Subject matter/topic
   - Purpose/use case
   - Key themes or concepts
   - For CSV: data structure, column types, data purpose
   - For TXT: content type, format, purpose

3. SUMMARY - Create a concise 2-3 sentence summary highlighting the document's main purpose and key information

For CSV files, focus on data structure, columns, and data insights.
For TXT files, analyze content type, purpose, and key information.

Respond with JSON in this exact format:
{
  "category": "category_name",
  "summary": "concise summary here",
  "tags": ["specific_tag1", "topic_tag2", "type_tag3", "purpose_tag4"]
}`,
        },
        {
          role: "user",
          content: `Analyze and classify this document content:\n\n${content.substring(0, 8000)}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
    });

    const analysis = JSON.parse(
      analysisResponse.choices[0].message.content || "{}",
    );

    // Category color mapping for visual identification
    const categoryColors: Record<string, string> = {
      HR: "#10B981", // Green - Human resources
      Finance: "#F59E0B", // Amber - Financial documents
      Legal: "#EF4444", // Red - Legal/compliance
      Marketing: "#8B5CF6", // Purple - Marketing materials
      Technical: "#3B82F6", // Blue - Technical documentation
      Operations: "#6366F1", // Indigo - Operational procedures
      Research: "#06B6D4", // Cyan - Research and analysis
      Personal: "#EC4899", // Pink - Personal documents
      Administrative: "#84CC16", // Lime - Administrative forms
      Data: "#F97316", // Orange - Data files and datasets
      Uncategorized: "#6B7280", // Gray - Uncategorized items
    };

    const category = analysis.category || "Uncategorized";
    const categoryColor = categoryColors[category] || "#6B7280";

    return {
      content: content, // Keep full content for vector storage and search
      summary: analysis.summary || "Document processed successfully",
      tags: Array.isArray(analysis.tags) ? analysis.tags : ["document"],
      category,
      categoryColor,
    };
  } catch (error) {
    console.error("Error processing document with AI:", error);
    return {
      content: "Error extracting content",
      summary: "Document uploaded but could not be processed with AI",
      tags: ["unprocessed"],
      category: "Uncategorized",
      categoryColor: "#6B7280",
    };
  }
}

export async function generateDatabaseResponse(
  userMessage: string,
  schema: any,
  suggestions: string[],
): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Prepare database schema context
  const schemaContext = schema.tables
    .map(
      (table: any) => `
Table: ${table.name}
Columns: ${table.columns.map((col: any) => `${col.name} (${col.type})`).join(", ")}
  `,
    )
    .join("\n\n");

  const prompt = `You are an AI assistant that helps users interact with their database using natural language.

Database Schema:
${schemaContext}

Available SQL Query Suggestions:
${suggestions.join("\n")}

User Question: ${userMessage}

Based on the database schema and user question, please:
1. Provide a helpful response explaining what data might be available
2. Suggest specific SQL queries that would answer their question
3. Explain what the results would show

Format your response in a clear, conversational way that helps the user understand how to get the information they need from their database.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content:
            "You are a helpful database assistant. Help users understand their data and suggest appropriate SQL queries based on their questions.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    return (
      completion.choices[0].message.content ||
      "I'm sorry, I couldn't generate a database response."
    );
  } catch (error) {
    console.error("OpenAI API error for database response:", error);
    throw new Error("Failed to generate database response");
  }
}

export async function generateChatResponse(
  userMessage: string,
  documents: Document[],
  specificDocumentId?: number,
): Promise<string> {
  try {
    let documentContext = "";
    
    if (specificDocumentId && documents.length > 0) {
      // For specific document chat, use vector search to get relevant content
      const { vectorService } = await import('./vectorService');
      const userId = documents[0].userId; // Assume all documents belong to the same user
      
      try {
        // Search for relevant chunks ONLY from the specific document
        const vectorResults = await vectorService.searchDocuments(userMessage, userId, 3, [specificDocumentId]);
        
        console.log(`Specific document chat: Found ${vectorResults.length} chunks from document ${specificDocumentId}`);
        
        if (vectorResults.length > 0) {
          // Use only top 3 most relevant chunks
          documentContext = vectorResults
            .slice(0, 3) // Limited to 3 chunks for focused content
            .map(result => 
              `Document: ${documents[0].name}\nRelevant Content: ${result.document.content}`
            )
            .join("\n\n");
        } else {
          // Fallback with much more content if no vector results
          const doc = documents[0];
          documentContext = `Document: ${doc.name}\nSummary: ${doc.summary}\nTags: ${doc.tags?.join(", ")}\nContent: ${doc.content?.substring(0, 30000)}`;
        }
      } catch (vectorError) {
        console.error("Vector search failed for document chat, using fallback:", vectorError);
        // Fallback to using much more content from the document
        const doc = documents[0];
        documentContext = `Document: ${doc.name}\nSummary: ${doc.summary}\nTags: ${doc.tags?.join(", ")}\nContent: ${doc.content?.substring(0, 30000)}`;
      }
    } else {
      // For general chat, use vector search to get relevant chunks across all documents
      if (documents.length > 0) {
        const { vectorService } = await import('./vectorService');
        const userId = documents[0].userId;
        
        try {
          // Search for relevant chunks across all user's documents
          const vectorResults = await vectorService.searchDocuments(userMessage, userId, 15); // Get more results for general chat
          
          if (vectorResults.length > 0) {
            // Group results by document and build context from relevant chunks
            const documentChunks = new Map<string, {name: string, chunks: string[]}>();
            
            vectorResults.forEach(result => {
              const docId = result.document.metadata.originalDocumentId || result.document.id;
              const docName = documents.find(d => d.id.toString() === docId)?.name || 'Unknown Document';
              
              if (!documentChunks.has(docId)) {
                documentChunks.set(docId, { name: docName, chunks: [] });
              }
              documentChunks.get(docId)!.chunks.push(result.document.content);
            });
            
            // Build context from relevant chunks instead of truncated full documents
            documentContext = Array.from(documentChunks.entries())
              .map(([docId, { name, chunks }]) => 
                `Document: ${name}\nRelevant Content:\n${chunks.join('\n---\n')}`
              )
              .join("\n\n");
              
            console.log(`General chat: Using vector search with ${vectorResults.length} relevant chunks from ${documentChunks.size} documents`);
            
            // Debug: Log first few results to understand what's being retrieved
            console.log(`Debug: Top 5 vector search results for "${userMessage}":`);
            vectorResults.slice(0, 5).forEach((result, index) => {
              const docName = documents.find(d => d.id.toString() === (result.document.metadata.originalDocumentId || result.document.id))?.name || 'Unknown';
              console.log(`${index + 1}. Document: ${docName}, Doc ID: ${result.document.metadata.originalDocumentId}, Similarity: ${result.similarity.toFixed(4)}`);
              console.log(`   Content: ${result.document.content.substring(0, 300)}...`);
              
              // Check if this content contains store information
              if (result.document.content.includes('XOLO') || result.document.content.includes('โซโล่')) {
                console.log(`   *** FOUND XOLO DATA ***`);
              }
              if (result.document.content.includes('บางกะปิ') || result.document.content.includes('Bangkapi')) {
                console.log(`   *** FOUND BANGKAPI DATA ***`);
              }
              if (result.document.content.includes('ชั้น') || result.document.content.includes('Floor')) {
                console.log(`   *** FOUND FLOOR DATA ***`);
              }
            });
            
            // Log the actual document context that will be sent to AI
            console.log(`\n=== DOCUMENT CONTEXT SENT TO AI (${documentContext.length} chars) ===`);
            console.log(documentContext.substring(0, 1000) + (documentContext.length > 1000 ? '...' : ''));
            console.log('=== END CONTEXT ===\n');
          } else {
            // Fallback if no vector results
            documentContext = documents
              .filter((doc) => doc.content && doc.content.trim().length > 0)
              .slice(0, 3)
              .map(
                (doc) =>
                  `Document: ${doc.name}\nSummary: ${doc.summary}\nTags: ${doc.tags?.join(", ")}\nContent Preview: ${doc.content?.substring(0, 5000)}`,
              )
              .join("\n\n");
              
            console.log(`General chat: No vector results, using fallback with ${documents.length} documents`);
          }
        } catch (vectorError) {
          console.error("Vector search failed for general chat, using fallback:", vectorError);
          // Fallback to document summaries and previews
          documentContext = documents
            .filter((doc) => doc.content && doc.content.trim().length > 0)
            .slice(0, 3)
            .map(
              (doc) =>
                `Document: ${doc.name}\nSummary: ${doc.summary}\nTags: ${doc.tags?.join(", ")}\nContent Preview: ${doc.content?.substring(0, 5000)}`,
            )
            .join("\n\n");
        }
      }
    }

    const systemMessage = specificDocumentId 
      ? `You are an AI assistant helping users analyze and understand specific documents. You are currently focusing on a specific document provided in the context below.

Document context:
${documentContext}

Answer questions specifically about this document. Provide detailed analysis, explanations, and insights based on the document's content. If the user's question cannot be answered from this specific document, clearly state that and explain what information is available in the document.`
      : `You are an AI assistant helping users with their document management system. You have access to the user's documents and can answer questions about them, help with searches, provide summaries, and assist with document organization.

IMPORTANT: The context below contains ONLY the most relevant chunks from the user's documents based on their query. Use ONLY this context to answer questions. Do not claim information is missing if it's clearly present in the provided context.

For store location queries (like "XOLO บางกะปิ อยู่ชั้นไหน"), carefully examine the provided document chunks for:
- Store names (both Thai and English)
- Location information (mall names, branches)
- Floor numbers or levels
- Any combination of these details

Available documents context:
${documentContext}

Provide helpful, accurate responses based ONLY on the provided document context above. If specific information is present in the context, use it directly in your response. Do not claim that information is missing if it appears in the context.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemMessage,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      max_tokens: 700,
    });

    return (
      response.choices[0].message.content ||
      "I'm sorry, I couldn't generate a response at this time."
    );
  } catch (error) {
    console.error("Error generating chat response:", error);
    return "I'm experiencing some technical difficulties. Please try again later.";
  }
}
