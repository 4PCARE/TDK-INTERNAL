import OpenAI from "openai";
import fs from "fs";
import { Document } from "@shared/schema";
import mammoth from "mammoth";
import XLSX from "xlsx";
import textract from "textract";
import { LlamaParseReader } from "@llamaindex/cloud";
import { storage } from "../storage";
import { ChatCompletionMessageParam } from "openai/resources/chat";


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
    query: string,
    documents: any[],
    relevantChunks: any[] = [],
    chatHistory: {role: 'user'|'assistant', content: string}[] = []
  ): Promise<string> {
    try {
      const MAX_CHUNKS = 5;
      const MAX_CHUNK_CHARS = 4000;
      const SIMILARITY_THRESHOLD = 0.2;

      // 1. Rank all chunks by similarity (desc)
      const rankedChunks = allChunks
        .filter(chunk => typeof chunk.similarity === "number") // ensure score exists
        .filter(chunk => chunk.similarity >= SIMILARITY_THRESHOLD) // pass threshold
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, MAX_CHUNKS);

      // 2. Trim each chunk's content for safety
      const promptChunks = rankedChunks.map((chunk, i) =>
        `--- Chunk #${i + 1} (${chunk.name || "Doc"}, similarity: ${chunk.similarity.toFixed(3)}) ---\n${chunk.content.slice(0, MAX_CHUNK_CHARS)}`
      );

      // 3. Build document context string
      const documentContext = promptChunks.length > 0
        ? promptChunks.join("\n\n")
        : "No highly relevant document chunks found.";

      // ...use `documentContext` in your system prompt


      const systemPrompt = `
  You are an AI assistant helping users with their document management system.
  Below are the most relevant document chunks for the current user query.

  ${documentContext}

  Use ONLY these chunks to answer the question below. If the answer cannot be found, say you cannot find it based on the documents.
      `;

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const messages: ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          ...chatHistory.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content
          })),
          { role: "user", content: query }
        ];

      // Optional debug
      console.log("📏 Sending prompt of", systemPrompt.length, "chars (approx", Math.round(systemPrompt.length/4), "tokens)");

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
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


// Utility function to extract JSON from response
function extractJsonFromResponse(response: string): any {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {};
  } catch (error) {
    console.error('Failed to parse JSON from response:', error);
    return {};
  }
}

export async function generateGeneralChatResponse(
  userMessage: string,
  documents: any[],
  userId: string
): Promise<string> {
  try {
    // === OPENAI QUERY AUGMENTATION ===
    let optimizedSearchQuery = userMessage;
    try {
      console.log(`🧠 General Chat: Starting OpenAI query augmentation for: "${userMessage}"`);

      const { queryAugmentationService } = await import("./queryAugmentationService");
      
      const augmentationResult = await queryAugmentationService.augmentQuery(
        userMessage,
        userId,
        "general",
        "general",
        10 // Analyze last 10 messages
      );

      if (augmentationResult.shouldUseAugmented && augmentationResult.confidence >= 0.6) {
        optimizedSearchQuery = augmentationResult.augmentedQuery;
        console.log(`✅ General Chat: Query augmentation successful!`);
        console.log(`   📝 Original query: "${userMessage}"`);
        console.log(`   🎯 Augmented query: "${optimizedSearchQuery}"`);
        console.log(`   🔑 Keywords: [${augmentationResult.extractedKeywords.join(', ')}]`);
        console.log(`   📊 Confidence: ${augmentationResult.confidence}`);
        console.log(`   💡 Insights: ${augmentationResult.contextualInsights}`);
      } else {
        console.log(`⚠️ General Chat: Low confidence (${augmentationResult.confidence}), using original query`);
      }
    } catch (augmentationError) {
      console.error("⚠️ General Chat: Query augmentation failed:", augmentationError);
      console.log(`🔄 General Chat: Falling back to original query: "${userMessage}"`);
    }

    // Use vector search to find relevant chunks from documents
    let documentContext = "";

    if (documents.length > 0) {
      console.log(`General Chat: Using vector search with optimized query "${optimizedSearchQuery}" and ${documents.length} total documents`);

      try {
        const { vectorService } = await import('./vectorService');

        // Use vector search to find relevant content from all user documents
        const vectorResults = await vectorService.searchDocuments(
          optimizedSearchQuery, // Use optimized query instead of original
          userId,
          2 // Get top 2 chunks globally as per recent optimization
        );

        if (vectorResults.length > 0) {
          documentContext = vectorResults
            .map((result) => result.document.content)
            .join("\n\n");
        } else {
          documentContext = "No relevant documents found.";
        }
      } catch (vectorError) {
        console.error("Vector search failed:", vectorError);
        documentContext = "Error retrieving relevant documents.";
      }
    } else {
      documentContext = "No documents available for general chat.";
    }

    const systemMessage = `คุณเป็น AI Assistant ที่ช่วยเหลือผู้ใช้ในการจัดการระบบเอกสาร คุณสามารถตอบคำถาม ช่วยค้นหา สรุป และช่วยจัดระเบียบเอกสาร

=== เอกสารที่เกี่ยวข้อง ===
${documentContext}

=== คำสั่งสำคัญ ===
• ใช้ข้อมูลจากเอกสารข้างต้นเป็นหลักในการตอบคำถาม
• ตอบคำถามให้ตรงประเด็นและครบถ้วนจากข้อมูลที่มี
• ตอบเป็นภาษาไทยเสมอ เว้นแต่ผู้ใช้จะสื่อสารเป็นภาษาอื่น
• ระบุแหล่งที่มาของข้อมูลเมื่อเป็นไปได้
=== เวลาปัจจุบัน ===
${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

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
    console.error("Error generating general chat response:", error);
    return "I'm experiencing some technical difficulties. Please try again later.";
  }
}