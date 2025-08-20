
import http from 'http';
import https from 'https';

console.log('🔍 COMPREHENSIVE AI-KMS DIAGNOSTIC\n');

async function testEndpoint(options, description) {
  return new Promise((resolve) => {
    const protocol = options.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`✅ ${description}: ${res.statusCode} ${res.statusMessage}`);
        if (res.statusCode === 200) {
          console.log(`   Response preview: ${data.substring(0, 100)}...`);
        }
        resolve({ status: res.statusCode, data: data.substring(0, 200) });
      });
    });
    
    req.on('error', (err) => {
      console.log(`❌ ${description}: ERROR - ${err.message}`);
      resolve({ status: 'ERROR', error: err.message });
    });
    
    req.setTimeout(5000, () => {
      console.log(`⏰ ${description}: TIMEOUT`);
      req.destroy();
      resolve({ status: 'TIMEOUT' });
    });
    
    req.end();
  });
}

async function runComprehensiveDiagnostic() {
  console.log('=== INTERNAL SERVICE TESTS ===');
  
  const internalTests = [
    { host: '0.0.0.0', port: 5000, path: '/', desc: 'Frontend (Port 5000)' },
    { host: '0.0.0.0', port: 4000, path: '/', desc: 'Modern Server (Port 4000)' },
    { host: '0.0.0.0', port: 8080, path: '/healthz', desc: 'API Gateway Health' },
    { host: '0.0.0.0', port: 3001, path: '/healthz', desc: 'Auth Service' },
    { host: '0.0.0.0', port: 3002, path: '/healthz', desc: 'Doc Ingest Service' },
    { host: '0.0.0.0', port: 3005, path: '/healthz', desc: 'Agent Service' },
    { host: '0.0.0.0', port: 3006, path: '/healthz', desc: 'Search Service' },
    { host: '0.0.0.0', port: 3009, path: '/healthz', desc: 'Embedding Service' }
  ];
  
  for (const test of internalTests) {
    await testEndpoint({
      hostname: test.host,
      port: test.port,
      path: test.path,
      method: 'GET'
    }, test.desc);
  }
  
  console.log('\n=== EXTERNAL ACCESS TESTS ===');
  
  // Get the actual Replit preview URL
  const replitHost = process.env.REPLIT_DEV_DOMAIN || 'unknown';
  
  if (replitHost !== 'unknown') {
    console.log(`🌐 Testing external access via: https://${replitHost}`);
    
    await testEndpoint({
      hostname: replitHost,
      port: 443,
      path: '/',
      method: 'GET',
      protocol: 'https:'
    }, 'Replit Preview URL (/)');
    
    await testEndpoint({
      hostname: replitHost,
      port: 443,
      path: '/dashboard',
      method: 'GET',
      protocol: 'https:'
    }, 'Replit Preview URL (/dashboard)');
  } else {
    console.log('❓ Could not determine Replit preview URL');
  }
  
  console.log('\n=== PROXY CHAIN TEST ===');
  
  // Test the proxy chain: External -> Modern Server -> Frontend
  console.log('Testing proxy chain behavior...');
  
  await testEndpoint({
    hostname: '0.0.0.0',
    port: 4000,
    path: '/api/healthz',
    method: 'GET'
  }, 'Modern Server -> API Gateway Proxy');
  
  await testEndpoint({
    hostname: '0.0.0.0',
    port: 4000,
    path: '/dashboard',
    method: 'GET'
  }, 'Modern Server -> Frontend Proxy');
  
  console.log('\n=== ROUTING ANALYSIS ===');
  
  // Check what the frontend is actually serving
  const frontendResult = await testEndpoint({
    hostname: '0.0.0.0',
    port: 5000,
    path: '/',
    method: 'GET'
  }, 'Direct Frontend Root');
  
  if (frontendResult.data && frontendResult.data.includes('DOCTYPE html')) {
    console.log('✅ Frontend is serving HTML correctly');
  } else {
    console.log('❌ Frontend is NOT serving HTML correctly');
  }
  
  console.log('\n=== ENVIRONMENT INFO ===');
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
  console.log(`REPLIT_DEV_DOMAIN: ${process.env.REPLIT_DEV_DOMAIN || 'undefined'}`);
  console.log(`Current working directory: ${process.cwd()}`);
  
  console.log('\n=== RECOMMENDATIONS ===');
  console.log('1. If external tests pass but you see "Cannot GET /", clear browser cache');
  console.log('2. Try accessing different routes: /dashboard, /documents');
  console.log('3. Check browser console for JavaScript errors');
  console.log('4. Ensure you\'re using the correct Replit preview URL');
}

runComprehensiveDiagnostic().catch(console.error);
