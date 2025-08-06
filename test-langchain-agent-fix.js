import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Test the fixed LangChain agent with document search tool
async function testLangChainAgent() {
  console.log("🧪 Testing LangChain Functions Agent with Document Search Tool");
  
  try {
    // Create the document search tool with proper Zod schema
    const documentSearchTool = new DynamicStructuredTool({
      name: "document_search",
      description: "Search through uploaded documents to find relevant information",
      schema: z.object({
        input: z.string().describe("The search query or question to find in documents"),
        searchType: z.string().optional().describe("Type of search: 'smart_hybrid', 'semantic', or 'keyword'"),
        limit: z.number().optional().describe("Maximum number of results to return"),
        threshold: z.number().optional().describe("Similarity threshold for results")
      }),
      func: async ({ input, searchType = "smart_hybrid", limit = 5, threshold = 0.7 }) => {
        console.log(`📋 TOOL EXECUTION START: document_search`);
        console.log(`  - Query: ${input}`);
        console.log(`  - Search Type: ${searchType}`);
        console.log(`  - Limit: ${limit}`);
        console.log(`  - Threshold: ${threshold}`);
        
        // Simulate search results
        const mockResults = [
          { title: "Document 1", content: "Sample content about " + input, score: 0.95 },
          { title: "Document 2", content: "More information related to " + input, score: 0.87 }
        ];
        
        console.log(`📋 TOOL EXECUTION END: Found ${mockResults.length} results`);
        return JSON.stringify(mockResults, null, 2);
      }
    });

    // Initialize the LLM
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY
    });

    // Create prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "You are a helpful AI assistant that can search through documents to answer questions. When the user asks about information that might be in documents, use the document_search tool to find relevant information."],
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad")
    ]);

    // Create the agent
    const agent = await createOpenAIFunctionsAgent({
      llm,
      tools: [documentSearchTool],
      prompt
    });

    // Create agent executor with callbacks for debugging
    const agentExecutor = new AgentExecutor({
      agent,
      tools: [documentSearchTool],
      verbose: true,
      callbacks: [
        {
          handleToolStart: (tool, input) => {
            console.log(`🔧 CALLBACK: Tool "${tool.name}" starting with input:`, input);
          },
          handleToolEnd: (output) => {
            console.log(`✅ CALLBACK: Tool completed with output:`, output);
          },
          handleToolError: (error) => {
            console.log(`❌ CALLBACK: Tool error:`, error);
          }
        }
      ]
    });

    // Test the agent with a query that should trigger document search
    console.log("\n🚀 Executing agent with query...");
    const testQuery = "What information do you have about OPPO products?";
    
    const result = await agentExecutor.invoke({
      input: testQuery
    });

    console.log("\n📊 FINAL RESULTS:");
    console.log("Output:", result.output);
    console.log("Intermediate Steps Length:", result.intermediateSteps?.length || 0);
    
    if (result.intermediateSteps && result.intermediateSteps.length > 0) {
      console.log("✅ SUCCESS: Tool was executed! Intermediate steps found:");
      result.intermediateSteps.forEach((step, index) => {
        console.log(`  Step ${index + 1}:`, {
          action: step.action?.tool,
          input: step.action?.toolInput,
          hasObservation: !!step.observation
        });
      });
    } else {
      console.log("❌ FAILURE: No intermediate steps - tool was not executed");
    }

  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

// Run the test
testLangChainAgent().catch(console.error);