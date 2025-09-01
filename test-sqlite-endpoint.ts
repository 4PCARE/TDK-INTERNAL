import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TestResult {
  endpoint: string;
  success: boolean;
  status?: number;
  data?: any;
  error?: string;
  isHtml?: boolean;
}

async function makeAuthenticatedRequest(endpoint: string, options: any = {}): Promise<TestResult> {
  try {
    // Add test bypass header for authentication with multiple formats
    const authHeaders = [
      '-H "Content-Type: application/json"',
      '-H "Accept: application/json"',
      '-H "X-Test-Bypass: allow-sqlite-testing"',
      '-H "x-test-bypass: allow-sqlite-testing"'
    ].join(' ');

    const curlCommand = `curl -s -w "HTTPSTATUS:%{http_code}" ${authHeaders} ${options.method ? `-X ${options.method}` : ''} ${options.data ? `-d '${JSON.stringify(options.data)}'` : ''} "http://localhost:5000${endpoint}"`;

    console.log(`🔍 Testing: ${endpoint}`);
    console.log(`📤 Command: ${curlCommand}`);
    console.log(`🔍 Headers being sent: X-Test-Bypass and x-test-bypass both with 'allow-sqlite-testing'`);

    const { stdout, stderr } = await execAsync(curlCommand);

    if (stderr) {
      console.log(`⚠️  stderr: ${stderr}`);
    }

    // Parse response
    const parts = stdout.split('HTTPSTATUS:');
    const responseBody = parts[0];
    const statusCode = parseInt(parts[1] || '0');

    console.log(`📥 Status: ${statusCode}`);
    console.log(`📥 Response body: ${responseBody.substring(0, 200)}${responseBody.length > 200 ? '...' : ''}`);

    // Check if response is HTML (Vite error page)
    const isHtml = responseBody.trim().startsWith('<!DOCTYPE html') || responseBody.includes('<html');

    if (isHtml) {
      console.log(`🚨 HTML Response detected - likely Vite error page`);
      return {
        endpoint,
        success: false,
        status: statusCode,
        data: responseBody,
        error: 'HTML response (Vite error page)',
        isHtml: true
      };
    }

    // Try to parse JSON
    let parsedData;
    try {
      parsedData = JSON.parse(responseBody);
    } catch (e) {
      console.log(`❌ Failed to parse JSON response`);
      return {
        endpoint,
        success: false,
        status: statusCode,
        data: responseBody,
        error: 'Invalid JSON response'
      };
    }

    const isSuccess = statusCode >= 200 && statusCode < 300;
    console.log(`${isSuccess ? '✅' : '❌'} ${endpoint}: ${statusCode} - ${isSuccess ? 'SUCCESS' : 'FAILED'}`);
    console.log(`📊 Response data:`, JSON.stringify(parsedData, null, 2));

    return {
      endpoint,
      success: isSuccess,
      status: statusCode,
      data: parsedData
    };

  } catch (error) {
    console.log(`❌ Network error for ${endpoint}:`, error);
    return {
      endpoint,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function testSQLiteEndpoints() {
  console.log('🧪 Testing SQLite existing-files endpoint (TypeScript)...\n');

  const results: TestResult[] = [];

  // Test 1: existing-files endpoint
  console.log('1. Testing /api/sqlite/existing-files...');
  const existingFilesResult = await makeAuthenticatedRequest('/api/sqlite/existing-files');
  results.push(existingFilesResult);

  // Test 2: analyze-file endpoint (should fail without file path)
  console.log('\n2. Testing /api/sqlite/analyze-file (without file path)...');
  const analyzeFileResult = await makeAuthenticatedRequest('/api/sqlite/analyze-file', {
    method: 'POST',
    data: {}
  });
  results.push(analyzeFileResult);

  // Test 3: create-database endpoint (should fail without required fields)
  console.log('\n3. Testing /api/sqlite/create-database (without required fields)...');
  const createDbResult = await makeAuthenticatedRequest('/api/sqlite/create-database', {
    method: 'POST',
    data: {}
  });
  results.push(createDbResult);

  // Test 4: test-query endpoint (should fail without required fields)
  console.log('\n4. Testing /api/sqlite/test-query (without required fields)...');
  const testQueryResult = await makeAuthenticatedRequest('/api/sqlite/test-query', {
    method: 'POST',
    data: {}
  });
  results.push(testQueryResult);

  // Test 5: Check server logs for any authentication issues
  console.log('\n5. Testing server authentication status...');
  const authTestResult = await makeAuthenticatedRequest('/api/auth/user');
  results.push(authTestResult);

  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const htmlResponses = results.filter(r => r.isHtml).length;

  console.log('\n📊 Test Summary:');
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`🚨 HTML Responses: ${htmlResponses}`);

  if (htmlResponses > 0) {
    console.log('\n🔍 HTML Response Analysis:');
    results.filter(r => r.isHtml).forEach(result => {
      console.log(`📄 ${result.endpoint}: Got HTML instead of JSON`);
      console.log(`   This usually means the route isn't properly registered or there's a server error`);
    });
  }

  // Check if any endpoints returned proper JSON
  const jsonResponses = results.filter(r => !r.isHtml && r.data && typeof r.data === 'object');
  if (jsonResponses.length > 0) {
    console.log('\n📈 Successful JSON Responses:');
    jsonResponses.forEach(result => {
      console.log(`✅ ${result.endpoint}:`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Data keys: ${Object.keys(result.data).join(', ')}`);
    });
  }

  console.log('\n✅ SQLite endpoint test completed');
}

// Run the test
testSQLiteEndpoints().catch(console.error);