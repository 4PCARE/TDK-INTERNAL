import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Test the fixed LangChain agent with proper tool execution
async function testLangChainAgentFixed() {
  console.log("🧪 Testing FIXED LangChain Functions Agent");
  
  try {
    // Create the document search tool with proper implementation
    const documentSearchTool = new DynamicStructuredTool({
      name: "document_search",
      description: "Search through uploaded documents to find relevant information based on user queries",
      schema: z.object({
        input: z.string().describe("The search query or question to find in documents"),
        searchType: z.string().optional().default("smart_hybrid").describe("Type of search"),
        limit: z.number().optional().default(5).describe("Maximum number of results"),
        threshold: z.number().optional().default(0.7).describe("Similarity threshold")
      }),
      func: async (input) => {
        console.log(`🔧 TOOL EXECUTING: document_search`);
        console.log(`🔧 Input received:`, JSON.stringify(input, null, 2));
        
        // Extract the actual search parameters
        const query = input.input;
        const searchType = input.searchType || "smart_hybrid";
        const limit = input.limit || 5;
        const threshold = input.threshold || 0.7;
        
        console.log(`🔍 Searching for: "${query}"`);
        console.log(`🔍 Search params: type=${searchType}, limit=${limit}, threshold=${threshold}`);
        
        // Simulate realistic search results
        const results = [
          {
            documentName: "OPPO Product Catalog 2024",
            content: "OPPO smartphones feature advanced camera technology with AI enhancement. The OPPO Find X series offers flagship performance with premium build quality.",
            score: 0.92,
            chunkIndex: 1
          },
          {
            documentName: "Mobile Device Specifications",
            content: "OPPO devices run ColorOS based on Android, providing smooth performance and extensive customization options for users.",
            score: 0.87,
            chunkIndex: 3
          }
        ];
        
        console.log(`✅ TOOL COMPLETED: Found ${results.length} relevant documents`);
        
        // Return formatted results
        return `Found ${results.length} relevant documents about "${query}":

${results.map((result, index) => 
  `${index + 1}. **${result.documentName}** (Score: ${result.score})
   ${result.content}`
).join('\n\n')}

Search completed using ${searchType} method with ${limit} result limit.`;
      }
    });

    // Initialize the LLM with proper settings
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    // Create comprehensive prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `You are a helpful AI assistant with access to a document search tool. When users ask questions that might require information from documents, use the document_search tool to find relevant information.

Instructions:
1. When a user asks about any topic that could be in documents, use the document_search tool
2. Use the search results to provide a comprehensive answer
3. Always acknowledge when you've searched documents and what you found`],
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad")
    ]);

    // Create the agent
    console.log("🤖 Creating OpenAI Functions Agent...");
    const agent = await createOpenAIFunctionsAgent({
      llm,
      tools: [documentSearchTool],
      prompt
    });

    // Create agent executor with proper configuration
    console.log("⚙️ Creating Agent Executor...");
    const agentExecutor = new AgentExecutor({
      agent,
      tools: [documentSearchTool],
      verbose: true,
      returnIntermediateSteps: true,
      maxIterations: 2,
      earlyStoppingMethod: "generate",
      handleParsingErrors: (error) => {
        console.log("🔄 Parsing error handled:", error);
        return "I apologize, but I encountered an error. Let me try again.";
      }
    });

    console.log("🚀 Testing agent with document search query...");
    
    const testQuery = "What can you tell me about OPPO products and their features?";
    
    const startTime = Date.now();
    const result = await agentExecutor.invoke({
      input: testQuery
    });
    const endTime = Date.now();

    console.log("\n" + "=".repeat(80));
    console.log("📊 FINAL TEST RESULTS");
    console.log("=".repeat(80));
    console.log(`⏱️ Execution Time: ${endTime - startTime}ms`);
    console.log(`📝 Query: "${testQuery}"`);
    console.log(`📄 Output Length: ${result.output?.length || 0} characters`);
    console.log(`🔗 Intermediate Steps: ${result.intermediateSteps?.length || 0}`);
    
    if (result.intermediateSteps && result.intermediateSteps.length > 0) {
      console.log("\n✅ SUCCESS: Tool execution confirmed!");
      console.log("🔧 Tool execution details:");
      result.intermediateSteps.forEach((step, index) => {
        console.log(`  Step ${index + 1}:`);
        console.log(`    Tool: ${step.action?.tool || 'unknown'}`);
        console.log(`    Input: ${JSON.stringify(step.action?.toolInput || {})}`);
        console.log(`    Output length: ${step.observation?.length || 0} chars`);
      });
    } else {
      console.log("\n❌ FAILURE: No tool execution detected!");
      console.log("This indicates the agent didn't execute the document_search tool.");
    }
    
    console.log("\n📄 Agent Response:");
    console.log("-".repeat(40));
    console.log(result.output || "No output received");
    console.log("-".repeat(40));

  } catch (error) {
    console.error("\n💥 TEST FAILED:");
    console.error(error);
  }
}

// Run the test
testLangChainAgentFixed().catch(console.error);