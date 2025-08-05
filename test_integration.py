
import requests
import json
import time

def test_full_integration():
    main_app_url = "http://0.0.0.0:5000"
    python_backend_url = "http://0.0.0.0:8000"
    
    print("🔄 Testing Full Integration")
    print("=" * 50)
    
    # Test 1: Check both servers are running
    print("\n1. Checking Server Status...")
    try:
        main_response = requests.get(f"{main_app_url}/api/auth/user", timeout=5)
        print(f"   ✅ Main app (port 5000): {main_response.status_code}")
    except Exception as e:
        print(f"   ❌ Main app failed: {e}")
        return
    
    try:
        python_response = requests.get(f"{python_backend_url}/health", timeout=5)
        print(f"   ✅ Python backend (port 8000): {python_response.status_code}")
    except Exception as e:
        print(f"   ❌ Python backend failed: {e}")
        return
    
    # Test 2: Test file upload flow
    print("\n2. Testing File Upload Flow...")
    test_file_content = "This is a test document for integration testing."
    files = {'file': ('integration_test.txt', test_file_content, 'text/plain')}
    headers = {"Authorization": "Bearer dummy-token-for-testing"}
    
    try:
        upload_response = requests.post(
            f"{python_backend_url}/api/python/documents/upload",
            files=files,
            headers=headers,
            timeout=10
        )
        print(f"   📤 Upload test: {upload_response.status_code}")
        if upload_response.status_code == 200:
            print(f"   📝 Response: {upload_response.json()}")
    except Exception as e:
        print(f"   ❌ Upload test failed: {e}")
    
    # Test 3: Test chat functionality
    print("\n3. Testing Chat Integration...")
    chat_data = {"message": "What documents do I have?"}
    
    try:
        chat_response = requests.post(
            f"{python_backend_url}/api/python/chat",
            json=chat_data,
            headers=headers,
            timeout=15
        )
        print(f"   💬 Chat test: {chat_response.status_code}")
        if chat_response.status_code == 200:
            response_data = chat_response.json()
            print(f"   🤖 AI Response: {response_data.get('response', 'No response')[:100]}...")
    except Exception as e:
        print(f"   ❌ Chat test failed: {e}")
    
    print("\n" + "=" * 50)
    print("🎯 Integration Test Complete!")
    print("\n💡 Next Steps:")
    print("   1. Set up real JWT authentication")
    print("   2. Configure OpenAI API key in Secrets")
    print("   3. Test with real document uploads")
    print("   4. Verify database connections")

if __name__ == "__main__":
    test_full_integration()
