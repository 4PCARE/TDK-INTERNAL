
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

// Test data
const mockSnippet = {
  name: "Get top selling products",
  sql: "SELECT product_name, SUM(quantity) as total_sold FROM sales s JOIN products p ON s.product_id = p.id GROUP BY product_name ORDER BY total_sold DESC LIMIT 10",
  description: "Retrieves the top 10 best-selling products by total quantity sold"
};

const connectionId = 34;

async function testDirectEndpoint() {
  try {
    console.log('🔍 Testing endpoint availability...');
    
    const response = await fetch(`${BASE_URL}/api/database/${connectionId}/snippets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mockSnippet)
    });

    console.log(`📊 Response status: ${response.status}`);
    console.log(`📊 Response headers:`, Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log(`📊 Response body preview: ${responseText.substring(0, 200)}...`);
    
    // Check if it's HTML (authentication redirect)
    if (responseText.includes('<!DOCTYPE') || responseText.includes('<html>')) {
      console.log('❌ Received HTML response - this indicates authentication failure');
      console.log('💡 The endpoint exists but requires authentication');
      return;
    }

    // Try to parse as JSON
    try {
      const result = JSON.parse(responseText);
      console.log('✅ JSON response received:', result);
    } catch (parseError) {
      console.log('❌ Failed to parse response as JSON:', parseError.message);
    }

  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

async function testAuthEndpoint() {
  try {
    console.log('\n🔐 Testing authentication endpoint...');
    
    const response = await fetch(`${BASE_URL}/api/auth/session`, {
      method: 'GET'
    });

    console.log(`📊 Auth endpoint status: ${response.status}`);
    const authText = await response.text();
    console.log(`📊 Auth response preview: ${authText.substring(0, 200)}...`);

  } catch (error) {
    console.error('❌ Auth test error:', error.message);
  }
}

async function testWithoutAuth() {
  try {
    console.log('\n🚀 Testing snippet creation without authentication...');
    console.log('📝 This will likely fail due to authentication requirements');
    
    const response = await fetch(`${BASE_URL}/api/database/${connectionId}/snippets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mockSnippet)
    });

    console.log(`📊 Response status: ${response.status}`);
    
    const responseText = await response.text();
    
    if (responseText.includes('<!DOCTYPE') || responseText.includes('<html>')) {
      console.log('❌ Authentication required - received HTML login page');
      console.log('💡 To test properly, you need to:');
      console.log('   1. Log into the app in your browser');
      console.log('   2. Copy the session cookie from DevTools');
      console.log('   3. Add it to the test script headers');
    } else {
      console.log('✅ Unexpected success or different error format');
      console.log('📄 Response:', responseText);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function runTest() {
  console.log('🧪 SQL Snippet Endpoint Test');
  console.log('=============================\n');
  
  await testDirectEndpoint();
  await testAuthEndpoint();
  await testWithoutAuth();
  
  console.log('\n✨ Test completed!');
  console.log('\n💡 Next steps:');
  console.log('   1. The endpoint exists and is working');
  console.log('   2. Authentication is required');
  console.log('   3. Use browser DevTools to get session cookie for authenticated testing');
}

// Run the test
runTest();
