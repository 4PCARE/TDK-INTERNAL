import OpenAI from "openai";
import mammoth from "mammoth";
import XLSX from "xlsx";
import textract from "textract";
import { LlamaParseReader } from "@llamaindex/cloud";
import fs from 'fs'; // Make sure fs is imported

// Import LangChain components for agent and tools (v0.2+ format)
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { documentSearch, personalHrQuery } from "./langchainTools";

// Import storage and types
import { storage } from "../storage";

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
  console.log(`🛠️ [Tool Creation] Creating document_search tool for user: ${userId}`);
  const tool = new DynamicStructuredTool({
    name: "document_search",
    description: "Search through documents in the knowledge management system. Use this tool when users ask questions about documents, need information from their knowledge base, or want to find specific content.",
    schema: z.object({
      input: z.string().describe("The search query string to find relevant documents"),
      searchType: z.string().optional().describe("Type of search: semantic, keyword, hybrid, or smart_hybrid"),
      limit: z.number().int().optional().describe("Maximum number of results to return"),
      threshold: z.number().optional().describe("Minimum similarity threshold for results")
    }),
    func: async ({ input, searchType = "smart_hybrid", limit = 5, threshold = 0.3 }: { 
      input: string; 
      searchType?: string; 
      limit?: number; 
      threshold?: number; 
    }): Promise<string> => {
      const toolStartTime = Date.now();
      console.log(`🔍 [Tool Entry] === DOCUMENT SEARCH TOOL CALLED ===`);
      console.log(`🔍 [Tool Entry] Timestamp: ${new Date().toISOString()}`);
      console.log(`🔍 [Tool Entry] Raw input type: ${typeof input}`);
      console.log(`🔍 [Tool Entry] Raw input value:`, input);
      console.log(`🔍 [Tool Entry] User ID: ${userId}`);

      try {
        // With DynamicStructuredTool, parameters are already validated and typed
        console.log(`🔍 [Tool Parsing] === PARSED PARAMETERS ===`);
        console.log(`🔍 [Tool Parsing] Query: "${input}"`);
        console.log(`🔍 [Tool Parsing] SearchType: ${searchType}`);
        console.log(`🔍 [Tool Parsing] Limit: ${limit}`);
        console.log(`🔍 [Tool Parsing] Threshold: ${threshold}`);
        console.log(`🔍 [Tool Parsing] User ID: ${userId}`);

        if (!input || input.trim().length === 0) {
          const emptyQueryMessage = "Please provide a search query to find documents.";
          console.log(`🔍 [Tool Return] Empty query detected: ${emptyQueryMessage}`);
          return emptyQueryMessage;
        }

        // Call the document search function - it now returns a string directly
        console.log(`🔍 [Tool Calling] === CALLING documentSearch FUNCTION ===`);
        console.log(`🔍 [Tool Calling] About to call documentSearch with parameters:`);
        console.log(`🔍 [Tool Calling] - query: "${input.trim()}"`);
        console.log(`🔍 [Tool Calling] - userId: ${userId}`);
        console.log(`🔍 [Tool Calling] - searchType: ${searchType}`);
        console.log(`🔍 [Tool Calling] - limit: ${limit}`);
        console.log(`🔍 [Tool Calling] - threshold: ${threshold}`);
        console.log(`🔍 [Tool Calling] - specificDocumentIds: undefined (not provided by LLM)`);

        const searchStartTime = Date.now();
        
        // Ensure documentSearch is available and callable
        if (typeof documentSearch !== 'function') {
          throw new Error('documentSearch function is not available or not a function');
        }

        let responseText: string;
        try {
          responseText = await documentSearch({
            query: input.trim(),
            userId: userId,
            searchType: searchType as any,
            limit: limit,
            threshold: threshold,
            specificDocumentIds: undefined
          });
          console.log(`🔍 [Tool Calling] documentSearch executed successfully`);
        } catch (searchError: any) {
          console.error(`🚨 [Tool Error] documentSearch function failed:`, searchError);
          throw new Error(`Document search failed: ${searchError?.message || 'unknown error'}`);
        }
        
        const searchDuration = Date.now() - searchStartTime;

        // Ensure we always have a string response
        if (typeof responseText !== 'string') {
          console.warn(`🚨 [Tool Warning] documentSearch returned non-string:`, typeof responseText);
          responseText = String(responseText || "No results found");
        }

        if (!responseText || responseText.trim().length === 0) {
          responseText = "No documents found matching your search criteria.";
        }

        const functionCallDuration = Date.now() - searchStartTime;

        console.log(`📄 [Tool Results] === DOCUMENT SEARCH COMPLETED ===`);
        console.log(`📄 [Tool Results] Function call duration: ${functionCallDuration}ms`);
        console.log(`📄 [Tool Results] Response type: ${typeof responseText}`);
        console.log(`📄 [Tool Results] Response length: ${responseText?.length || 0} characters`);
        console.log(`📄 [Tool Results] Response preview: ${responseText?.substring(0, 100)}...`);

        const totalToolDuration = Date.now() - toolStartTime;
        console.log(`📄 [Tool Return] === RETURNING RESPONSE ===`);
        console.log(`📄 [Tool Return] Total tool execution time: ${totalToolDuration}ms`);
        console.log(`📄 [Tool Return] Final response text: "${responseText}"`);
        console.log(`🔍 [Tool Entry] === DOCUMENT SEARCH TOOL COMPLETED (SUCCESS) ===`);

        return responseText;

      } catch (error: any) {
        const totalToolDuration = Date.now() - toolStartTime;
        console.error("🚨 [Tool Error] === DOCUMENT SEARCH TOOL ERROR ===");
        console.error("🚨 [Tool Error] Total execution time before error:", totalToolDuration + "ms");
        console.error("🚨 [Tool Error] Error type:", error?.constructor?.name || 'Unknown');
        console.error("🚨 [Tool Error] Error message:", error?.message || 'No message');
        console.error("🚨 [Tool Error] Full error object:", error);
        console.error("🚨 [Tool Error] Stack trace:", error?.stack);

        // Always return a proper error message string
        const errorMessage = `I encountered an error while searching your documents: ${error?.message || 'unknown error occurred'}. Please try rephrasing your search query.`;
        console.log(`🚨 [Tool Return] Returning error message: ${errorMessage}`);
        console.log(`🔍 [Tool Entry] === DOCUMENT SEARCH TOOL COMPLETED (ERROR) ===`);

        // Make sure we return a string, never throw
        return errorMessage;
      }
    },
  });

  console.log(`🛠️ [Tool Creation] Document search tool created successfully for user: ${userId}`);
  console.log(`🛠️ [Tool Creation] Tool name: ${tool.name}`);
  console.log(`🛠️ [Tool Creation] Tool description length: ${tool.description.length} characters`);

  return tool;
}

// Create personal HR query tool for LangChain
function createPersonalHrQueryTool() {
  console.log(`🛠️ [Tool Creation] Creating personal_hr_query tool`);
  const tool = new DynamicStructuredTool({
    name: "personal_hr_query",
    description: "Query personal employee information using Thai Citizen ID. Use this tool when users ask about their personal HR information, employee details, leave days (วันลา), vacation days, contact information, employment status, or any personal work-related data. This tool works with Thai language queries about วันลา, ข้อมูลพนักงาน, รายละเอียดการทำงาน, วันหยุด, and similar HR-related questions.",
    schema: z.object({
      citizenId: z.string().describe("The Thai Citizen ID (13 digits) to look up employee information")
    }),
    func: async ({ citizenId }: { citizenId: string }): Promise<string> => {
      const toolStartTime = Date.now();
      console.log(`👤 [HR Tool Entry] === PERSONAL HR QUERY TOOL CALLED ===`);
      console.log(`👤 [HR Tool Entry] Timestamp: ${new Date().toISOString()}`);
      console.log(`👤 [HR Tool Entry] Citizen ID: "${citizenId}"`);

      try {
        // Ensure personalHrQuery is available and callable
        if (typeof personalHrQuery !== 'function') {
          throw new Error('personalHrQuery function is not available or not a function');
        }

        console.log(`👤 [HR Tool Calling] === CALLING personalHrQuery FUNCTION ===`);
        const searchStartTime = Date.now();
        
        const result = await personalHrQuery({
          citizenId: citizenId.trim()
        });
        
        const searchDuration = Date.now() - searchStartTime;
        console.log(`👤 [HR Tool Results] personalHrQuery completed in ${searchDuration}ms`);
        console.log(`👤 [HR Tool Results] Response length: ${result.length} characters`);
        
        const totalToolDuration = Date.now() - toolStartTime;
        console.log(`👤 [HR Tool Return] === RETURNING HR RESPONSE ===`);
        console.log(`👤 [HR Tool Return] Total tool execution time: ${totalToolDuration}ms`);
        console.log(`👤 [HR Tool Entry] === PERSONAL HR QUERY TOOL COMPLETED (SUCCESS) ===`);

        return result;
        
      } catch (error: any) {
        const totalToolDuration = Date.now() - toolStartTime;
        console.error("🚨 [HR Tool Error] === PERSONAL HR QUERY TOOL ERROR ===");
        console.error("🚨 [HR Tool Error] Total execution time before error:", totalToolDuration + "ms");
        console.error("🚨 [HR Tool Error] Error type:", error?.constructor?.name || 'Unknown');
        console.error("🚨 [HR Tool Error] Error message:", error?.message || 'No message');
        console.error("🚨 [HR Tool Error] Full error object:", error);

        // Always return a proper error message string
        const errorMessage = `I encountered an error while looking up your HR information: ${error?.message || 'unknown error occurred'}. Please verify your Thai Citizen ID or contact HR support.`;
        console.log(`🚨 [HR Tool Return] Returning error message: ${errorMessage}`);
        console.log(`👤 [HR Tool Entry] === PERSONAL HR QUERY TOOL COMPLETED (ERROR) ===`);

        return errorMessage;
      }
    },
  });

  console.log(`🛠️ [Tool Creation] Personal HR query tool created successfully`);
  console.log(`🛠️ [Tool Creation] Tool name: ${tool.name}`);
  console.log(`🛠️ [Tool Creation] Tool description length: ${tool.description.length} characters`);

  return tool;
}

// Create agent with tools
async function createAgentWithTools(userId: string) {
  console.log(`🤖 [Agent Setup] Creating agent with tools for user: ${userId}`);

  const documentSearchTool = createDocumentSearchTool(userId);
  const personalHrQueryTool = createPersonalHrQueryTool();
  const tools = [documentSearchTool, personalHrQueryTool];

  console.log(`🤖 [Agent Setup] Tools created:`, tools.map(tool => ({
    name: tool.name,
    description: tool.description.substring(0, 100) + '...'
  })));

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are an AI assistant for a Knowledge Management System with HR capabilities. You help users find information from their document collection and access their personal HR information.

CRITICAL INSTRUCTIONS:
1. For document-related questions: Use the document_search tool to find information from the knowledge base
2. For personal HR queries (employee information, leave days, vacation, contact details): Use the personal_hr_query tool with the user's Thai Citizen ID
3. ALWAYS provide a response based on the tool results - NEVER return empty responses
4. Handle both Thai and English language queries

TOOL SELECTION GUIDELINES:
- Use document_search for: company policies, procedures, general information, documents
- Use personal_hr_query for: วันลา (leave days), ข้อมูลพนักงาน (employee information), วันหยุด (vacation), personal work details, employment status

Available tools:
- document_search: Search company documents and knowledge base
- personal_hr_query: Access personal employee information using Thai Citizen ID

Your response flow:
1. Identify the type of query (document search vs HR query)
2. Use the appropriate tool with relevant parameters
3. Analyze the tool results
4. Generate a comprehensive response for the user

Be helpful, accurate, and always prioritize information from the actual tools over general knowledge. For HR queries, you may need to ask for the user's Thai Citizen ID if not provided.`
    ],
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  console.log(`🤖 [Agent Setup] Creating OpenAI Functions Agent...`);
  const agent = await createOpenAIFunctionsAgent({
    llm: chatModel,
    tools,
    prompt,
  });

  console.log(`🤖 [Agent Setup] Creating Agent Executor...`);
  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    returnIntermediateSteps: true,
    maxIterations: 3, // Reduced back to reasonable number
    earlyStoppingMethod: "generate", // Changed back to generate for better responses
    handleParsingErrors: true,
  });

  console.log(`🤖 [Agent Setup] Agent executor created successfully`);
  console.log(`🤖 [Agent Setup] Executor configuration:`, {
    verbose: true,
    returnIntermediateSteps: true,
    maxIterations: 5,
    earlyStoppingMethod: "force",
    handleParsingErrors: true
  });
  return executor;
}

async function logLangChainVersions() {
  try {
    const fs = await import('fs');
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    console.log(`🤖 [Agent Setup] === LANGCHAIN PACKAGE VERSIONS ===`);
    console.log(`🤖 [Agent Setup] @langchain/core: ${packageJson.dependencies["@langchain/core"]}`);
    console.log(`🤖 [Agent Setup] @langchain/openai: ${packageJson.dependencies["@langchain/openai"]}`);
    console.log(`🤖 [Agent Setup] langchain: ${packageJson.dependencies["langchain"]}`);
    console.log(`🤖 [Agent Setup] zod: ${packageJson.dependencies["zod"]}`);
    console.log(`🤖 [Agent Setup] Model: ${chatModel.modelName}`);
    console.log(`🤖 [Agent Setup] === END VERSION INFO ===`);
  } catch (error) {
    console.log(`🤖 [Agent Setup] Could not read package versions:`, error);
  }
}

export async function generateChatResponse(userMessage: string, documents: any[], userId?: string): Promise<string> {
  try {
    // If userId is provided, use LangChain agent with tools
    if (userId) {
      console.log(`🤖 [Agent Chat] === STARTING LANGCHAIN AGENT FLOW ===`);
      console.log(`🤖 [Agent Chat] User ID: ${userId}`);
      console.log(`🤖 [Agent Chat] User message: "${userMessage}"`);
      console.log(`🤖 [Agent Chat] Timestamp: ${new Date().toISOString()}`);

      // Log package versions for debugging
      await logLangChainVersions();

      const agentExecutor = await createAgentWithTools(userId);
      console.log(`🤖 [Agent Chat] Agent executor created successfully`);

      console.log(`🤖 [Agent Chat] === INVOKING AGENT EXECUTOR ===`);
      const invokeStartTime = Date.now();

      // Add comprehensive callbacks to track tool execution
      const callbacks = [{
        handleToolStart(tool: any, input: any) { 
          console.log(`🔧 [CALLBACK] TOOL START: ${tool.name}`, input); 
        },
        handleToolEnd(output: any, runId: any) { 
          console.log(`🔧 [CALLBACK] TOOL END: ${String(output)?.slice?.(0, 200)}...`); 
        },
        handleToolError(error: any, runId: any) { 
          console.error(`🔧 [CALLBACK] TOOL ERROR:`, error); 
        },
        handleAgentAction(action: any) {
          console.log(`🔧 [CALLBACK] AGENT ACTION:`, action.tool, action.toolInput);
        },
        handleAgentEnd(action: any) {
          console.log(`🔧 [CALLBACK] AGENT END:`, action);
        }
      }];

      const result = await agentExecutor.invoke(
        { input: userMessage },
        { callbacks }
      );

      const invokeDuration = Date.now() - invokeStartTime;
      console.log(`🤖 [Agent Chat] === AGENT EXECUTOR COMPLETED ===`);
      console.log(`🤖 [Agent Chat] Execution time: ${invokeDuration}ms`);
      console.log(`🤖 [Agent Chat] Result object:`, {
        type: typeof result,
        keys: Object.keys(result || {}),
        output: result?.output,
        outputType: typeof result?.output,
        outputLength: result?.output?.length || 0,
        hasIntermediateSteps: !!result?.intermediateSteps,
        intermediateStepsLength: result?.intermediateSteps?.length || 0
      });

      if (result?.intermediateSteps && result.intermediateSteps.length > 0) {
        console.log(`🤖 [Agent Chat] === INTERMEDIATE STEPS DEBUG ===`);
        result.intermediateSteps.forEach((step: any, index: number) => {
          console.log(`🤖 [Agent Chat] Step ${index + 1}:`, {
            action: step?.action,
            observation: step?.observation?.substring(0, 200) + '...'
          });
        });
      }

      const finalOutput = result.output || "I couldn't generate a response. Please try again.";
      console.log(`🤖 [Agent Chat] === FINAL OUTPUT ===`);
      console.log(`🤖 [Agent Chat] Final output: "${finalOutput}"`);
      console.log(`🤖 [Agent Chat] Output length: ${finalOutput.length} characters`);

      return finalOutput;
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