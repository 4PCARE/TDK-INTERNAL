
import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { useToast } from '../hooks/use-toast';

interface TestResult {
  success: boolean;
  data: any;
  error?: string;
  timestamp: string;
}

export function PythonBackendTest() {
  const [isTestingPython, setIsTestingPython] = useState(false);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [chatMessage, setChatMessage] = useState('What documents do I have?');
  const [searchQuery, setSearchQuery] = useState('machine learning');
  const { toast } = useToast();

  const makeRequest = async (endpoint: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('token');
    
    return fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });
  };

  const runTest = async (testName: string, testFn: () => Promise<any>) => {
    setIsTestingPython(true);
    try {
      const startTime = Date.now();
      const result = await testFn();
      const endTime = Date.now();
      
      setResults(prev => ({
        ...prev,
        [testName]: {
          success: true,
          data: result,
          timestamp: new Date().toLocaleTimeString(),
        }
      }));
      
      toast({
        title: `✅ ${testName} Success`,
        description: `Completed in ${endTime - startTime}ms`,
      });
    } catch (error: any) {
      setResults(prev => ({
        ...prev,
        [testName]: {
          success: false,
          data: null,
          error: error.message,
          timestamp: new Date().toLocaleTimeString(),
        }
      }));
      
      toast({
        title: `❌ ${testName} Failed`,
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsTestingPython(false);
    }
  };

  const testPythonHealth = () => runTest('Python Health', async () => {
    const response = await makeRequest('/api/python/health');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });

  const testPythonDocuments = () => runTest('Python Documents', async () => {
    const response = await makeRequest('/api/python/documents');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });

  const testPythonChat = () => runTest('Python Chat', async () => {
    const response = await makeRequest('/api/python/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: chatMessage,
        search_documents: true,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });

  const testPythonSearch = () => runTest('Python Search', async () => {
    const response = await makeRequest('/api/python/search', {
      method: 'POST',
      body: JSON.stringify({
        query: searchQuery,
        search_type: 'hybrid',
        limit: 5,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });

  const testPythonStats = () => runTest('Python Stats', async () => {
    const response = await makeRequest('/api/python/stats');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });

  const runAllTests = async () => {
    await testPythonHealth();
    await new Promise(resolve => setTimeout(resolve, 500));
    await testPythonDocuments();
    await new Promise(resolve => setTimeout(resolve, 500));
    await testPythonChat();
    await new Promise(resolve => setTimeout(resolve, 500));
    await testPythonSearch();
    await new Promise(resolve => setTimeout(resolve, 500));
    await testPythonStats();
  };

  const clearResults = () => {
    setResults({});
    toast({
      title: "Results Cleared",
      description: "All test results have been cleared",
    });
  };

  const ResultCard = ({ testName, result }: { testName: string; result?: TestResult }) => (
    <Card className={`mb-4 ${result?.success === false ? 'border-red-200' : result?.success ? 'border-green-200' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          {testName}
          {result && (
            <Badge variant={result.success ? "default" : "destructive"}>
              {result.success ? "✅ PASS" : "❌ FAIL"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {result ? (
          <div className="space-y-2">
            <div className="text-sm text-gray-500">
              {result.timestamp}
            </div>
            {result.success ? (
              <pre className="bg-green-50 p-3 rounded text-xs overflow-auto max-h-40">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            ) : (
              <div className="bg-red-50 p-3 rounded text-sm text-red-700">
                {result.error}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-sm">No results yet</div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">🐍 Python Backend Integration Test</h1>
        <p className="text-gray-600">
          Test the integration between the main Node.js app and Python backend services.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>🎮 Test Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Chat Message</label>
              <Textarea
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Enter message for AI chat test..."
                className="min-h-[60px]"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Search Query</label>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter search query..."
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-2">
              <Button 
                onClick={testPythonHealth}
                disabled={isTestingPython}
                variant="outline"
              >
                Health
              </Button>
              <Button 
                onClick={testPythonDocuments}
                disabled={isTestingPython}
                variant="outline"
              >
                Documents
              </Button>
              <Button 
                onClick={testPythonChat}
                disabled={isTestingPython}
                variant="outline"
              >
                Chat
              </Button>
              <Button 
                onClick={testPythonSearch}
                disabled={isTestingPython}
                variant="outline"
              >
                Search
              </Button>
              <Button 
                onClick={testPythonStats}
                disabled={isTestingPython}
                variant="outline"
              >
                Stats
              </Button>
              <Button 
                onClick={clearResults}
                disabled={isTestingPython}
                variant="outline"
              >
                Clear
              </Button>
            </div>

            <Separator />

            <Button 
              onClick={runAllTests}
              disabled={isTestingPython}
              className="w-full"
              size="lg"
            >
              {isTestingPython ? "Running Tests..." : "🚀 Run All Tests"}
            </Button>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle>📊 Test Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Total Tests:</span>
                <Badge variant="outline">{Object.keys(results).length}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Passed:</span>
                <Badge variant="default">
                  {Object.values(results).filter(r => r.success).length}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Failed:</span>
                <Badge variant="destructive">
                  {Object.values(results).filter(r => !r.success).length}
                </Badge>
              </div>
              <Separator />
              <div className="text-sm text-gray-600">
                {isTestingPython ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    Testing in progress...
                  </div>
                ) : (
                  "Ready to test Python backend integration"
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ResultCard testName="🏥 Python Health Check" result={results['Python Health']} />
        <ResultCard testName="📄 Python Documents" result={results['Python Documents']} />
        <ResultCard testName="💬 Python Chat" result={results['Python Chat']} />
        <ResultCard testName="🔍 Python Search" result={results['Python Search']} />
        <ResultCard testName="📊 Python Stats" result={results['Python Stats']} />
      </div>
    </div>
  );
}

export default PythonBackendTest;
