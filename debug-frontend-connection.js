
#!/usr/bin/env node

const http = require('http');
const https = require('https');

// Test configuration
const tests = [
  {
    name: 'Frontend Direct (Port 5000)',
    url: 'http://localhost:5000',
    expected: 'React app or Vite dev server'
  },
  {
    name: 'Modern Server Direct (Port 4000)', 
    url: 'http://localhost:4000',
    expected: 'Modern server JSON response'
  },
  {
    name: 'Modern Server Health Check',
    url: 'http://localhost:4000/healthz',
    expected: 'Health check response'
  },
  {
    name: 'API Gateway Direct (Port 8080)',
    url: 'http://localhost:8080/healthz', 
    expected: 'API Gateway health'
  },
  {
    name: 'Modern Server Proxy Test',
    url: 'http://localhost:4000/some-frontend-route',
    expected: 'Should proxy to frontend'
  }
];

async function testEndpoint(test) {
  return new Promise((resolve) => {
    const url = new URL(test.url);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      timeout: 5000,
      headers: {
        'User-Agent': 'Frontend-Debug-Test/1.0'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          test: test.name,
          status: res.statusCode,
          headers: res.headers,
          bodyPreview: data.substring(0, 200),
          success: res.statusCode < 400
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        test: test.name,
        status: 'ERROR',
        error: err.message,
        success: false
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        test: test.name,
        status: 'TIMEOUT',
        error: 'Request timed out after 5 seconds',
        success: false
      });
    });

    req.end();
  });
}

async function runAllTests() {
  console.log('🔍 Running Frontend Connection Diagnostics...\n');
  
  const results = [];
  
  for (const test of tests) {
    console.log(`Testing: ${test.name}...`);
    const result = await testEndpoint(test);
    results.push(result);
    
    if (result.success) {
      console.log(`✅ ${test.name}: Status ${result.status}`);
    } else {
      console.log(`❌ ${test.name}: ${result.error || `Status ${result.status}`}`);
    }
    
    if (result.bodyPreview) {
      console.log(`   Preview: ${result.bodyPreview.replace(/\n/g, ' ')}`);
    }
    console.log('');
  }
  
  // Summary
  console.log('📊 DIAGNOSTIC SUMMARY:');
  console.log('='.repeat(50));
  
  const frontendDirect = results.find(r => r.test.includes('Frontend Direct'));
  const modernServer = results.find(r => r.test.includes('Modern Server Direct'));
  const proxyTest = results.find(r => r.test.includes('Proxy Test'));
  
  if (!frontendDirect.success) {
    console.log('🚨 ISSUE: Frontend (port 5000) is not responding');
    console.log('   - Check if Vite dev server is running');
    console.log('   - Check for React app compilation errors');
    console.log('   - Verify port 5000 is not blocked');
  }
  
  if (!modernServer.success) {
    console.log('🚨 ISSUE: Modern Server (port 4000) is not responding');
    console.log('   - Check if modern-server.ts is running');
    console.log('   - Check for TypeScript compilation errors');
  }
  
  if (frontendDirect.success && modernServer.success && !proxyTest.success) {
    console.log('🚨 ISSUE: Proxy configuration problem');
    console.log('   - Modern server can\'t reach frontend');
    console.log('   - Check proxy target configuration');
  }
  
  if (frontendDirect.success && proxyTest.success) {
    console.log('✅ All components working - issue might be in React routing');
    console.log('   - Check React Router configuration');
    console.log('   - Verify Landing component is exported correctly');
  }
  
  console.log('\n🔧 NEXT STEPS:');
  if (!frontendDirect.success) {
    console.log('1. Check the Vite console output for errors');
    console.log('2. Try accessing http://localhost:5000 directly in browser');
    console.log('3. Check if React app builds successfully');
  } else {
    console.log('1. Check browser Network tab for failed requests');
    console.log('2. Check React Router configuration in App.tsx');
    console.log('3. Verify Landing component exists and exports correctly');
  }
}

// Run the tests
runAllTests().catch(console.error);
