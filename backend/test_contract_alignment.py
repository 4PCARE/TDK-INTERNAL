"""
Test script to validate frontend-backend API contract alignment
Tests all critical endpoints with expected request/response formats
"""

import asyncio
import httpx
import json
from typing import Dict, Any, List
from datetime import datetime

class ContractTester:
    def __init__(self, base_url: str = "http://0.0.0.0:8000"):
        self.base_url = base_url
        self.test_token = "test-token-123"
        self.results = []
        
    async def test_endpoint(self, method: str, endpoint: str, data: Dict[str, Any] = None, params: Dict[str, str] = None) -> Dict[str, Any]:
        """Test a single endpoint and validate response"""
        headers = {"Authorization": f"Bearer {self.test_token}"}
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                if method.upper() == "GET":
                    response = await client.get(f"{self.base_url}{endpoint}", headers=headers, params=params)
                elif method.upper() == "POST":
                    headers["Content-Type"] = "application/json"
                    response = await client.post(f"{self.base_url}{endpoint}", headers=headers, json=data)
                else:
                    raise ValueError(f"Unsupported method: {method}")
                
                result = {
                    "endpoint": endpoint,
                    "method": method,
                    "status_code": response.status_code,
                    "success": 200 <= response.status_code < 300,
                    "response_time": None,
                    "content_type": response.headers.get("content-type", ""),
                    "response_size": len(response.content),
                    "error": None,
                    "response_structure": None,
                    "frontend_compatible": False
                }
                
                # Try to parse JSON response
                try:
                    json_response = response.json()
                    result["response_structure"] = self._analyze_structure(json_response)
                    result["frontend_compatible"] = self._validate_frontend_compatibility(endpoint, json_response)
                except:
                    result["error"] = "Non-JSON response"
                
                return result
                
        except Exception as e:
            return {
                "endpoint": endpoint,
                "method": method,
                "success": False,
                "error": str(e),
                "frontend_compatible": False
            }
    
    def _analyze_structure(self, obj: Any, max_depth: int = 3) -> Dict[str, Any]:
        """Analyze the structure of a response object"""
        if max_depth <= 0:
            return "max_depth_reached"
            
        if isinstance(obj, dict):
            return {key: self._analyze_structure(value, max_depth - 1) for key, value in obj.items()}
        elif isinstance(obj, list):
            if obj:
                return [self._analyze_structure(obj[0], max_depth - 1)]
            return []
        else:
            return type(obj).__name__
    
    def _validate_frontend_compatibility(self, endpoint: str, response: Any) -> bool:
        """Validate if response matches frontend expectations"""
        
        if "/chat" in endpoint:
            if isinstance(response, dict):
                required_fields = ["response"]
                optional_fields = ["sources", "search_performed", "documents_found"]
                return all(field in response for field in required_fields)
        
        elif "/documents" in endpoint and endpoint.endswith("/documents"):
            if isinstance(response, list):
                if response:
                    doc = response[0]
                    required_fields = ["id", "name", "createdAt"]
                    frontend_fields = ["fileSize", "aiCategory"]  # camelCase expected
                    return (all(field in doc for field in required_fields) and 
                           any(field in doc for field in frontend_fields))
                return True  # Empty array is valid
        
        elif "/search" in endpoint:
            if isinstance(response, (list, dict)):
                if isinstance(response, dict):
                    return "results" in response or "query" in response
                return True  # Array of results is also valid
        
        return False
    
    async def run_comprehensive_tests(self) -> List[Dict[str, Any]]:
        """Run all critical endpoint tests"""
        
        tests = [
            # Health check
            ("GET", "/health", None, None),
            
            # Document endpoints
            ("GET", "/api/python/documents", None, None),
            ("GET", "/api/python/documents/search", None, {"query": "test", "type": "keyword"}),
            
            # Chat endpoints  
            ("POST", "/api/python/chat", {
                "message": "Hello, how are you?",
                "conversation_history": [],
                "search_documents": True
            }, None),
            ("POST", "/api/python/chat/message", {
                "message": "Test message"
            }, None),
            
            # Search endpoint
            ("POST", "/api/python/search", {
                "query": "test query",
                "search_type": "hybrid",
                "limit": 5
            }, None),
            
            # Stats endpoint
            ("GET", "/api/python/stats", None, None)
        ]
        
        self.results = []
        for method, endpoint, data, params in tests:
            print(f"Testing {method} {endpoint}...")
            result = await self.test_endpoint(method, endpoint, data, params)
            self.results.append(result)
            
            # Print immediate feedback
            status = "✅ PASS" if result["success"] and result["frontend_compatible"] else "❌ FAIL"
            print(f"  {status} - Status: {result.get('status_code', 'ERROR')}, Compatible: {result['frontend_compatible']}")
            
            if result.get("error"):
                print(f"    Error: {result['error']}")
        
        return self.results
    
    def generate_report(self) -> str:
        """Generate a comprehensive test report"""
        
        if not self.results:
            return "No test results available"
        
        passed = sum(1 for r in self.results if r["success"] and r["frontend_compatible"])
        total = len(self.results)
        
        report = f"""
# API Contract Alignment Test Report
Generated: {datetime.now().isoformat()}

## Summary
- **Total Tests**: {total}
- **Passed**: {passed}
- **Failed**: {total - passed}
- **Success Rate**: {(passed/total)*100:.1f}%

## Detailed Results

"""
        
        for result in self.results:
            status_icon = "✅" if result["success"] and result["frontend_compatible"] else "❌"
            
            report += f"""
### {status_icon} {result['method']} {result['endpoint']}
- **Status Code**: {result.get('status_code', 'ERROR')}
- **Frontend Compatible**: {result['frontend_compatible']}
- **Response Size**: {result.get('response_size', 0)} bytes
"""
            
            if result.get("error"):
                report += f"- **Error**: {result['error']}\n"
            
            if result.get("response_structure"):
                report += f"- **Response Structure**: {json.dumps(result['response_structure'], indent=2)}\n"
        
        # Add recommendations
        failed_tests = [r for r in self.results if not (r["success"] and r["frontend_compatible"])]
        
        if failed_tests:
            report += "\n## Recommendations\n\n"
            
            for test in failed_tests:
                endpoint = test['endpoint']
                if "/chat" in endpoint:
                    report += f"- **{endpoint}**: Ensure response contains 'response' field and optional 'sources', 'search_performed', 'documents_found' fields\n"
                elif "/documents" in endpoint:
                    report += f"- **{endpoint}**: Use camelCase field names (createdAt, fileSize, aiCategory) for frontend compatibility\n"
                elif "/search" in endpoint:
                    report += f"- **{endpoint}**: Return either array of results or object with 'results' field\n"
        
        return report

async def main():
    """Run the contract alignment tests"""
    print("🔥 Starting API Contract Alignment Tests")
    print("=" * 50)
    
    tester = ContractTester()
    results = await tester.run_comprehensive_tests()
    
    print("\n" + "=" * 50)
    print("📊 Generating Report...")
    
    report = tester.generate_report()
    
    # Save report to file
    with open("contract_test_report.md", "w") as f:
        f.write(report)
    
    print("\n📋 Report saved to: contract_test_report.md")
    print("\n" + report)

if __name__ == "__main__":
    asyncio.run(main())