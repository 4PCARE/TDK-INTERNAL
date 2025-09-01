
import axios, { AxiosResponse, AxiosError } from 'axios';

interface ExistingFile {
  id: string;
  name: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
  mimeType: string;
}

interface ErrorResponse {
  message: string;
  error?: string;
}

interface TestResult {
  endpoint: string;
  status: number;
  success: boolean;
  data?: any;
  error?: string;
  contentType?: string;
}

const BASE_URL = 'http://localhost:5000';

class SQLiteEndpointTester {
  private authToken: string | null = null;

  async testSQLiteExistingFilesEndpoint(): Promise<void> {
    console.log('🧪 Testing SQLite existing-files endpoint (TypeScript)...\n');

    const results: TestResult[] = [];

    try {
      // Test 1: Check endpoint without authentication
      console.log('1. Testing without authentication...');
      const unauthResult = await this.testEndpoint('/api/sqlite/existing-files', 'GET');
      results.push(unauthResult);
      
      if (unauthResult.status === 401) {
        console.log('✅ Correctly returns 401 for unauthenticated requests');
      } else if (unauthResult.contentType?.includes('text/html')) {
        console.log('❌ Getting HTML response - likely Vite catch-all route issue');
      }

      // Test 2: Check server health
      console.log('\n2. Testing server health...');
      const healthResult = await this.testEndpoint('/api/health', 'GET');
      results.push(healthResult);

      // Test 3: Test with mock authentication (if you have a test user)
      console.log('\n3. Testing with authentication...');
      // You would need to implement actual auth here
      // For now, let's test the route registration
      
      // Test 4: Check route registration
      console.log('\n4. Testing route registration...');
      const routes = [
        '/api/auth/user',
        '/api/database-connections',
        '/api/sqlite/existing-files',
        '/api/sqlite/analyze-file',
        '/api/sqlite/create-database',
        '/api/sqlite/test-query'
      ];

      for (const route of routes) {
        const result = await this.testEndpoint(route, 'GET');
        results.push(result);
        
        if (result.contentType?.includes('text/html')) {
          console.log(`🚨 ${route}: Getting HTML instead of JSON - route not properly registered`);
        } else {
          console.log(`✅ ${route}: Proper API response (${result.status})`);
        }
      }

      // Test 5: Test with proper headers
      console.log('\n5. Testing with proper API headers...');
      const headerResult = await this.testWithHeaders('/api/sqlite/existing-files');
      results.push(headerResult);

      // Summary
      console.log('\n📊 Test Summary:');
      this.printSummary(results);

    } catch (error) {
      console.error('❌ Test script error:', error);
    }
  }

  private async testEndpoint(endpoint: string, method: 'GET' | 'POST' = 'GET'): Promise<TestResult> {
    try {
      const response: AxiosResponse = await axios({
        method,
        url: `${BASE_URL}${endpoint}`,
        timeout: 5000,
        validateStatus: () => true, // Accept all status codes
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      return {
        endpoint,
        status: response.status,
        success: response.status < 400,
        data: response.data,
        contentType: response.headers['content-type']
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        endpoint,
        status: axiosError.response?.status || 0,
        success: false,
        error: axiosError.message,
        contentType: axiosError.response?.headers['content-type']
      };
    }
  }

  private async testWithHeaders(endpoint: string): Promise<TestResult> {
    try {
      const response = await axios.get(`${BASE_URL}${endpoint}`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'SQLite-Test-Client/1.0',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 5000,
        validateStatus: () => true
      });

      console.log(`Headers test - Status: ${response.status}, Content-Type: ${response.headers['content-type']}`);
      
      if (response.headers['content-type']?.includes('text/html')) {
        console.log('📄 HTML Response detected - first 200 chars:');
        console.log(typeof response.data === 'string' 
          ? response.data.substring(0, 200) 
          : JSON.stringify(response.data).substring(0, 200)
        );
      }

      return {
        endpoint,
        status: response.status,
        success: response.status < 400,
        data: response.data,
        contentType: response.headers['content-type']
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        endpoint,
        status: axiosError.response?.status || 0,
        success: false,
        error: axiosError.message,
        contentType: axiosError.response?.headers['content-type']
      };
    }
  }

  private printSummary(results: TestResult[]): void {
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    const htmlResponses = results.filter(r => r.contentType?.includes('text/html')).length;

    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`🚨 HTML Responses: ${htmlResponses}`);
    
    if (htmlResponses > 0) {
      console.log('\n💡 Recommendations:');
      console.log('   - Check if Express routes are properly registered');
      console.log('   - Verify the SQLite routes are imported in server/index.ts');
      console.log('   - Ensure the server is running on the correct port');
      console.log('   - Check for middleware conflicts');
    }
  }

  // Method to test with authentication (once you have auth working)
  async testWithAuth(userToken: string): Promise<void> {
    this.authToken = userToken;
    
    try {
      const response = await axios.get(`${BASE_URL}/api/sqlite/existing-files`, {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      console.log('🔐 Authenticated test result:');
      console.log(`Status: ${response.status}`);
      console.log(`Files found: ${Array.isArray(response.data) ? response.data.length : 'N/A'}`);
      
      if (Array.isArray(response.data)) {
        response.data.forEach((file: ExistingFile, index: number) => {
          console.log(`  ${index + 1}. ${file.name} (${file.fileSize} bytes)`);
        });
      }
    } catch (error) {
      console.error('🔐 Authenticated test failed:', error);
    }
  }
}

// Run the tests
async function runTests(): Promise<void> {
  const tester = new SQLiteEndpointTester();
  await tester.testSQLiteExistingFilesEndpoint();
  
  // Uncomment and provide a valid token to test authentication
  // await tester.testWithAuth('your-jwt-token-here');
}

runTests().then(() => {
  console.log('\n✅ SQLite endpoint test completed');
  process.exit(0);
}).catch((error: Error) => {
  console.error('💥 Test script failed:', error.message);
  process.exit(1);
});
