
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

// Test data
const mockSnippet = {
  name: "Get top selling products",
  sql: "SELECT product_name, SUM(quantity) as total_sold FROM sales s JOIN products p ON s.product_id = p.id GROUP BY product_name ORDER BY total_sold DESC LIMIT 10",
  description: "Retrieves the top 10 best-selling products by total quantity sold"
};

const connectionId = 34; // Use your existing connection ID from the logs

async function addMockSnippet() {
  try {
    console.log('🚀 Adding mock SQL snippet...');
    
    const response = await fetch(`${BASE_URL}/api/database/${connectionId}/snippets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=your_session_cookie_here' // Replace with actual session cookie
      },
      body: JSON.stringify(mockSnippet)
    });

    console.log(`📊 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Mock snippet created successfully:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('❌ Error adding mock snippet:', error.message);
  }
}

async function listSnippets() {
  try {
    console.log('\n📋 Fetching existing snippets...');
    
    const response = await fetch(`${BASE_URL}/api/database/${connectionId}/snippets`, {
      headers: {
        'Cookie': 'connect.sid=your_session_cookie_here' // Replace with actual session cookie
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const snippets = await response.json();
    console.log(`📝 Found ${snippets.length} snippets:`);
    snippets.forEach((snippet, index) => {
      console.log(`${index + 1}. ${snippet.name}`);
      console.log(`   SQL: ${snippet.sql.substring(0, 100)}...`);
      console.log(`   Description: ${snippet.description || 'No description'}\n`);
    });

  } catch (error) {
    console.error('❌ Error fetching snippets:', error.message);
  }
}

async function runTest() {
  console.log('🧪 SQL Snippet Test Script');
  console.log('==========================\n');
  
  await addMockSnippet();
  await listSnippets();
  
  console.log('✨ Test completed!');
}

// Run the test
runTest();
