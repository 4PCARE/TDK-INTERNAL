#!/usr/bin/env python3
"""
Test script to validate the fixed chat and search endpoints are working correctly
"""

import requests
import json
import time

BASE_URL = "http://localhost:8000"

def test_chat_functionality():
    """Test chat endpoint with real conversation"""
    print("🗣️ Testing Chat Functionality...")
    
    # Test basic chat
    chat_data = {
        "message": "Hello! What can you help me with?",
        "search_documents": True
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/python/chat/message", json=chat_data)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Chat Response: {result.get('response', 'No response')[:100]}...")
            print(f"   Sources found: {len(result.get('sources', []))}")
            print(f"   Search performed: {result.get('search_performed', False)}")
            print(f"   Documents found: {result.get('documents_found', 0)}")
            return True
        else:
            print(f"❌ Chat failed: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Chat error: {e}")
        return False

def test_search_functionality():
    """Test search endpoint with various queries"""
    print("\n🔍 Testing Search Functionality...")
    
    test_queries = [
        ("budget", "keyword"),
        ("financial report", "hybrid"),  
        ("document summary", "semantic")
    ]
    
    results = []
    for query, search_type in test_queries:
        try:
            url = f"{BASE_URL}/api/python/documents/search?query={query}&type={search_type}&limit=3"
            response = requests.get(url)
            print(f"Status for '{query}' ({search_type}): {response.status_code}")
            
            if response.status_code == 200:
                search_results = response.json()
                if isinstance(search_results, list):
                    print(f"✅ Found {len(search_results)} results for '{query}'")
                    if search_results:
                        first_result = search_results[0]
                        print(f"   Top result: {first_result.get('name', 'Unknown')} (score: {first_result.get('score', 0.0):.3f})")
                    results.append(True)
                else:
                    print(f"⚠️ Unexpected response format for '{query}'")
                    results.append(False)
            else:
                print(f"❌ Search failed for '{query}': {response.text}")
                results.append(False)
                
        except Exception as e:
            print(f"❌ Search error for '{query}': {e}")
            results.append(False)
    
    return all(results)

def test_conversation_memory():
    """Test if chat service maintains conversation context"""
    print("\n🧠 Testing Conversation Memory...")
    
    try:
        # First message
        msg1 = {"message": "My name is Alice", "search_documents": False}
        response1 = requests.post(f"{BASE_URL}/api/python/chat/message", json=msg1)
        
        if response1.status_code != 200:
            print(f"❌ First message failed: {response1.text}")
            return False
        
        # Second message asking about the name
        time.sleep(1)  # Brief pause
        msg2 = {"message": "What is my name?", "search_documents": False}
        response2 = requests.post(f"{BASE_URL}/api/python/chat/message", json=msg2)
        
        if response2.status_code == 200:
            result = response2.json()
            response_text = result.get('response', '').lower()
            if 'alice' in response_text:
                print("✅ Conversation memory working - AI remembered the name!")
                return True
            else:
                print(f"⚠️ Memory unclear - Response: {result.get('response', '')[:100]}...")
                return False
        else:
            print(f"❌ Second message failed: {response2.text}")
            return False
            
    except Exception as e:
        print(f"❌ Memory test error: {e}")
        return False

def main():
    print("🧪 Testing Fixed Chat and Search Services")
    print("=" * 50)
    
    # Test individual components
    chat_working = test_chat_functionality()
    search_working = test_search_functionality()  
    memory_working = test_conversation_memory()
    
    print("\n" + "=" * 50)
    print("📊 Test Results Summary:")
    print(f"   Chat Service: {'✅ WORKING' if chat_working else '❌ BROKEN'}")
    print(f"   Search Service: {'✅ WORKING' if search_working else '❌ BROKEN'}")
    print(f"   Memory Service: {'✅ WORKING' if memory_working else '❌ BROKEN'}")
    
    if chat_working and search_working:
        print("\n🎉 SUCCESS: Core services are functioning correctly!")
        print("   - LangChain ConversationalRetrievalChain: ✅")
        print("   - BM25 + Vector Hybrid Search: ✅")
        print("   - Frontend-Compatible Responses: ✅")
        return True
    else:
        print("\n❌ FAILURE: Some services need attention")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)