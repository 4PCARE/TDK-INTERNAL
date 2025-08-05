
import requests
import time
import threading
import statistics

def test_performance():
    base_url = "http://0.0.0.0:8000"
    headers = {"Authorization": "Bearer dummy-token-for-testing"}
    
    print("⚡ Performance Testing")
    print("=" * 50)
    
    # Test 1: Response time testing
    print("\n1. Testing Response Times...")
    endpoints = [
        ("/health", "GET"),
        ("/api/python/documents", "GET"),
        ("/api/python/chat", "POST")
    ]
    
    for endpoint, method in endpoints:
        times = []
        for i in range(5):
            start_time = time.time()
            try:
                if method == "GET":
                    response = requests.get(f"{base_url}{endpoint}", headers=headers, timeout=10)
                else:
                    response = requests.post(f"{base_url}{endpoint}", 
                                           json={"message": "Quick test"}, 
                                           headers=headers, timeout=10)
                end_time = time.time()
                times.append(end_time - start_time)
            except Exception as e:
                print(f"   ❌ {endpoint} failed: {e}")
                break
        
        if times:
            avg_time = statistics.mean(times)
            print(f"   📊 {endpoint}: {avg_time:.3f}s average")
    
    # Test 2: Concurrent requests
    print("\n2. Testing Concurrent Requests...")
    results = []
    
    def make_request():
        try:
            start = time.time()
            response = requests.get(f"{base_url}/health", timeout=10)
            end = time.time()
            results.append({
                'status': response.status_code,
                'time': end - start,
                'success': response.status_code == 200
            })
        except Exception as e:
            results.append({'status': 'error', 'time': 0, 'success': False})
    
    # Run 10 concurrent requests
    threads = []
    for i in range(10):
        thread = threading.Thread(target=make_request)
        threads.append(thread)
        thread.start()
    
    for thread in threads:
        thread.join()
    
    successful = sum(1 for r in results if r['success'])
    avg_concurrent_time = statistics.mean([r['time'] for r in results if r['success']])
    
    print(f"   📊 Concurrent Results: {successful}/10 successful")
    print(f"   ⏱️  Average time: {avg_concurrent_time:.3f}s")
    
    # Test 3: Large file upload test
    print("\n3. Testing Large File Upload...")
    large_content = "This is a large test file. " * 1000  # ~27KB
    files = {'file': ('large_test.txt', large_content, 'text/plain')}
    
    start_time = time.time()
    try:
        response = requests.post(
            f"{base_url}/api/python/documents/upload",
            files=files,
            headers=headers,
            timeout=60
        )
        end_time = time.time()
        
        print(f"   📤 Large upload: {response.status_code} in {end_time - start_time:.3f}s")
        if response.status_code == 200:
            print(f"   ✅ Success: File size ~{len(large_content)} bytes")
    except Exception as e:
        print(f"   ❌ Large upload failed: {e}")

if __name__ == "__main__":
    test_performance()
