#!/usr/bin/env tsx

/**
 * Smoke Test for LangChain Agent Document Search Tool
 * 
 * This script tests that the document_search tool is properly executed by the LangChain agent.
 * 
 * Expected behavior:
 * - Tool execution is confirmed in logs
 * - intermediateSteps contains tool actions and observations
 * - Final output is non-empty and contains search results
 */

import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { documentSearch, personalHrQuery } from "../server/services/langchainTools";

async function logPackageVersions() {
  console.log("=== PACKAGE VERSIONS ===");
  
  // Try to get package versions from package.json
  try {
    const fs = await import('fs');
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const langchainPackages = {
      "@langchain/core": packageJson.dependencies["@langchain/core"],
      "@langchain/openai": packageJson.dependencies["@langchain/openai"],
      "langchain": packageJson.dependencies["langchain"],
      "zod": packageJson.dependencies["zod"]
    };
    
    console.log("LangChain package versions:");
    Object.entries(langchainPackages).forEach(([pkg, version]) => {
      console.log(`  ${pkg}: ${version}`);
    });
  } catch (error) {
    console.error("Could not read package versions:", error);
  }
  
  console.log("Node.js version:", process.version);
  console.log("=========================\n");
}

function createDocumentSearchTool(userId: string): DynamicStructuredTool {
  console.log(`Creating document_search tool for user: ${userId}`);
  
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
      console.log(`TOOL EXECUTION: document_search called with input: "${input}"`);
      
      try {
        // Ensure documentSearch is available
        if (typeof documentSearch !== 'function') {
          throw new Error('documentSearch function is not available');
        }

        const result = await documentSearch({
          query: input.trim(),
          userId: userId,
          searchType: searchType as any,
          limit: limit,
          threshold: threshold,
          specificDocumentIds: undefined
        });
        
        console.log(`TOOL RESULT: document_search returned ${result.length} characters`);
        return result;
        
      } catch (error: any) {
        const errorMessage = `Tool execution failed: ${error?.message || 'unknown error'}`;
        console.error("TOOL ERROR:", errorMessage);
        return errorMessage;
      }
    },
  });

  console.log(`Tool created with name: "${tool.name}"`);
  return tool;
}

function createPersonalHrQueryTool(): DynamicStructuredTool {
  console.log(`Creating personal_hr_query tool`);
  
  const tool = new DynamicStructuredTool({
    name: "personal_hr_query",
    description: "Query personal employee information using Thai Citizen ID. Use this tool when users ask about their personal HR information, employee details, leave days, contact information, or employment status.",
    schema: z.object({
      citizenId: z.string().describe("The Thai Citizen ID (13 digits) to look up employee information")
    }),
    func: async ({ citizenId }: { citizenId: string }): Promise<string> => {
      console.log(`TOOL EXECUTION: personal_hr_query called with citizenId: "${citizenId}"`);
      
      try {
        // Ensure personalHrQuery is available
        if (typeof personalHrQuery !== 'function') {
          throw new Error('personalHrQuery function is not available');
        }

        const result = await personalHrQuery({
          citizenId: citizenId.trim()
        });
        
        console.log(`TOOL RESULT: personal_hr_query returned ${result.length} characters`);
        return result;
        
      } catch (error: any) {
        const errorMessage = `HR tool execution failed: ${error?.message || 'unknown error'}`;
        console.error("HR TOOL ERROR:", errorMessage);
        return errorMessage;
      }
    },
  });

  console.log(`HR Tool created with name: "${tool.name}"`);
  return tool;
}

async function createAgentExecutor(userId: string): Promise<AgentExecutor> {
  console.log("Creating LangChain agent executor...");

  // Create the document search tool and personal HR query tool
  const documentSearchTool = createDocumentSearchTool(userId);
  const personalHrQueryTool = createPersonalHrQueryTool();
  const tools = [documentSearchTool, personalHrQueryTool];
  
  console.log(`Tools registered: [${tools.map(t => `"${t.name}"`).join(", ")}]`);

  // Create the chat model
  const chatModel = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0.7,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
  
  console.log(`Model configured: ${chatModel.modelName}`);

  // Create the prompt template
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are an AI assistant for a Knowledge Management System with HR capabilities. You help users find information from their document collection and access their personal HR information.

CRITICAL INSTRUCTIONS:
1. When users ask questions about documents, use the document_search tool
2. When users ask about personal HR information (employee details, leave days, contact info), use the personal_hr_query tool with their citizen ID
3. ALWAYS provide a response based on the tool results
4. Never return empty responses

Available tools:
- document_search: Search company documents and knowledge base
- personal_hr_query: Access personal employee information using Thai Citizen ID

Your response flow:
1. Identify the type of query (document search vs HR query)
2. Use the appropriate tool with relevant parameters
3. Analyze the tool results
4. Generate a comprehensive response for the user`
    ],
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  // Create the agent
  console.log("Creating OpenAI Functions Agent...");
  const agent = await createOpenAIFunctionsAgent({
    llm: chatModel,
    tools,
    prompt,
  });

  // Create the executor
  console.log("Creating Agent Executor...");
  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    returnIntermediateSteps: true,
    maxIterations: 3,
    earlyStoppingMethod: "generate",
    handleParsingErrors: true,
  });

  console.log("Agent executor created successfully\n");
  return executor;
}

async function runSmokeTest() {
  console.log("🧪 LANGCHAIN AGENT SMOKE TEST");
  console.log("============================\n");

  await logPackageVersions();

  const userId = "43981095"; // Test user ID
  const testQuery = "มีไฟล์เดอะมอลล์ไหม"; // Thai query: "Do you have The Mall files?"

  console.log(`Test user ID: ${userId}`);
  console.log(`Test query: "${testQuery}"`);
  console.log();

  try {
    // Create agent executor
    const executor = await createAgentExecutor(userId);

    // Set up callbacks to track execution
    const callbacks = [{
      handleToolStart(tool: any, input: any) { 
        console.log(`🔧 TOOL START: ${tool.name}`, JSON.stringify(input, null, 2)); 
      },
      handleToolEnd(output: any) { 
        console.log(`🔧 TOOL END: ${String(output)?.slice?.(0, 200)}...`); 
      },
      handleToolError(error: any) { 
        console.error(`🔧 TOOL ERROR:`, error); 
      },
    }];

    console.log("=== INVOKING AGENT ===");
    console.log(`Query: "${testQuery}"`);
    console.log("Waiting for agent response...\n");

    const startTime = Date.now();
    
    // Invoke the agent
    const result = await executor.invoke(
      { input: testQuery },
      { callbacks }
    );

    const duration = Date.now() - startTime;

    console.log("\n=== AGENT EXECUTION RESULTS ===");
    console.log(`Execution time: ${duration}ms`);
    console.log(`Result type: ${typeof result}`);
    console.log(`Result keys: [${Object.keys(result || {}).join(", ")}]`);
    
    // Check intermediate steps
    const intermediateSteps = result?.intermediateSteps || [];
    console.log(`\nIntermediate steps: ${intermediateSteps.length}`);
    
    if (intermediateSteps.length > 0) {
      console.log("✅ PASS: Agent executed tools (intermediateSteps not empty)");
      
      intermediateSteps.forEach((step: any, index: number) => {
        console.log(`  Step ${index + 1}:`);
        console.log(`    Action: ${step?.action?.tool || 'unknown'}`);
        console.log(`    Input: ${JSON.stringify(step?.action?.toolInput || {})}`);
        console.log(`    Observation: ${String(step?.observation)?.slice(0, 100)}...`);
      });
    } else {
      console.log("❌ FAIL: No intermediate steps found (tools were not executed)");
    }

    // Check final output
    const output = result?.output || "";
    console.log(`\nFinal output length: ${output.length} characters`);
    
    if (output && output.trim().length > 0) {
      console.log("✅ PASS: Agent produced non-empty output");
      console.log(`Output preview: ${output.substring(0, 200)}...`);
    } else {
      console.log("❌ FAIL: Agent output is empty");
    }

    // Overall assessment
    console.log("\n=== SMOKE TEST RESULTS ===");
    const toolExecuted = intermediateSteps.length > 0;
    const hasOutput = output && output.trim().length > 0;
    const documentSearchUsed = intermediateSteps.some((step: any) => 
      step?.action?.tool === "document_search"
    );

    if (toolExecuted && hasOutput && documentSearchUsed) {
      console.log("🎉 SMOKE TEST PASSED!");
      console.log("   ✅ Tools were executed");
      console.log("   ✅ document_search tool was used");
      console.log("   ✅ Agent produced meaningful output");
    } else {
      console.log("💥 SMOKE TEST FAILED!");
      console.log(`   ${toolExecuted ? '✅' : '❌'} Tools executed: ${toolExecuted}`);
      console.log(`   ${documentSearchUsed ? '✅' : '❌'} document_search used: ${documentSearchUsed}`);
      console.log(`   ${hasOutput ? '✅' : '❌'} Non-empty output: ${hasOutput}`);
    }

  } catch (error: any) {
    console.error("\n💥 SMOKE TEST ERROR:");
    console.error("Error type:", error?.constructor?.name || 'Unknown');
    console.error("Error message:", error?.message || 'No message');
    console.error("Stack trace:", error?.stack);
  }
}

// Execute the smoke test
runSmokeTest()
  .then(() => {
    console.log("\n🏁 Smoke test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Smoke test failed with unhandled error:", error);
    process.exit(1);
  });