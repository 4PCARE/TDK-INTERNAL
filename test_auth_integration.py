
import requests
import json
import time

def test_real_authentication():
    main_app_url = "http://0.0.0.0:5000"
    python_backend_url = "http://0.0.0.0:8000"
    
    print("🔐 Testing Real Authentication Integration")
    print("=" * 60)
    
    # Step 1: Test main app health
    print("\n1. Testing Main App Connection...")
    try:
        health_response = requests.get(f"{main_app_url}/health", timeout=5)
        print(f"   ✅ Main app health: {health_response.status_code}")
    except Exception as e:
        print(f"   ❌ Main app connection failed: {e}")
        return False
    
    # Step 2: Get real JWT token (you'll need to implement this based on your auth system)
    print("\n2. Getting Real JWT Token...")
    print("   📝 Manual Step Required:")
    print("   - Open your browser to http://0.0.0.0:5000")
    print("   - Login to your application")
    print("   - Open browser dev tools (F12)")
    print("   - Go to Application/Storage tab")
    print("   - Find your JWT token (usually in localStorage or cookies)")
    print("   - Copy the token and paste it below")
    
    real_token = input("\n   🔑 Paste your JWT token here: ").strip()
    
    if not real_token:
        print("   ❌ No token provided. Using dummy token for basic testing.")
        real_token = "dummy-token-for-testing"
    
    # Step 3: Test with real token
    print(f"\n3. Testing with {'Real' if real_token != 'dummy-token-for-testing' else 'Dummy'} Token...")
    headers = {"Authorization": f"Bearer {real_token}"}
    
    # Test documents endpoint
    try:
        response = requests.get(f"{python_backend_url}/api/python/documents", headers=headers)
        print(f"   📄 Documents: {response.status_code}")
        if response.status_code == 200:
            docs = response.json()
            print(f"   📊 Found {len(docs)} documents")
        elif response.status_code == 403:
            print("   ⚠️  Authentication failed - token may be invalid or expired")
    except Exception as e:
        print(f"   ❌ Documents test failed: {e}")
    
    # Step 4: Test file upload with real auth
    print(f"\n4. Testing File Upload with Real Auth...")
    test_content = "This is a real authentication test file with important content about testing procedures."
    files = {'file': ('auth_test.txt', test_content, 'text/plain')}
    
    try:
        response = requests.post(
            f"{python_backend_url}/api/python/documents/upload",
            files=files,
            headers=headers,
            timeout=30
        )
        print(f"   📤 Upload: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"   ✅ Success: {result.get('document_id', 'Unknown ID')}")
        else:
            print(f"   ❌ Upload failed: {response.text[:100]}")
    except Exception as e:
        print(f"   ❌ Upload test failed: {e}")
    
    # Step 5: Test chat with real context
    print(f"\n5. Testing AI Chat with Real Context...")
    test_queries = [
        "List all my uploaded documents",
        "What is the content of the most recent document?",
        "Search for documents containing 'test'",
        "Summarize all my documents"
    ]
    
    for query in test_queries:
        print(f"\n   🤔 Query: {query}")
        try:
            response = requests.post(
                f"{python_backend_url}/api/python/chat",
                json={"message": query},
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                ai_response = result.get('response', 'No response')
                print(f"   🤖 AI: {ai_response[:100]}...")
            else:
                print(f"   ❌ Chat failed: {response.status_code}")
        except Exception as e:
            print(f"   ❌ Chat error: {e}")
    
    print("\n" + "=" * 60)
    print("🎯 Authentication Test Complete!")
    return True

if __name__ == "__main__":
    test_real_authentication()
