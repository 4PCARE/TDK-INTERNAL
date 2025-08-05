
import requests
import os
import json

def test_document_processing():
    base_url = "http://0.0.0.0:8000"
    headers = {"Authorization": "Bearer dummy-token-for-testing"}
    
    print("📄 Testing Document Processing")
    print("=" * 50)
    
    # Test different file types
    test_files = [
        ("test_text.txt", "This is a sample text document with important information about AI and machine learning.", "text/plain"),
        ("test_json.json", '{"title": "Sample JSON", "content": "This is JSON test data"}', "application/json"),
    ]
    
    for filename, content, content_type in test_files:
        print(f"\n📝 Testing {filename}...")
        
        files = {'file': (filename, content, content_type)}
        
        try:
            response = requests.post(
                f"{base_url}/api/python/documents/upload",
                files=files,
                headers=headers,
                timeout=30
            )
            
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"   ✅ Success: Document ID {result.get('document_id', 'Unknown')}")
            else:
                print(f"   ❌ Error: {response.text[:200]}")
                
        except Exception as e:
            print(f"   ❌ Failed: {e}")
    
    # Test chat with uploaded documents
    print(f"\n💬 Testing Chat with Documents...")
    chat_queries = [
        "What documents have been uploaded?",
        "Tell me about machine learning",
        "Summarize the content of my documents"
    ]
    
    for query in chat_queries:
        print(f"\n🤔 Query: {query}")
        try:
            response = requests.post(
                f"{base_url}/api/python/chat",
                json={"message": query},
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                ai_response = result.get('response', 'No response')
                print(f"   🤖 AI: {ai_response[:150]}...")
            else:
                print(f"   ❌ Error: {response.status_code} - {response.text[:100]}")
                
        except Exception as e:
            print(f"   ❌ Failed: {e}")

if __name__ == "__main__":
    test_document_processing()
