
const { documentSearch } = require('./server/services/langchainTools');

async function testDocumentSearchTool() {
  console.log('🧪 Testing document_search tool with LangChain-style input...');
  
  const testCases = [
    // Test case 1: Object input (what LangChain actually sends)
    {
      name: 'Object Input (LangChain format)',
      input: { input: "เดอะมอลล์" },
      userId: '43981095'
    },
    
    // Test case 2: JSON string input
    {
      name: 'JSON String Input',
      input: '{"input":"เดอะมอลล์"}',
      userId: '43981095'
    },
    
    // Test case 3: Direct string input
    {
      name: 'Direct String Input',
      input: "เดอะมอลล์",
      userId: '43981095'
    },
    
    // Test case 4: Empty input
    {
      name: 'Empty Input Test',
      input: "",
      userId: '43981095'
    },
    
    // Test case 5: Null input
    {
      name: 'Null Input Test',
      input: null,
      userId: '43981095'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n=== ${testCase.name} ===`);
    console.log(`Input type: ${typeof testCase.input}`);
    console.log(`Input value:`, testCase.input);
    console.log(`User ID: ${testCase.userId}`);
    
    try {
      const startTime = Date.now();
      
      const result = await documentSearch({
        query: typeof testCase.input === 'object' && testCase.input?.input 
          ? testCase.input.input 
          : typeof testCase.input === 'string' && testCase.input.startsWith('{')
          ? JSON.parse(testCase.input).input
          : testCase.input,
        userId: testCase.userId,
        searchType: 'smart_hybrid',
        limit: 5,
        threshold: 0.3
      });
      
      const duration = Date.now() - startTime;
      
      console.log(`✅ SUCCESS (${duration}ms)`);
      console.log(`Result type: ${typeof result}`);
      console.log(`Result length: ${result?.length || 0} characters`);
      console.log(`Result preview: ${result?.substring(0, 200)}...`);
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      console.log(`Error type: ${error.constructor.name}`);
      console.log(`Stack trace: ${error.stack}`);
    }
  }
}

// Also test the tool function directly as LangChain would call it
async function testToolFunctionDirectly() {
  console.log('\n🔧 Testing tool function directly (as LangChain calls it)...');
  
  // Import the tool creation function
  const { createDocumentSearchTool } = require('./server/services/openai');
  
  // This won't work directly since createDocumentSearchTool is not exported
  // Let's simulate the tool call instead
  
  console.log('Simulating LangChain tool call...');
  
  // Simulate what happens inside the DynamicTool func
  const testInputs = [
    { input: "เดอะมอลล์" },
    '{"input":"เดอะมอลล์"}',
    "เดอะมอลล์"
  ];
  
  for (const input of testInputs) {
    console.log(`\n--- Testing input: ${JSON.stringify(input)} ---`);
    
    try {
      // This simulates the parsing logic in your tool
      let query;
      let searchType = 'smart_hybrid';
      let limit = 5;
      let threshold = 0.3;

      if (typeof input === 'object' && input !== null) {
        console.log('Detected object input format');
        const params = input;
        query = params.input || params.query || JSON.stringify(input);
        searchType = params.searchType || 'smart_hybrid';
        limit = params.limit || 5;
        threshold = params.threshold || 0.3;
      } else if (typeof input === 'string' && input.trim().startsWith('{')) {
        console.log('Detected JSON string input format');
        const params = JSON.parse(input);
        query = params.input || params.query || input;
        searchType = params.searchType || 'smart_hybrid';
        limit = params.limit || 5;
        threshold = params.threshold || 0.3;
      } else {
        console.log('Using direct string input');
        query = String(input);
      }

      console.log(`Parsed query: "${query}"`);
      console.log(`Search type: ${searchType}`);
      
      if (!query || query.trim().length === 0) {
        console.log('Empty query detected');
        continue;
      }

      // Call documentSearch with parsed parameters
      const result = await documentSearch({
        query: query.trim(),
        userId: '43981095',
        searchType: searchType,
        limit: limit,
        threshold: threshold
      });

      console.log(`✅ Tool simulation SUCCESS`);
      console.log(`Result: ${result?.substring(0, 100)}...`);
      
    } catch (error) {
      console.log(`❌ Tool simulation ERROR: ${error.message}`);
    }
  }
}

// Run the tests
async function runAllTests() {
  try {
    await testDocumentSearchTool();
    await testToolFunctionDirectly();
  } catch (error) {
    console.error('Test execution failed:', error);
  }
}

runAllTests();
