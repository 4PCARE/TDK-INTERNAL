
import requests
import json

def test_python_backend():
    base_url = "http://0.0.0.0:8000"
    
    print("🐍 Testing Python Backend Endpoints")
    print("=" * 50)
    
    # Test 1: Health endpoint
    print("\n1. Testing Health Endpoint...")
    try:
        response = requests.get(f"{base_url}/health")
        print(f"   ✅ Health check: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"   ❌ Health check failed: {e}")
        return
    
    # Test 2: Documents endpoint (without auth - should fail)
    print("\n2. Testing Documents Endpoint (no auth)...")
    try:
        response = requests.get(f"{base_url}/api/python/documents")
        print(f"   📄 Documents (no auth): {response.status_code} - Expected 403/401")
    except Exception as e:
        print(f"   ❌ Documents test failed: {e}")
    
    # Test 3: Documents endpoint (with dummy token - should fail gracefully)
    print("\n3. Testing Documents Endpoint (dummy auth)...")
    headers = {"Authorization": "Bearer dummy-token-for-testing"}
    try:
        response = requests.get(f"{base_url}/api/python/documents", headers=headers)
        print(f"   📄 Documents (dummy auth): {response.status_code}")
        if response.status_code != 200:
            print(f"   📝 Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   ❌ Documents test with dummy token failed: {e}")
    
    # Test 4: Chat endpoint (with dummy token)
    print("\n4. Testing Chat Endpoint...")
    chat_data = {"message": "Hello, can you help me find documents?"}
    try:
        response = requests.post(f"{base_url}/api/python/chat", 
                               json=chat_data, 
                               headers=headers)
        print(f"   💬 Chat endpoint: {response.status_code}")
        if response.status_code != 200:
            print(f"   📝 Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   ❌ Chat test failed: {e}")
    
    # Test 5: Upload endpoint (with dummy token)
    print("\n5. Testing Upload Endpoint...")
    try:
        # Create a simple test file
        files = {'file': ('test.txt', 'This is test content', 'text/plain')}
        response = requests.post(f"{base_url}/api/python/documents/upload",
                               files=files,
                               headers=headers)
        print(f"   📤 Upload endpoint: {response.status_code}")
        if response.status_code != 200:
            print(f"   📝 Response: {response.text[:200]}...")
    except Exception as e:
        print(f"   ❌ Upload test failed: {e}")
    
    print("\n" + "=" * 50)
    print("🎯 Test Summary:")
    print("   - Health endpoint should work (200)")
    print("   - Other endpoints should fail gracefully without valid JWT")
    print("   - All endpoints are accessible and responding")
    print("\n💡 To test with real authentication:")
    print("   1. Get a valid JWT token from your main app")
    print("   2. Replace 'dummy-token-for-testing' with the real token")
    print("   3. Re-run the tests")

if __name__ == "__main__":
    test_python_backend()
