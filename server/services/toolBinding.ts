
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { DynamicTool } from "@langchain/core/tools";
import { llmRouter } from "./llmRouter";
import { db } from "../db";
import { documents } from "@shared/schema";
import { eq } from "drizzle-orm";

// Define available tools
const createSearchDocumentsTool = (userId: string) => {
  return new DynamicTool({
    name: "search_documents",
    description: "Search through user's documents for relevant information",
    func: async (query: string) => {
      try {
        const { searchSmartHybridDebug } = await import('./newSearch');
        const results = await searchSmartHybridDebug(query, userId, {
          limit: 5
        });
        
        return JSON.stringify(results.map(r => ({
          name: r.name,
          content: r.content.substring(0, 500),
          similarity: r.similarity
        })));
      } catch (error) {
        return `Error searching documents: ${error.message}`;
      }
    }
  });
};

const createGetDocumentTool = (userId: string) => {
  return new DynamicTool({
    name: "get_document",
    description: "Get full content of a specific document by ID",
    func: async (documentId: string) => {
      try {
        const [doc] = await db
          .select()
          .from(documents)
          .where(eq(documents.id, parseInt(documentId)));
        
        if (!doc) {
          return "Document not found";
        }
        
        return JSON.stringify({
          name: doc.name,
          content: doc.content,
          summary: doc.summary,
          category: doc.category
        });
      } catch (error) {
        return `Error getting document: ${error.message}`;
      }
    }
  });
};

const createCalculatorTool = () => {
  return new DynamicTool({
    name: "calculator",
    description: "Perform mathematical calculations",
    func: async (expression: string) => {
      try {
        // Safe eval for basic math
        const result = Function(`"use strict"; return (${expression})`)();
        return `Result: ${result}`;
      } catch (error) {
        return `Invalid mathematical expression: ${expression}`;
      }
    }
  });
};

export class ToolBindingService {
  private tools: DynamicTool[] = [];

  constructor(private userId: string) {
    this.initializeTools();
  }

  private initializeTools() {
    this.tools = [
      createSearchDocumentsTool(this.userId),
      createGetDocumentTool(this.userId),
      createCalculatorTool()
    ];
  }

  async chatWithTools(messages: any[], options?: { streaming?: boolean }): Promise<string> {
    try {
      await llmRouter.loadUserConfig(this.userId);
      const config = llmRouter.getCurrentConfig();
      
      let chatModel;
      
      if (config?.provider === "OpenAI") {
        chatModel = new ChatOpenAI({
          model: config.openAIConfig?.model || "gpt-4o",
          temperature: config.openAIConfig?.temperature || 0.7,
          openAIApiKey: process.env.OPENAI_API_KEY,
        });
      } else {
        chatModel = new ChatGoogleGenerativeAI({
          model: config?.geminiConfig?.model || "gemini-2.5-flash",
          temperature: config?.geminiConfig?.temperature || 0.7,
          apiKey: process.env.GEMINI_API_KEY,
        });
      }

      // Bind tools to the model
      const modelWithTools = chatModel.bindTools(this.tools);
      
      // Invoke with tools
      const response = await modelWithTools.invoke(messages);
      
      // Handle tool calls if present
      if (response.tool_calls && response.tool_calls.length > 0) {
        const toolResponses = [];
        
        for (const toolCall of response.tool_calls) {
          const tool = this.tools.find(t => t.name === toolCall.name);
          if (tool) {
            const toolResult = await tool.func(JSON.stringify(toolCall.args));
            toolResponses.push(`${toolCall.name}: ${toolResult}`);
          }
        }
        
        // Return combined response
        return `${response.content}\n\nTool Results:\n${toolResponses.join('\n')}`;
      }
      
      return response.content as string;
    } catch (error) {
      console.error("Tool binding error:", error);
      throw error;
    }
  }

  addCustomTool(tool: DynamicTool) {
    this.tools.push(tool);
  }

  getAvailableTools(): string[] {
    return this.tools.map(tool => `${tool.name}: ${tool.description}`);
  }
}
