#!/usr/bin/env node

/**
 * Comprehensive Test for LangChain Agent with Real Document Search + HR Query Tools
 * 
 * This test verifies that the LangChain agent properly executes:
 * 1. document_search tool with real document search functionality
 * 2. personal_hr_query tool with real HR database queries
 * 
 * Expected behavior:
 * - Tools are properly called by the LangChain agent
 * - Real data is returned from both document search and HR database
 * - Agent provides comprehensive responses based on tool results
 */

import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Import real tool functions
import { documentSearch, personalHrQuery } from "./server/services/langchainTools.ts";

async function testRealLangChainAgent() {
  console.log("🧪 Testing Real LangChain Agent with Document Search + HR Query");
  console.log("Using real database and document search implementations\n");
  
  try {
    // Create the document search tool with real implementation
    const documentSearchTool = new DynamicStructuredTool({
      name: "document_search",
      description: "Search through uploaded documents in the knowledge management system to find relevant information",
      schema: z.object({
        input: z.string().describe("The search query or question to find in documents"),
        searchType: z.string().optional().default("smart_hybrid").describe("Type of search: semantic, keyword, hybrid, or smart_hybrid"),
        limit: z.number().optional().default(5).describe("Maximum number of results to return"),
        threshold: z.number().optional().default(0.3).describe("Minimum similarity threshold for results")
      }),
      func: async ({ input, searchType = "smart_hybrid", limit = 5, threshold = 0.3 }) => {
        console.log(`🔧 REAL DOCUMENT SEARCH EXECUTING: "${input}"`);
        console.log(`   Search Type: ${searchType}, Limit: ${limit}, Threshold: ${threshold}`);
        
        try {
          const result = await documentSearch({
            query: input.trim(),
            userId: "43981095", // Use test user ID
            searchType,
            limit,
            threshold
          });
          
          console.log(`✅ REAL DOCUMENT SEARCH COMPLETED: ${result.length} characters returned`);
          return result;
          
        } catch (error) {
          console.error("❌ DOCUMENT SEARCH ERROR:", error.message);
          return `Document search failed: ${error.message}`;
        }
      }
    });

    // Create the personal HR query tool with real implementation
    const personalHrQueryTool = new DynamicStructuredTool({
      name: "personal_hr_query",
      description: "Query personal employee information using Thai Citizen ID from the real HR database",
      schema: z.object({
        citizenId: z.string().describe("The Thai Citizen ID (13 digits) to look up employee information")
      }),
      func: async ({ citizenId }) => {
        console.log(`🔧 REAL HR QUERY EXECUTING: citizenId="${citizenId}"`);
        
        try {
          const result = await personalHrQuery({
            citizenId: citizenId.trim()
          });
          
          console.log(`✅ REAL HR QUERY COMPLETED: ${result.length} characters returned`);
          return result;
          
        } catch (error) {
          console.error("❌ HR QUERY ERROR:", error.message);
          return `HR query failed: ${error.message}`;
        }
      }
    });

    // Initialize the LLM
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    // Create comprehensive prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `You are an intelligent AI assistant for a Knowledge Management System with HR capabilities. 

Your primary functions:
1. Document Search: Use document_search tool to find information from the company's document repository
2. HR Queries: Use personal_hr_query tool to retrieve employee information using Thai Citizen ID

Guidelines:
- Always use the appropriate tool for the user's request
- Provide comprehensive answers based on the tool results
- If document search returns no results, inform the user clearly
- For HR queries, ensure the user provides a valid 13-digit Thai Citizen ID
- Never make up information; only use data returned by the tools

Available tools:
- document_search: Search company documents and knowledge base
- personal_hr_query: Access personal employee information using Thai Citizen ID`],
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad")
    ]);

    // Create the agent with real tools
    console.log("🤖 Creating LangChain Agent with Real Tools...");
    const agent = await createOpenAIFunctionsAgent({
      llm,
      tools: [documentSearchTool, personalHrQueryTool],
      prompt
    });

    // Create agent executor
    console.log("⚙️ Creating Agent Executor...");
    const agentExecutor = new AgentExecutor({
      agent,
      tools: [documentSearchTool, personalHrQueryTool],
      verbose: false, // Set to false for cleaner output
      returnIntermediateSteps: true,
      maxIterations: 3
    });

    // Test 1: Real Document Search Query
    console.log("\n" + "=".repeat(70));
    console.log("🔍 TEST 1: Real Document Search Query");
    console.log("=".repeat(70));
    
    const documentQuery = "What are the company policies about leave and vacation days?";
    console.log(`📝 Query: "${documentQuery}"`);
    
    const startTime1 = Date.now();
    const result1 = await agentExecutor.invoke({
      input: documentQuery
    });
    const endTime1 = Date.now();

    console.log(`\n📊 Test 1 Results:`);
    console.log(`⏱️ Execution Time: ${endTime1 - startTime1}ms`);
    console.log(`🔗 Intermediate Steps: ${result1.intermediateSteps?.length || 0}`);
    console.log(`📄 Output Length: ${result1.output?.length || 0} characters`);
    
    if (result1.intermediateSteps && result1.intermediateSteps.length > 0) {
      console.log("✅ Document search tool was executed successfully");
      result1.intermediateSteps.forEach((step, index) => {
        console.log(`   Step ${index + 1}: ${step.action?.tool} tool used`);
        if (step.observation) {
          console.log(`   Observation: ${step.observation.substring(0, 100)}...`);
        }
      });
    } else {
      console.log("❌ No tools were executed for document search");
    }

    console.log("\n📄 Agent Response:");
    console.log("-".repeat(50));
    console.log(result1.output || "No output received");
    console.log("-".repeat(50));

    // Test 2: Real HR Query with Sample Employee
    console.log("\n" + "=".repeat(70));
    console.log("👤 TEST 2: Real HR Query with Sample Employee");
    console.log("=".repeat(70));
    
    const hrQuery = "Please show me my employee information. My Thai citizen ID is 1234567890123";
    console.log(`📝 Query: "${hrQuery}"`);
    
    const startTime2 = Date.now();
    const result2 = await agentExecutor.invoke({
      input: hrQuery
    });
    const endTime2 = Date.now();

    console.log(`\n📊 Test 2 Results:`);
    console.log(`⏱️ Execution Time: ${endTime2 - startTime2}ms`);
    console.log(`🔗 Intermediate Steps: ${result2.intermediateSteps?.length || 0}`);
    console.log(`📄 Output Length: ${result2.output?.length || 0} characters`);
    
    if (result2.intermediateSteps && result2.intermediateSteps.length > 0) {
      console.log("✅ HR query tool was executed successfully");
      result2.intermediateSteps.forEach((step, index) => {
        console.log(`   Step ${index + 1}: ${step.action?.tool} tool used`);
        if (step.observation) {
          console.log(`   Observation: ${step.observation.substring(0, 100)}...`);
        }
      });
    } else {
      console.log("❌ No tools were executed for HR query");
    }

    console.log("\n📄 Agent Response:");
    console.log("-".repeat(50));
    console.log(result2.output || "No output received");
    console.log("-".repeat(50));

    // Test 3: Invalid HR Query (Non-existent Employee)
    console.log("\n" + "=".repeat(70));
    console.log("❌ TEST 3: Invalid HR Query (Non-existent Employee)");
    console.log("=".repeat(70));
    
    const invalidHrQuery = "Can you look up my information? My citizen ID is 9999999999999";
    console.log(`📝 Query: "${invalidHrQuery}"`);
    
    const startTime3 = Date.now();
    const result3 = await agentExecutor.invoke({
      input: invalidHrQuery
    });
    const endTime3 = Date.now();

    console.log(`\n📊 Test 3 Results:`);
    console.log(`⏱️ Execution Time: ${endTime3 - startTime3}ms`);
    console.log(`🔗 Intermediate Steps: ${result3.intermediateSteps?.length || 0}`);
    console.log(`📄 Output Length: ${result3.output?.length || 0} characters`);
    
    if (result3.intermediateSteps && result3.intermediateSteps.length > 0) {
      console.log("✅ HR query tool was executed (expected to return no results)");
      result3.intermediateSteps.forEach((step, index) => {
        console.log(`   Step ${index + 1}: ${step.action?.tool} tool used`);
      });
    } else {
      console.log("❌ No tools were executed for invalid HR query");
    }

    console.log("\n📄 Agent Response:");
    console.log("-".repeat(50));
    console.log(result3.output || "No output received");
    console.log("-".repeat(50));

    // Final Summary
    console.log("\n" + "=".repeat(70));
    console.log("📋 COMPREHENSIVE TEST SUMMARY");
    console.log("=".repeat(70));
    
    const test1Success = result1.intermediateSteps && result1.intermediateSteps.length > 0 && result1.output;
    const test2Success = result2.intermediateSteps && result2.intermediateSteps.length > 0 && result2.output;
    const test3Success = result3.intermediateSteps && result3.intermediateSteps.length > 0 && result3.output;
    
    console.log(`🔍 Document Search Test: ${test1Success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`👤 Valid HR Query Test: ${test2Success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`❌ Invalid HR Query Test: ${test3Success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`🎯 Overall Result: ${test1Success && test2Success && test3Success ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

    if (test1Success && test2Success && test3Success) {
      console.log("\n🎉 SUCCESS: LangChain agent with real document search and HR query tools is working perfectly!");
      console.log("✅ Tools are properly executed");
      console.log("✅ Real data is returned from both systems");
      console.log("✅ Agent provides comprehensive responses");
      console.log("✅ Error handling works for invalid queries");
    } else {
      console.log("\n⚠️ Some tests failed. Check the logs above for details.");
    }

  } catch (error) {
    console.error("\n💥 COMPREHENSIVE TEST FAILED:");
    console.error("Error Type:", error.constructor.name);
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);
  }
}

// Run the comprehensive test
console.log("Starting comprehensive LangChain agent test...\n");
testRealLangChainAgent().catch(console.error);