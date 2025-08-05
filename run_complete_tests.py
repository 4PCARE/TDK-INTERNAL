
import subprocess
import sys
import time

def run_test_suite():
    print("🚀 AI-KMS Complete Test Suite")
    print("=" * 60)
    print("Running comprehensive tests for the AI Knowledge Management System")
    print("=" * 60)
    
    tests = [
        ("Basic Backend Tests", "python test_python_backend.py"),
        ("Document Processing Tests", "python test_document_processing.py"),
        ("Authentication Integration", "python test_auth_integration.py"),
        ("Performance Tests", "python test_performance.py"),
        ("Edge Cases Tests", "python test_edge_cases.py"),
        ("Integration Tests", "python test_integration.py")
    ]
    
    results = []
    
    for test_name, command in tests:
        print(f"\n🧪 Running {test_name}...")
        print("-" * 40)
        
        start_time = time.time()
        try:
            result = subprocess.run(command.split(), 
                                  capture_output=True, 
                                  text=True, 
                                  timeout=120)
            end_time = time.time()
            
            if result.returncode == 0:
                print(f"✅ {test_name} PASSED ({end_time - start_time:.1f}s)")
                results.append((test_name, "PASSED", end_time - start_time))
            else:
                print(f"❌ {test_name} FAILED ({end_time - start_time:.1f}s)")
                print(f"Error: {result.stderr[:200]}")
                results.append((test_name, "FAILED", end_time - start_time))
                
        except subprocess.TimeoutExpired:
            print(f"⏰ {test_name} TIMEOUT (>120s)")
            results.append((test_name, "TIMEOUT", 120))
        except Exception as e:
            print(f"💥 {test_name} ERROR: {e}")
            results.append((test_name, "ERROR", 0))
    
    # Summary Report
    print("\n" + "=" * 60)
    print("📊 TEST SUITE SUMMARY REPORT")
    print("=" * 60)
    
    passed = sum(1 for _, status, _ in results if status == "PASSED")
    failed = sum(1 for _, status, _ in results if status == "FAILED")
    errors = sum(1 for _, status, _ in results if status in ["TIMEOUT", "ERROR"])
    
    print(f"Total Tests: {len(results)}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"💥 Errors: {errors}")
    print(f"Success Rate: {(passed/len(results)*100):.1f}%")
    
    print("\nDetailed Results:")
    for test_name, status, duration in results:
        status_icon = "✅" if status == "PASSED" else "❌"
        print(f"  {status_icon} {test_name}: {status} ({duration:.1f}s)")
    
    print("\n" + "=" * 60)
    if passed == len(results):
        print("🎉 ALL TESTS PASSED! Your system is ready for production.")
    elif passed > len(results) // 2:
        print("⚠️  MOST TESTS PASSED. Review failed tests before deployment.")
    else:
        print("🚨 MULTIPLE FAILURES. System needs attention before deployment.")
    
    print("\n💡 Next Steps:")
    print("1. Review any failed tests and fix issues")
    print("2. Test with real user accounts and authentication")
    print("3. Verify OpenAI API key is properly configured")
    print("4. Test document upload with various file types")
    print("5. Verify database connections are working")
    print("6. Ready for deployment! 🚀")

if __name__ == "__main__":
    run_test_suite()
