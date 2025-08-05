
import requests
import json

def test_python_backend():
    base_url = "http://0.0.0.0:8000"
    
    # Test health endpoint
    response = requests.get(f"{base_url}/health")
    print(f"Health check: {response.status_code} - {response.json()}")
    
    # Test with dummy token (you'll need a real one from your Node.js auth)
    headers = {"Authorization": "Bearer your-jwt-token-here"}
    
    # Test documents endpoint
    try:
        response = requests.get(f"{base_url}/api/python/documents", headers=headers)
        print(f"Documents endpoint: {response.status_code}")
    except Exception as e:
        print(f"Documents test failed (expected without valid token): {e}")

if __name__ == "__main__":
    test_python_backend()
