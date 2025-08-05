import OpenAI from "openai";
import mammoth from "mammoth";
import XLSX from "xlsx";
import textract from "textract";
import { LlamaParseReader } from "@llamaindex/cloud";

// Import LangChain components for agent and tools
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicTool } from "@langchain/core/tools";
import { documentSearch } from "./langchainTools";

// Import local Document type
import type { Document } from "../storage"; // Assuming Document type is exported from ../storage

// Initialize OpenAI client for legacy features or other OpenAI API calls
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || (() => {
    console.error("OPENAI_API_KEY not found in environment variables");
    throw new Error("OpenAI API key is required");
  })(),
});

// Initialize LangChain ChatOpenAI model for tool binding
const chatModel = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
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
          // Ensure UTF-8 encoding for the extracted content
          content = Buffer.from(extractedText, 'utf8').toString('utf8');
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

  // Get current date and time in Thai format
  const now = new Date();
  now.setHours(now.getHours() + 7)
  const thaiDate = now.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
  const thaiTime = now.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

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

Format your response in a clear, conversational way that helps the user understand how to get the information they need from their database.

Current date: ${thaiDate}
Current time: ${thaiTime}`;

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

// Create document search tool for LangChain
function createDocumentSearchTool(userId: string) {
  return new DynamicTool({
    name: "document_search",
    description: `Search through documents in the knowledge management system. Use this tool when users ask questions about documents, need information from their knowledge base, or want to find specific content.

    Parameters:
    - input: The search query string to find relevant documents

    Returns: Array of search results with document content, names, and similarity scores`,
    func: async (input: string) => {
      try {
        console.log(`🔍 [Tool Start] Document search tool called with input: "${input}"`);
        
        // Parse input - it might be JSON or just a string
        let query: string;
        let searchType = 'smart_hybrid';
        let limit = 10;
        let threshold = 0.3;

        try {
          const params = JSON.parse(input);
          query = params.input || params.query || input;
          searchType = params.searchType || 'smart_hybrid';
          limit = params.limit || 10;
          threshold = params.threshold || 0.3;
        } catch {
          // If parsing fails, treat the entire input as the query
          query = input;
        }

        console.log(`🔍 [Tool] Parsed query: "${query}", searchType: ${searchType}`);

        const results = await documentSearch({
          query: query,
          userId: userId,
          searchType: searchType,
          limit: limit,
          threshold: threshold
        });

        console.log(`📄 [Tool] Document search completed. Found ${results?.length || 0} results`);

        if (!results || results.length === 0) {
          const noResultsMessage = `No documents found matching "${query}". You may need to upload relevant documents or try different search terms like synonyms or related keywords.`;
          console.log(`📄 [Tool] Returning no results message: ${noResultsMessage}`);
          return noResultsMessage;
        }

        // Format results for better AI understanding
        const formattedResults = results.map((result, index) => ({
          rank: index + 1,
          document_name: result.name,
          similarity_score: result.similarity.toFixed(3),
          content_preview: result.content.substring(0, 800) + (result.content.length > 800 ? '...' : ''),
          document_summary: result.summary || 'No summary available',
          category: result.aiCategory || 'Uncategorized',
          created_date: result.createdAt
        }));

        const responseText = `Found ${results.length} relevant documents for "${query}":\n\n${JSON.stringify(formattedResults, null, 2)}`;
        console.log(`📄 [Tool] Returning formatted results (${responseText.length} chars)`);
        
        return responseText;
      } catch (error) {
        console.error("🚨 [Tool Error] Document search tool failed:", error);
        console.error("🚨 [Tool Error] Stack trace:", error.stack);
        const errorMessage = `Error searching documents for "${input}": ${error.message}. Please try a different search query.`;
        console.log(`🚨 [Tool] Returning error message: ${errorMessage}`);
        return errorMessage;
      }
    },
  });
}

// Create agent with tools
async function createAgentWithTools(userId: string) {
  const tools = [createDocumentSearchTool(userId)];

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are an AI assistant for a Knowledge Management System. You help users find information from their document collection and answer questions based on the available knowledge base.

When users ask questions that might be answered by documents in their knowledge base, use the document_search tool to find relevant information. Always search with appropriate keywords and provide helpful, accurate responses based on the found documents.

If you find relevant documents, cite them in your response and provide specific information from the content. If no relevant documents are found, let the user know and suggest they might need to upload relevant documents or refine their search.

Be helpful, accurate, and always prioritize information from the user's actual documents over general knowledge.`
    ],
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const agent = await createOpenAIFunctionsAgent({
    llm: chatModel,
    tools,
    prompt,
  });

  return new AgentExecutor({
    agent,
    tools,
    verbose: true,
  });
}

export async function generateChatResponse(userMessage: string, documents: Document[], userId?: string): Promise<string> {
  try {
    // If userId is provided, use LangChain agent with tools
    if (userId) {
      console.log(`🤖 Using LangChain agent with tools for user ${userId}`);
      const agentExecutor = await createAgentWithTools(userId);

      const result = await agentExecutor.invoke({
        input: userMessage,
      });

      return result.output || "I couldn't generate a response. Please try again.";
    }

    // Fallback to traditional approach if no userId
    console.log("🔄 Using traditional chat approach (no tools)");

    // Create context from documents
    const context = documents
      .slice(0, 10) // Limit to first 10 documents to avoid token limits
      .map(doc => `Document: ${doc.name}\nContent: ${doc.content || doc.summary || 'No content available'}\n`)
      .join('\n---\n');

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant helping users with their knowledge management system. Use the provided document context to answer questions accurately. If the information isn't in the provided documents, say so clearly.

Available documents context:
${context}

Always be helpful and provide specific references to the documents when answering questions.`
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || "I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error("Error generating chat response:", error);
    throw new Error("Failed to generate response");
  }
}