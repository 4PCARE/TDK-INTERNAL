
const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testSQLiteEndpoint() {
  console.log('🧪 Testing SQLite existing-files endpoint...\n');

  try {
    // Test 1: Check endpoint without authentication
    console.log('1. Testing without authentication...');
    try {
      const response = await axios.get(`${BASE_URL}/api/sqlite/existing-files`);
      console.log(`✅ Response status: ${response.status}`);
      console.log(`✅ Response data:`, response.data);
    } catch (error) {
      if (error.response) {
        console.log(`❌ Status: ${error.response.status}`);
        console.log(`❌ Response type: ${error.response.headers['content-type']}`);
        console.log(`❌ Response data (first 200 chars):`, 
          typeof error.response.data === 'string' 
            ? error.response.data.substring(0, 200)
            : JSON.stringify(error.response.data).substring(0, 200)
        );
      } else {
        console.log(`❌ Network error:`, error.message);
      }
    }

    // Test 2: Check if the route is properly registered
    console.log('\n2. Testing route registration...');
    try {
      const response = await axios.get(`${BASE_URL}/api/health`);
      console.log(`✅ Health check: ${response.status}`);
    } catch (error) {
      console.log(`❌ Health check failed:`, error.message);
    }

    // Test 3: Check what routes are available
    console.log('\n3. Testing available API routes...');
    const testRoutes = [
      '/api/auth/user',
      '/api/database-connections', 
      '/api/sqlite/existing-files'
    ];

    for (const route of testRoutes) {
      try {
        const response = await axios.get(`${BASE_URL}${route}`, {
          timeout: 5000,
          validateStatus: (status) => status < 500 // Accept 4xx errors as valid responses
        });
        console.log(`✅ ${route}: ${response.status} - ${response.headers['content-type']}`);
      } catch (error) {
        if (error.response) {
          console.log(`❌ ${route}: ${error.response.status} - ${error.response.headers['content-type']}`);
          const contentType = error.response.headers['content-type'];
          if (contentType && contentType.includes('text/html')) {
            console.log(`   🚨 Getting HTML instead of JSON - likely Vite catch-all route`);
          }
        } else {
          console.log(`❌ ${route}: Network error - ${error.message}`);
        }
      }
    }

    // Test 4: Direct curl test with proper headers
    console.log('\n4. Testing with curl (simulating browser request)...');
    console.log('Run this command in terminal:');
    console.log(`curl -v -H "Accept: application/json" -H "Content-Type: application/json" "${BASE_URL}/api/sqlite/existing-files"`);

  } catch (error) {
    console.error('❌ Test script error:', error.message);
  }
}

testSQLiteEndpoint();
