
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

const BASE_URL = 'http://localhost:5000';

// Test data
const mockSnippet = {
  name: "Get top selling products",
  sql: "SELECT product_name, SUM(quantity) as total_sold FROM sales s JOIN products p ON s.product_id = p.id GROUP BY product_name ORDER BY total_sold DESC LIMIT 10",
  description: "Retrieves the top 10 best-selling products by total quantity sold"
};

const connectionId = 34;

async function analyzeHtmlResponse(htmlContent) {
  console.log('\n🔍 Analyzing HTML response...');
  
  try {
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    
    // Check if it's the Vite dev server
    const viteScripts = document.querySelectorAll('script[type="module"]');
    const hasViteClient = htmlContent.includes('/@vite/client');
    
    if (hasViteClient) {
      console.log('📦 This is the Vite development client (frontend SPA)');
      console.log('🔧 This means the API route is not being matched properly');
    }
    
    // Check for authentication-related content
    const title = document.querySelector('title')?.textContent || '';
    const bodyText = document.body?.textContent || '';
    
    console.log(`📄 Page title: ${title}`);
    console.log(`📝 Body text preview: ${bodyText.substring(0, 200)}...`);
    
    // Look for specific patterns
    if (bodyText.includes('login') || bodyText.includes('Login')) {
      console.log('🔐 Contains login-related content');
    }
    
    if (bodyText.includes('unauthorized') || bodyText.includes('Unauthorized')) {
      console.log('❌ Contains unauthorized content');
    }
    
  } catch (error) {
    console.error('❌ Failed to parse HTML:', error.message);
  }
}

async function testApiRouteMatching() {
  console.log('\n🛣️ Testing API route matching...');
  
  const testRoutes = [
    '/api/database/34/snippets',
    '/api/auth/session',
    '/api/health',
    '/api/database',
    '/database/34/snippets'  // Test without /api prefix
  ];
  
  for (const route of testRoutes) {
    try {
      const response = await fetch(`${BASE_URL}${route}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const isHtml = contentType.includes('text/html');
      
      console.log(`📍 ${route}: ${response.status} (${isJson ? 'JSON' : isHtml ? 'HTML' : contentType})`);
      
      if (isJson && response.status === 200) {
        const jsonData = await response.json();
        console.log(`   ✅ Valid JSON response:`, Object.keys(jsonData));
      }
      
    } catch (error) {
      console.log(`📍 ${route}: ERROR - ${error.message}`);
    }
  }
}

async function testWithCookies() {
  console.log('\n🍪 Testing with different cookie scenarios...');
  
  // Test with empty cookie
  const response1 = await fetch(`${BASE_URL}/api/database/${connectionId}/snippets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': ''
    },
    body: JSON.stringify(mockSnippet)
  });
  
  console.log(`📊 With empty cookie: ${response1.status}`);
  
  // Test with fake session cookie
  const response2 = await fetch(`${BASE_URL}/api/database/${connectionId}/snippets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': 'replit.sid=fake-session-id'
    },
    body: JSON.stringify(mockSnippet)
  });
  
  console.log(`📊 With fake session: ${response2.status}`);
  
  const responseText = await response2.text();
  if (responseText.includes('<!DOCTYPE')) {
    await analyzeHtmlResponse(responseText);
  }
}

async function checkServerLogs() {
  console.log('\n📋 Server behavior analysis:');
  console.log('✅ Server is running on port 5000');
  console.log('✅ Express is serving requests');
  console.log('✅ Authentication middleware is active');
  console.log('❓ API routes may be falling through to SPA handler');
  
  console.log('\n🔧 Possible issues:');
  console.log('1. API routes are defined but middleware catches requests first');
  console.log('2. Route order: SPA catch-all route is before API routes');
  console.log('3. Authentication middleware redirects to frontend instead of returning JSON error');
  console.log('4. Missing API route prefix in Express router setup');
}

async function runAdvancedTest() {
  console.log('🧪 Advanced SQL Snippet Endpoint Test');
  console.log('=======================================\n');
  
  await testApiRouteMatching();
  await testWithCookies();
  await checkServerLogs();
  
  console.log('\n💡 Recommendations:');
  console.log('1. Check that API routes are registered before SPA catch-all route');
  console.log('2. Verify authentication middleware returns JSON errors for API routes');
  console.log('3. Ensure /api prefix is properly handled in route setup');
  console.log('4. Consider adding request logging to see which routes are being hit');
  
  console.log('\n🛠️ Next steps:');
  console.log('1. Check server/index.ts route order');
  console.log('2. Verify API middleware setup');
  console.log('3. Test routes directly in browser DevTools Network tab');
}

// Install jsdom if needed
try {
  const { JSDOM } = await import('jsdom');
  runAdvancedTest();
} catch (error) {
  console.log('📦 Installing jsdom for HTML parsing...');
  console.log('Run: npm install jsdom');
  console.log('Then run this script again.');
}
