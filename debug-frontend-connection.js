
import http from 'http';

console.log('🔍 Testing all services...\n');

function testService(host, port, path = '/') {
  return new Promise((resolve) => {
    const options = {
      hostname: host,
      port: port,
      path: path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ 
          success: true, 
          status: res.statusCode, 
          data: data.substring(0, 200) + (data.length > 200 ? '...' : '')
        });
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    req.end();
  });
}

async function runDiagnostics() {
  const tests = [
    { name: 'Frontend Direct (Port 5000)', host: '0.0.0.0', port: 5000 },
    { name: 'Modern Server Direct (Port 4000)', host: '0.0.0.0', port: 4000 },
    { name: 'Health Check', host: '0.0.0.0', port: 4000, path: '/healthz' },
    { name: 'API Gateway (Port 8080)', host: '0.0.0.0', port: 8080, path: '/healthz' }
  ];

  for (const test of tests) {
    console.log(`Testing ${test.name}...`);
    const result = await testService(test.host, test.port, test.path);

    if (result.success) {
      console.log(`✅ ${test.name}: OK (Status: ${result.status})`);
      if (result.data) {
        console.log(`   Response preview: ${result.data}`);
      }
    } else {
      console.log(`❌ ${test.name}: FAILED - ${result.error}`);
    }
    console.log('');
  }
}

runDiagnostics().catch(console.error);
