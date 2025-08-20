
import fetch from 'node-fetch';

const BASE_URL = 'https://372605f0-45bc-4472-9833-ce8d6cb297a8-00-iumlc89wjmzm.pike.replit.dev';

async function testLogin() {
  console.log('🧪 Testing /login endpoint...\n');

  try {
    // Test 1: Direct /login route
    console.log('1. Testing GET /login (should serve HTML login page)');
    const loginResponse = await fetch(`${BASE_URL}/login`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Test-Script/1.0'
      }
    });

    console.log(`Status: ${loginResponse.status} ${loginResponse.statusText}`);
    console.log(`Content-Type: ${loginResponse.headers.get('content-type')}`);
    
    if (loginResponse.ok) {
      const loginHtml = await loginResponse.text();
      const hasReplitAuth = loginHtml.includes('auth.util.repl.co');
      const hasLoginContainer = loginHtml.includes('login-container');
      
      console.log(`✓ HTML Response Length: ${loginHtml.length} chars`);
      console.log(`✓ Contains Replit Auth Script: ${hasReplitAuth}`);
      console.log(`✓ Contains Login Container: ${hasLoginContainer}`);
      
      if (hasReplitAuth && hasLoginContainer) {
        console.log('✅ /login endpoint working correctly');
      } else {
        console.log('⚠️  /login HTML may be incomplete');
      }
    } else {
      console.log('❌ /login endpoint failed');
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 2: API login route
    console.log('2. Testing GET /api/login (should redirect to Replit auth)');
    const apiLoginResponse = await fetch(`${BASE_URL}/api/login`, {
      method: 'GET',
      redirect: 'manual', // Don't follow redirects automatically
      headers: {
        'User-Agent': 'Test-Script/1.0'
      }
    });

    console.log(`Status: ${apiLoginResponse.status} ${apiLoginResponse.statusText}`);
    
    if (apiLoginResponse.status === 302 || apiLoginResponse.status === 301) {
      const redirectLocation = apiLoginResponse.headers.get('location');
      console.log(`✓ Redirect Location: ${redirectLocation}`);
      
      if (redirectLocation && redirectLocation.includes('replit.com')) {
        console.log('✅ /api/login redirects to Replit auth correctly');
      } else {
        console.log('⚠️  /api/login redirect may be incorrect');
      }
    } else {
      console.log('❌ /api/login should return redirect status');
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 3: Check auth methods endpoint
    console.log('3. Testing GET /api/auth/methods');
    const methodsResponse = await fetch(`${BASE_URL}/api/auth/methods`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Test-Script/1.0'
      }
    });

    console.log(`Status: ${methodsResponse.status} ${methodsResponse.statusText}`);
    
    if (methodsResponse.ok) {
      const methods = await methodsResponse.json();
      console.log('✓ Available auth methods:', JSON.stringify(methods, null, 2));
      console.log('✅ Auth methods endpoint working');
    } else {
      console.log('❌ Auth methods endpoint failed');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

async function testAuthFlow() {
  console.log('\n🔐 Testing complete auth flow...\n');
  
  try {
    // Test the root route first
    console.log('1. Testing GET / (should show landing or redirect)');
    const rootResponse = await fetch(`${BASE_URL}/`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Test-Script/1.0'
      }
    });

    console.log(`Status: ${rootResponse.status} ${rootResponse.statusText}`);
    console.log(`Content-Type: ${rootResponse.headers.get('content-type')}`);
    
    if (rootResponse.ok) {
      const rootHtml = await rootResponse.text();
      const isLanding = rootHtml.includes('Landing') || rootHtml.includes('login');
      const isDashboard = rootHtml.includes('Dashboard') || rootHtml.includes('AI-KMS');
      
      console.log(`✓ Response Length: ${rootHtml.length} chars`);
      console.log(`✓ Appears to be Landing: ${isLanding}`);
      console.log(`✓ Appears to be Dashboard: ${isDashboard}`);
    }

  } catch (error) {
    console.error('❌ Auth flow test failed:', error.message);
  }
}

// Run the tests
console.log('🚀 Starting Login Endpoint Tests\n');
testLogin()
  .then(() => testAuthFlow())
  .then(() => {
    console.log('\n✨ All tests completed!');
  })
  .catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
