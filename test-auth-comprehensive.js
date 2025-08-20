
const fetch = require('node-fetch');

const BASE_URL = 'http://0.0.0.0:8080';
const AUTH_SVC_URL = 'http://0.0.0.0:3001';

// Test configuration
const tests = {
  gateway: true,
  authService: true,
  replitAuth: true,
  googleAuth: true,
  microsoftAuth: true,
  sessions: true,
  middleware: true,
  endpoints: true
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWithTimeout(testFn, timeout = 10000) {
  return Promise.race([
    testFn(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Test timeout')), timeout)
    )
  ]);
}

async function testGatewayHealth() {
  console.log('\n🌐 Testing API Gateway Health...');
  try {
    const response = await fetch(`${BASE_URL}/healthz`, {
      method: 'GET',
      headers: { 'User-Agent': 'Auth-Test/1.0' }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const health = await response.json();
      console.log('✅ Gateway is healthy:', JSON.stringify(health, null, 2));
      return true;
    } else {
      console.log('❌ Gateway health check failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Gateway unreachable:', error.message);
    return false;
  }
}

async function testAuthServiceHealth() {
  console.log('\n🔐 Testing Auth Service Health...');
  try {
    const response = await fetch(`${AUTH_SVC_URL}/healthz`, {
      method: 'GET',
      headers: { 'User-Agent': 'Auth-Test/1.0' }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const health = await response.json();
      console.log('✅ Auth Service is healthy:', JSON.stringify(health, null, 2));
      return true;
    } else {
      console.log('❌ Auth Service health check failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Auth Service unreachable:', error.message);
    return false;
  }
}

async function testAuthMethods() {
  console.log('\n🔍 Testing Available Auth Methods...');
  try {
    const response = await fetch(`${BASE_URL}/api/auth/methods`, {
      method: 'GET',
      headers: { 'User-Agent': 'Auth-Test/1.0' }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const methods = await response.json();
      console.log('✅ Available auth methods:', JSON.stringify(methods, null, 2));
      return methods;
    } else {
      console.log('❌ Auth methods endpoint failed');
      return null;
    }
  } catch (error) {
    console.error('❌ Auth methods test failed:', error.message);
    return null;
  }
}

async function testMeEndpoint() {
  console.log('\n👤 Testing /api/me Endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/api/me`, {
      method: 'GET',
      headers: { 
        'User-Agent': 'Auth-Test/1.0',
        'X-Replit-User-Id': 'test-user-123',
        'X-Replit-User-Name': 'Test User',
        'X-Replit-User-Email': 'test@example.com'
      }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const user = await response.json();
      console.log('✅ User info retrieved:', JSON.stringify(user, null, 2));
      return user;
    } else {
      const error = await response.json().catch(() => ({}));
      console.log('❌ /api/me failed:', JSON.stringify(error, null, 2));
      return null;
    }
  } catch (error) {
    console.error('❌ /api/me test failed:', error.message);
    return null;
  }
}

async function testReplitAuthHeaders() {
  console.log('\n🔗 Testing Replit Auth Headers...');
  
  const testCases = [
    {
      name: 'Valid Replit Headers',
      headers: {
        'X-Replit-User-Id': 'user-12345',
        'X-Replit-User-Name': 'John Doe',
        'X-Replit-User-Email': 'john@example.com'
      }
    },
    {
      name: 'Missing User ID',
      headers: {
        'X-Replit-User-Name': 'Jane Doe',
        'X-Replit-User-Email': 'jane@example.com'
      }
    },
    {
      name: 'No Replit Headers',
      headers: {}
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n  Testing: ${testCase.name}`);
    try {
      const response = await fetch(`${BASE_URL}/api/me`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Auth-Test/1.0',
          ...testCase.headers
        }
      });
      
      console.log(`  Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const result = await response.json();
        console.log(`  ✅ Result:`, JSON.stringify(result, null, 4));
      } else {
        const error = await response.json().catch(() => ({}));
        console.log(`  ❌ Error:`, JSON.stringify(error, null, 4));
      }
    } catch (error) {
      console.error(`  ❌ Test failed:`, error.message);
    }
    
    await delay(500);
  }
}

async function testGoogleAuthFlow() {
  console.log('\n🌟 Testing Google Auth Flow...');
  try {
    // Test Google auth initiation
    const response = await fetch(`${BASE_URL}/api/auth/google`, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'Auth-Test/1.0' }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get('location');
      console.log('✅ Google auth redirect initiated');
      console.log('Redirect URL:', location);
      
      if (location && location.includes('accounts.google.com')) {
        console.log('✅ Proper Google OAuth redirect');
        return true;
      } else {
        console.log('❌ Invalid redirect URL');
        return false;
      }
    } else {
      console.log('❌ Google auth initiation failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Google auth test failed:', error.message);
    return false;
  }
}

async function testMicrosoftAuthFlow() {
  console.log('\n🔷 Testing Microsoft Auth Flow...');
  try {
    // Test Microsoft auth initiation
    const response = await fetch(`${BASE_URL}/api/auth/microsoft`, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'Auth-Test/1.0' }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get('location');
      console.log('✅ Microsoft auth redirect initiated');
      console.log('Redirect URL:', location);
      
      if (location && location.includes('login.microsoftonline.com')) {
        console.log('✅ Proper Microsoft OAuth redirect');
        return true;
      } else {
        console.log('❌ Invalid redirect URL');
        return false;
      }
    } else {
      console.log('❌ Microsoft auth initiation failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Microsoft auth test failed:', error.message);
    return false;
  }
}

async function testLoginPage() {
  console.log('\n🔐 Testing Login Page...');
  try {
    const response = await fetch(`${BASE_URL}/login`, {
      method: 'GET',
      headers: { 'User-Agent': 'Auth-Test/1.0' }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    
    if (response.ok) {
      const html = await response.text();
      console.log(`✅ Login page loaded (${html.length} chars)`);
      
      // Check for key elements
      const hasAuthScript = html.includes('auth.util.repl.co');
      const hasGoogleAuth = html.includes('Sign in with Google');
      const hasMicrosoftAuth = html.includes('Sign in with Microsoft');
      
      console.log('Features detected:');
      console.log(`  - Replit Auth Script: ${hasAuthScript ? '✅' : '❌'}`);
      console.log(`  - Google Auth: ${hasGoogleAuth ? '✅' : '❌'}`);
      console.log(`  - Microsoft Auth: ${hasMicrosoftAuth ? '✅' : '❌'}`);
      
      return true;
    } else {
      console.log('❌ Login page failed to load');
      return false;
    }
  } catch (error) {
    console.error('❌ Login page test failed:', error.message);
    return false;
  }
}

async function testProtectedEndpoint() {
  console.log('\n🛡️ Testing Protected Endpoint...');
  try {
    // Test without auth
    console.log('  Testing without authentication...');
    const unauthResponse = await fetch(`${BASE_URL}/api/user/profile`, {
      method: 'GET',
      headers: { 'User-Agent': 'Auth-Test/1.0' }
    });
    
    console.log(`  Unauth Status: ${unauthResponse.status} ${unauthResponse.statusText}`);
    
    // Test with Replit auth headers
    console.log('  Testing with Replit auth headers...');
    const authResponse = await fetch(`${BASE_URL}/api/user/profile`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Auth-Test/1.0',
        'X-Replit-User-Id': 'test-user-456',
        'X-Replit-User-Name': 'Auth Test User',
        'X-Replit-User-Email': 'authtest@example.com'
      }
    });
    
    console.log(`  Auth Status: ${authResponse.status} ${authResponse.statusText}`);
    
    if (authResponse.ok) {
      const profile = await authResponse.json();
      console.log('  ✅ Profile retrieved:', JSON.stringify(profile, null, 4));
      return true;
    } else {
      const error = await authResponse.json().catch(() => ({}));
      console.log('  ❌ Auth failed:', JSON.stringify(error, null, 4));
      return false;
    }
  } catch (error) {
    console.error('❌ Protected endpoint test failed:', error.message);
    return false;
  }
}

async function testLogoutFlow() {
  console.log('\n🚪 Testing Logout Flow...');
  try {
    const response = await fetch(`${BASE_URL}/api/logout`, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'Auth-Test/1.0' }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.status === 302) {
      const location = response.headers.get('location');
      console.log('✅ Logout redirect initiated');
      console.log('Redirect URL:', location);
      return true;
    } else {
      console.log('❌ Logout failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Logout test failed:', error.message);
    return false;
  }
}

async function testSessionManagement() {
  console.log('\n🍪 Testing Session Management...');
  try {
    // Test session creation
    const response1 = await fetch(`${BASE_URL}/api/me`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Auth-Test/1.0',
        'X-Replit-User-Id': 'session-test-user',
        'X-Replit-User-Name': 'Session Test',
        'X-Replit-User-Email': 'session@example.com'
      }
    });
    
    const cookies = response1.headers.get('set-cookie');
    console.log('Session cookies:', cookies ? 'Present' : 'Not set');
    
    if (response1.ok) {
      console.log('✅ Session handling appears functional');
      return true;
    } else {
      console.log('❌ Session test failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Session management test failed:', error.message);
    return false;
  }
}

async function testAdminEndpoints() {
  console.log('\n👑 Testing Admin Endpoints...');
  try {
    // Test bootstrap admin
    const bootstrapResponse = await fetch(`${BASE_URL}/api/bootstrap-admin`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Auth-Test/1.0',
        'X-Replit-User-Id': 'admin-test-user',
        'X-Replit-User-Name': 'Admin Test',
        'X-Replit-User-Email': 'admin@example.com',
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Bootstrap Status: ${bootstrapResponse.status} ${bootstrapResponse.statusText}`);
    
    if (bootstrapResponse.ok) {
      const result = await bootstrapResponse.json();
      console.log('✅ Bootstrap admin result:', JSON.stringify(result, null, 2));
    } else {
      const error = await bootstrapResponse.json().catch(() => ({}));
      console.log('ℹ️ Bootstrap result:', JSON.stringify(error, null, 2));
    }
    
    return true;
  } catch (error) {
    console.error('❌ Admin endpoints test failed:', error.message);
    return false;
  }
}

async function runComprehensiveAuthTest() {
  console.log('🔐 COMPREHENSIVE AUTHENTICATION SYSTEM TEST');
  console.log('=' .repeat(60));
  
  const results = {
    gateway: false,
    authService: false,
    authMethods: false,
    meEndpoint: false,
    replitHeaders: false,
    googleAuth: false,
    microsoftAuth: false,
    loginPage: false,
    protectedEndpoint: false,
    logout: false,
    sessions: false,
    adminEndpoints: false
  };
  
  try {
    // Core service health
    if (tests.gateway) {
      results.gateway = await testWithTimeout(testGatewayHealth);
    }
    
    if (tests.authService) {
      results.authService = await testWithTimeout(testAuthServiceHealth);
    }
    
    // Authentication endpoints
    if (tests.endpoints) {
      results.authMethods = await testWithTimeout(testAuthMethods);
      results.meEndpoint = await testWithTimeout(testMeEndpoint);
      results.loginPage = await testWithTimeout(testLoginPage);
      results.protectedEndpoint = await testWithTimeout(testProtectedEndpoint);
      results.logout = await testWithTimeout(testLogoutFlow);
      results.adminEndpoints = await testWithTimeout(testAdminEndpoints);
    }
    
    // Replit authentication
    if (tests.replitAuth) {
      results.replitHeaders = await testWithTimeout(testReplitAuthHeaders);
    }
    
    // OAuth flows
    if (tests.googleAuth) {
      results.googleAuth = await testWithTimeout(testGoogleAuthFlow);
    }
    
    if (tests.microsoftAuth) {
      results.microsoftAuth = await testWithTimeout(testMicrosoftAuthFlow);
    }
    
    // Session management
    if (tests.sessions) {
      results.sessions = await testWithTimeout(testSessionManagement);
    }
    
  } catch (error) {
    console.error('❌ Test suite error:', error.message);
  }
  
  // Summary
  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(40));
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅' : '❌';
    const name = test.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    console.log(`${status} ${name}`);
  });
  
  console.log(`\n🎯 Overall Score: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All authentication tests passed!');
  } else {
    console.log('⚠️ Some authentication issues detected. Check logs above.');
  }
  
  return results;
}

// Run the test
if (require.main === module) {
  runComprehensiveAuthTest()
    .then(results => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { runComprehensiveAuthTest };
