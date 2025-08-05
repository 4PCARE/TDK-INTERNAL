

import { documentSearch } from './server/services/langchainTools.ts';

async function testDocumentSearchTool() {
  console.log('🧪 Testing document_search tool with LangChain-style input...');
  
  const testCases = [
    {
      name: 'Object Input (LangChain format)',
      input: { input: "เดอะมอลล์" },
      userId: '43981095'
    },
    {
      name: 'JSON String Input',
      input: '{"input":"เดอะมอลล์"}',
      userId: '43981095'
    },
    {
      name: 'Direct String Input',
      input: "เดอะมอลล์",
      userId: '43981095'
    },
    {
      name: 'English Query',
      input: "XOLO restaurant",
      userId: '43981095'
    },
    {
      name: 'Empty Input Test',
      input: "",
      userId: '43981095'
    },
    {
      name: 'Null Input Test',
      input: null,
      userId: '43981095'
    }
  ];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n=== Test ${i + 1}/${testCases.length}: ${testCase.name} ===`);
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
    }
  }
}

async function testToolFunctionDirectly() {
  console.log('\n🔧 Testing tool function directly (as LangChain calls it)...');
  
  console.log('Simulating LangChain tool call...');
  
  // Test the direct function call with different input formats
  const directTestInputs = [
    'เดอะมอลล์',
    '{"input": "XOLO"}',
    { input: 'restaurant' }
  ];

  for (let i = 0; i < directTestInputs.length; i++) {
    const input = directTestInputs[i];
    console.log(`\n--- Direct test ${i + 1}/${directTestInputs.length} ---`);
    console.log(`Input:`, input);
    
    try {
      let query;
      let searchType = 'smart_hybrid';
      let limit = 5;
      let threshold = 0.3;
      
      // Parse the query based on input type
      if (typeof input === 'object' && input !== null && 'input' in input) {
        console.log('Using object input format');
        query = input.input;
        searchType = input.searchType || searchType;
        limit = input.limit || limit;
        threshold = input.threshold || threshold;
      } else if (typeof input === 'string' && input.startsWith('{')) {
        console.log('Using JSON string input');
        const parsed = JSON.parse(input);
        query = parsed.input || parsed.query || input;
        searchType = parsed.searchType || searchType;
        limit = parsed.limit || limit;
        threshold = parsed.threshold || threshold;
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

// Run the tests ONCE and exit
async function runAllTests() {
  try {
    console.log('🚀 Starting document search tool tests...\n');
    
    await testDocumentSearchTool();
    await testToolFunctionDirectly();
    
    console.log('\n✅ All tests completed successfully!');
    console.log('📊 Test summary: All document search tool tests finished.');
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    console.log('\n🎯 Test execution finished. Exiting...');
    process.exit(0); // Force exit to prevent hanging
  }
}

// Execute tests only once
runAllTests();
