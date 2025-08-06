#!/usr/bin/env node

/**
 * Test LangChain Agent with Both Tools - Final Verification
 * 
 * This test verifies the LangChain agent properly uses both:
 * 1. document_search tool for document queries
 * 2. personal_hr_query tool for HR queries (especially Thai language)
 */

import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Import the actual tool functions
import { documentSearch, personalHrQuery } from "./server/services/langchainTools.ts";

async function testFinalLangChainAgent() {
  console.log("🧪 Final Test: LangChain Agent with Enhanced Tool Selection");
  console.log("Testing Thai language HR query and tool binding\n");
  
  try {
    // Create document search tool
    const documentSearchTool = new DynamicStructuredTool({
      name: "document_search",
      description: "Search through uploaded documents in the knowledge management system to find relevant information",
      schema: z.object({
        input: z.string().describe("The search query or question to find in documents"),
        searchType: z.string().optional().default("smart_hybrid").describe("Type of search"),
        limit: z.number().optional().default(5).describe("Maximum number of results"),
        threshold: z.number().optional().default(0.3).describe("Minimum similarity threshold")
      }),
      func: async ({ input, searchType = "smart_hybrid", limit = 5, threshold = 0.3 }) => {
        console.log(`🔧 DOCUMENT SEARCH: "${input}"`);
        
        try {
          const result = await documentSearch({
            query: input.trim(),
            userId: "43981095",
            searchType,
            limit,
            threshold
          });
          
          console.log(`✅ DOCUMENT SEARCH SUCCESS: ${result.length} characters`);
          return result;
          
        } catch (error) {
          console.error("❌ DOCUMENT SEARCH ERROR:", error.message);
          return `Document search failed: ${error.message}`;
        }
      }
    });

    // Create personal HR query tool with comprehensive Thai language support
    const personalHrQueryTool = new DynamicStructuredTool({
      name: "personal_hr_query",
      description: "Query personal employee information using Thai Citizen ID. Use this tool for HR-related questions including: leave days (วันลา), vacation days (วันหยุด), employee information (ข้อมูลพนักงาน), work details (รายละเอียดการทำงาน), employment status, contact information, and personal work-related data. This tool handles Thai language queries about วันลา, ข้อมูลส่วนตัว, การลา, วันหยุดพักผ่อน, and similar HR topics.",
      schema: z.object({
        citizenId: z.string().describe("The Thai Citizen ID (13 digits) to look up employee information")
      }),
      func: async ({ citizenId }) => {
        console.log(`🔧 HR QUERY: citizenId="${citizenId}"`);
        
        try {
          const result = await personalHrQuery({
            citizenId: citizenId.trim()
          });
          
          console.log(`✅ HR QUERY SUCCESS: ${result.length} characters`);
          return result;
          
        } catch (error) {
          console.error("❌ HR QUERY ERROR:", error.message);
          return `HR query failed: ${error.message}`;
        }
      }
    });

    // Initialize LLM
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    // Enhanced prompt template for better tool selection
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `You are an AI assistant for a Knowledge Management System with HR capabilities.

TOOL SELECTION RULES:
1. For document-related questions → use document_search tool
2. For HR information queries → use personal_hr_query tool

HR QUERY INDICATORS (use personal_hr_query):
- Thai: วันลา, เหลือวันลา, ข้อมูลพนักงาน, รายละเอียดการทำงาน, วันหยุด, การลา
- English: leave days, vacation, employee information, HR data, personal work details

IMPORTANT: 
- For HR queries, you MUST ask for Thai Citizen ID if not provided
- Always use the appropriate tool based on the query type
- Provide comprehensive responses based on tool results

Available tools:
- document_search: Company documents and knowledge base
- personal_hr_query: Personal employee information via Thai Citizen ID`],
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad")
    ]);

    // Create agent with both tools
    console.log("🤖 Creating Enhanced Agent...");
    const agent = await createOpenAIFunctionsAgent({
      llm,
      tools: [documentSearchTool, personalHrQueryTool],
      prompt
    });

    const agentExecutor = new AgentExecutor({
      agent,
      tools: [documentSearchTool, personalHrQueryTool],
      verbose: false,
      returnIntermediateSteps: true,
      maxIterations: 3
    });

    // Test 1: Thai HR Query (the problematic one)
    console.log("\n" + "=".repeat(70));
    console.log("🇹🇭 TEST 1: Thai HR Query - 'เหลือวันลาอีกกี่วัน'");
    console.log("=".repeat(70));
    
    const thaiHrQuery = "เหลือวันลาอีกกี่วัน citizen ID 1234567890123";
    console.log(`📝 Query: "${thaiHrQuery}"`);
    
    const startTime1 = Date.now();
    const result1 = await agentExecutor.invoke({
      input: thaiHrQuery
    });
    const endTime1 = Date.now();

    console.log(`\n📊 Test 1 Results:`);
    console.log(`⏱️ Execution Time: ${endTime1 - startTime1}ms`);
    console.log(`🔗 Intermediate Steps: ${result1.intermediateSteps?.length || 0}`);
    console.log(`📄 Output Length: ${result1.output?.length || 0} characters`);
    
    if (result1.intermediateSteps && result1.intermediateSteps.length > 0) {
      console.log("✅ Tools were executed:");
      result1.intermediateSteps.forEach((step, index) => {
        console.log(`   Step ${index + 1}: ${step.action?.tool} tool used`);
        if (step.action?.tool === 'personal_hr_query') {
          console.log("🎯 CORRECT! HR query tool was used for Thai leave days query");
        } else if (step.action?.tool === 'document_search') {
          console.log("❌ INCORRECT! Document search was used instead of HR query");
        }
      });
    } else {
      console.log("❌ No tools were executed");
    }

    console.log("\n📄 Agent Response:");
    console.log("-".repeat(50));
    console.log(result1.output || "No output received");
    console.log("-".repeat(50));

    // Test 2: English HR Query for comparison
    console.log("\n" + "=".repeat(70));
    console.log("🇺🇸 TEST 2: English HR Query - 'How many leave days do I have left?'");
    console.log("=".repeat(70));
    
    const englishHrQuery = "How many leave days do I have left? My citizen ID is 2345678901234";
    console.log(`📝 Query: "${englishHrQuery}"`);
    
    const startTime2 = Date.now();
    const result2 = await agentExecutor.invoke({
      input: englishHrQuery
    });
    const endTime2 = Date.now();

    console.log(`\n📊 Test 2 Results:`);
    console.log(`⏱️ Execution Time: ${endTime2 - startTime2}ms`);
    console.log(`🔗 Intermediate Steps: ${result2.intermediateSteps?.length || 0}`);
    
    if (result2.intermediateSteps && result2.intermediateSteps.length > 0) {
      console.log("✅ Tools were executed:");
      result2.intermediateSteps.forEach((step, index) => {
        console.log(`   Step ${index + 1}: ${step.action?.tool} tool used`);
      });
    } else {
      console.log("❌ No tools were executed");
    }

    console.log("\n📄 Agent Response:");
    console.log("-".repeat(50));
    console.log(result2.output || "No output received");
    console.log("-".repeat(50));

    // Final Analysis
    console.log("\n" + "=".repeat(70));
    console.log("📋 FINAL ANALYSIS");
    console.log("=".repeat(70));
    
    const test1HrToolUsed = result1.intermediateSteps?.some(step => step.action?.tool === 'personal_hr_query');
    const test2HrToolUsed = result2.intermediateSteps?.some(step => step.action?.tool === 'personal_hr_query');
    
    console.log(`🇹🇭 Thai HR Query Tool Selection: ${test1HrToolUsed ? '✅ CORRECT (HR tool used)' : '❌ INCORRECT (HR tool not used)'}`);
    console.log(`🇺🇸 English HR Query Tool Selection: ${test2HrToolUsed ? '✅ CORRECT (HR tool used)' : '❌ INCORRECT (HR tool not used)'}`);
    
    if (test1HrToolUsed && test2HrToolUsed) {
      console.log(`\n🎉 SUCCESS: Both Thai and English HR queries use the correct HR tool!`);
      console.log("✅ Tool binding is working correctly");
      console.log("✅ Tool descriptions are comprehensive enough");
      console.log("✅ Agent properly identifies HR queries in both languages");
    } else {
      console.log(`\n⚠️ Issues detected with tool selection:`);
      if (!test1HrToolUsed) console.log("❌ Thai HR query not using HR tool");
      if (!test2HrToolUsed) console.log("❌ English HR query not using HR tool");
    }

  } catch (error) {
    console.error("\n💥 TEST FAILED:");
    console.error("Error Type:", error.constructor.name);
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);
  }
}

// Run the final test
console.log("Starting final LangChain agent verification...\n");
testFinalLangChainAgent().catch(console.error);