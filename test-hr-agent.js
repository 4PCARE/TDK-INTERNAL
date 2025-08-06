import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Test the enhanced LangChain agent with both document search and HR query capabilities
async function testEnhancedAgent() {
  console.log("🧪 Testing Enhanced LangChain Agent with Document Search + HR Query");
  
  try {
    // Create the document search tool
    const documentSearchTool = new DynamicStructuredTool({
      name: "document_search",
      description: "Search through uploaded documents to find relevant information",
      schema: z.object({
        input: z.string().describe("The search query or question to find in documents"),
        searchType: z.string().optional().default("smart_hybrid").describe("Type of search"),
        limit: z.number().optional().default(5).describe("Maximum number of results"),
        threshold: z.number().optional().default(0.7).describe("Similarity threshold")
      }),
      func: async (input) => {
        console.log(`🔧 DOCUMENT SEARCH EXECUTING: ${input.input}`);
        
        // Simulate document search results
        const results = [
          {
            documentName: "Company Policy Manual",
            content: "Our company policy regarding remote work allows flexible arrangements for eligible employees.",
            score: 0.89
          },
          {
            documentName: "Employee Handbook",
            content: "Guidelines for professional conduct and workplace expectations are outlined in this section.",
            score: 0.82
          }
        ];
        
        console.log(`✅ DOCUMENT SEARCH COMPLETED: Found ${results.length} documents`);
        return `Found ${results.length} relevant documents about "${input.input}":

${results.map((result, index) => 
  `${index + 1}. **${result.documentName}** (Score: ${result.score})
   ${result.content}`
).join('\n\n')}`;
      }
    });

    // Create the personal HR query tool
    const personalHrQueryTool = new DynamicStructuredTool({
      name: "personal_hr_query",
      description: "Query personal employee information using Thai Citizen ID",
      schema: z.object({
        citizenId: z.string().describe("The Thai Citizen ID (13 digits) to look up employee information")
      }),
      func: async (input) => {
        console.log(`🔧 HR QUERY EXECUTING: citizenId=${input.citizenId}`);
        
        // Simulate HR database lookup
        const mockEmployeeData = {
          "1234567890123": {
            employeeId: "EMP001",
            firstName: "Somchai",
            lastName: "Jaidee",
            email: "somchai.j@company.com",
            phone: "081-234-5678",
            department: "Engineering",
            position: "Senior Software Engineer",
            startDate: new Date("2020-03-15"),
            leaveDays: 10
          },
          "2345678901234": {
            employeeId: "EMP002",
            firstName: "Siriporn",
            lastName: "Kulkarn",
            email: "siriporn.k@company.com",
            phone: "082-345-6789",
            department: "Human Resources",
            position: "HR Manager",
            startDate: new Date("2019-08-20"),
            leaveDays: 15
          }
        };

        const employee = mockEmployeeData[input.citizenId];
        
        if (!employee) {
          console.log(`❌ HR QUERY: No employee found for citizen ID ${input.citizenId}`);
          return "No active employee record found for the provided Thai Citizen ID.";
        }

        console.log(`✅ HR QUERY COMPLETED: Found employee ${employee.firstName} ${employee.lastName}`);
        
        return `Personal Employee Information:

Employee ID: ${employee.employeeId}
Name: ${employee.firstName} ${employee.lastName}
Email: ${employee.email}
Phone: ${employee.phone}
Department: ${employee.department}
Position: ${employee.position}
Start Date: ${employee.startDate.toLocaleDateString()}
Available Leave Days: ${employee.leaveDays} days

This information is retrieved from the HR system and is current as of today.`;
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
      ["system", `You are a helpful AI assistant with access to both document search and HR query tools. 

When users ask questions:
1. For document-related queries, use the document_search tool
2. For personal HR information queries, use the personal_hr_query tool with their citizen ID
3. Always use the appropriate tool and provide comprehensive answers based on the results

Available tools:
- document_search: Search company documents and knowledge base
- personal_hr_query: Access personal employee information using Thai Citizen ID`],
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad")
    ]);

    // Create the agent
    console.log("🤖 Creating Enhanced Agent...");
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
      verbose: true,
      returnIntermediateSteps: true,
      maxIterations: 3
    });

    // Test 1: Document Search Query
    console.log("\n" + "=".repeat(60));
    console.log("🔍 TEST 1: Document Search Query");
    console.log("=".repeat(60));
    
    const documentQuery = "What are the company policies about remote work?";
    console.log(`Query: "${documentQuery}"`);
    
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
        console.log(`  Step ${index + 1}: ${step.action?.tool} tool used`);
      });
    } else {
      console.log("❌ No tools were executed for document search");
    }

    console.log("\n📄 Agent Response:");
    console.log("-".repeat(40));
    console.log(result1.output || "No output received");
    console.log("-".repeat(40));

    // Test 2: Personal HR Query
    console.log("\n" + "=".repeat(60));
    console.log("👤 TEST 2: Personal HR Query");
    console.log("=".repeat(60));
    
    const hrQuery = "Can you show me my employee information? My citizen ID is 1234567890123";
    console.log(`Query: "${hrQuery}"`);
    
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
        console.log(`  Step ${index + 1}: ${step.action?.tool} tool used`);
      });
    } else {
      console.log("❌ No tools were executed for HR query");
    }

    console.log("\n📄 Agent Response:");
    console.log("-".repeat(40));
    console.log(result2.output || "No output received");
    console.log("-".repeat(40));

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📋 OVERALL TEST SUMMARY");
    console.log("=".repeat(60));
    
    const test1Success = result1.intermediateSteps && result1.intermediateSteps.length > 0 && result1.output;
    const test2Success = result2.intermediateSteps && result2.intermediateSteps.length > 0 && result2.output;
    
    console.log(`🔍 Document Search Test: ${test1Success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`👤 HR Query Test: ${test2Success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`🎯 Overall Result: ${test1Success && test2Success ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  } catch (error) {
    console.error("\n💥 TEST FAILED:");
    console.error(error);
  }
}

// Run the test
testEnhancedAgent().catch(console.error);