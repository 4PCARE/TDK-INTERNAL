
import requests
import json

def test_edge_cases():
    base_url = "http://0.0.0.0:8000"
    headers = {"Authorization": "Bearer dummy-token-for-testing"}
    
    print("🧪 Edge Cases and Error Handling Testing")
    print("=" * 55)
    
    # Test 1: Invalid authentication
    print("\n1. Testing Invalid Authentication...")
    invalid_headers = {"Authorization": "Bearer invalid-token-123"}
    try:
        response = requests.get(f"{base_url}/api/python/documents", headers=invalid_headers)
        print(f"   🔒 Invalid auth: {response.status_code} (expected 401/403)")
    except Exception as e:
        print(f"   ❌ Auth test failed: {e}")
    
    # Test 2: Missing authentication
    print("\n2. Testing Missing Authentication...")
    try:
        response = requests.get(f"{base_url}/api/python/documents")
        print(f"   🚫 No auth: {response.status_code} (expected 401/403)")
    except Exception as e:
        print(f"   ❌ No auth test failed: {e}")
    
    # Test 3: Invalid file uploads
    print("\n3. Testing Invalid File Uploads...")
    
    # Empty file
    try:
        files = {'file': ('empty.txt', '', 'text/plain')}
        response = requests.post(f"{base_url}/api/python/documents/upload", 
                               files=files, headers=headers)
        print(f"   📄 Empty file: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Empty file test failed: {e}")
    
    # Invalid file type
    try:
        files = {'file': ('test.exe', 'binary content', 'application/octet-stream')}
        response = requests.post(f"{base_url}/api/python/documents/upload", 
                               files=files, headers=headers)
        print(f"   🔧 Invalid type: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Invalid file type test failed: {e}")
    
    # Test 4: Invalid chat messages
    print("\n4. Testing Invalid Chat Messages...")
    
    # Empty message
    try:
        response = requests.post(f"{base_url}/api/python/chat", 
                               json={"message": ""}, headers=headers)
        print(f"   💬 Empty message: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Empty message test failed: {e}")
    
    # Very long message
    try:
        long_message = "This is a very long message. " * 1000
        response = requests.post(f"{base_url}/api/python/chat", 
                               json={"message": long_message}, headers=headers)
        print(f"   📝 Long message: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Long message test failed: {e}")
    
    # Special characters
    try:
        special_message = "Testing with émojis 🚀 and spëcial chars: @#$%^&*()"
        response = requests.post(f"{base_url}/api/python/chat", 
                               json={"message": special_message}, headers=headers)
        print(f"   🌟 Special chars: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Special chars test failed: {e}")
    
    # Test 5: Malformed requests
    print("\n5. Testing Malformed Requests...")
    
    # Invalid JSON
    try:
        response = requests.post(f"{base_url}/api/python/chat", 
                               data="invalid json", headers=headers)
        print(f"   🔧 Invalid JSON: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Invalid JSON test failed: {e}")
    
    print("\n" + "=" * 55)
    print("🎯 Edge Cases Testing Complete!")

if __name__ == "__main__":
    test_edge_cases()
