import http from 'http';

// Test configuration
const tests = [
  { name: 'API Gateway Health', url: 'http://localhost:8080/healthz' },
  { name: 'Auth Service Health', url: 'http://localhost:3001/healthz' },
  { name: 'Doc Ingest Health', url: 'http://localhost:3002/healthz' },
  { name: 'Agent Service Health', url: 'http://localhost:3005/healthz' },
  { name: 'Login Endpoint', url: 'http://localhost:8080/login', method: 'POST', data: { email: 'dev@example.com', password: 'dev' } },
  { name: 'User Info Endpoint', url: 'http://localhost:8080/me' },
  { name: 'Agent List', url: 'http://localhost:8080/api/agents' },
];

async function testEndpoint(test, retries = 3) {
  return new Promise((resolve) => {
    const url = new URL(test.url);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: test.method || 'GET',
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    };

    // Add Authorization header for specific tests if token is available
    if (test.name === 'User Info Endpoint' && global.authToken) {
      options.headers['Authorization'] = `Bearer ${global.authToken}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const success = res.statusCode >= 200 && res.statusCode < 400;
        resolve({
          ...test,
          success,
          status: res.statusCode,
          response: data.substring(0, 200)
        });
      });
    });

    req.on('error', async (err) => {
      if (retries > 0 && (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT')) {
        console.log(`   Retrying ${test.name} (${retries} attempts left)...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        const result = await testEndpoint(test, retries - 1);
        resolve(result);
      } else {
        resolve({
          ...test,
          success: false,
          error: err.message
        });
      }
    });

    req.on('timeout', () => {
      req.destroy();
    });

    if (test.data) {
      req.write(JSON.stringify(test.data));
    }

    req.end();
  });
}

async function runTests() {
  console.log('node test-microservices.js');
  console.log('🧪 Running microservices smoke tests...\n');
  console.log('⏳ Waiting for services to start...');

  // Wait for API Gateway to be ready
  let gatewayReady = false;
  for (let i = 0; i < 10; i++) {
    try {
      const result = await testEndpoint({ name: 'Gateway Check', url: 'http://localhost:8080/healthz' }, 0);
      if (result.success) {
        gatewayReady = true;
        console.log('✅ API Gateway is ready!');
        break;
      }
    } catch (e) {
      // Continue waiting
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log(`   Still waiting... (${i + 1}/10)`);
  }

  if (!gatewayReady) {
    console.log('❌ API Gateway not responding after 30 seconds');
    console.log('💡 Make sure the "Microservices Stack" workflow is running');
    return;
  }

  console.log('\n🧪 Running tests...\n');

  for (const test of tests) {
    try {
      const result = await testEndpoint(test);
      const status = result.success ? '✅' : '❌';
      const details = result.success
        ? `(${result.status})`
        : `(${result.status || 'ERROR'}: ${result.error || 'Unknown error'})`;

      console.log(`${status} ${test.name} ${details}`);

      if (result.success && result.response) {
        console.log(`   Response: ${result.response.substring(0, 100)}...`);
      }
      
      // Store auth token if login is successful
      if (test.name === 'Login Endpoint' && result.success) {
        try {
          const responseData = JSON.parse(result.response);
          global.authToken = responseData.accessToken;
        } catch (e) {
          console.log('   Warning: Could not parse response to get auth token.');
        }
      }

    } catch (error) {
      console.log(`❌ ${test.name} (ERROR: ${error.message})`);
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n🏁 Tests completed!');
  console.log('\nNext steps:');
  console.log('1. All services should be running via "Microservices Stack" workflow');
  console.log('2. Test the frontend at http://localhost:3003');  
  console.log('3. Test API Gateway at http://localhost:8080');
}

runTests().catch(console.error);