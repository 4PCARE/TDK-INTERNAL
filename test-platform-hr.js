// Test platform HR integration with authenticated users
import axios from 'axios';

async function testPlatformHr() {
  console.log("🧪 Testing Platform HR integration for authenticated users...");
  
  try {
    // Test HR query through platform chat API
    // This should NOT require citizen ID since user is authenticated
    const testPayload = {
      message: "แผนกของฉันคืออะไร และตำแหน่งงานของฉัน", // "What is my department and position?"
      agentId: 1,
      userId: "43981095" // This user is mapped to employee_id 1234567890123 in HR database
    };

    console.log("📤 Sending platform HR query...");
    
    const response = await axios.post('http://localhost:5000/api/chat/message', testPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log("✅ Response received:", response.status);
    console.log("📄 Response data:", JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    if (error.response) {
      console.log("❌ HTTP Error:", error.response.status);
      console.log("📄 Error response:", JSON.stringify(error.response.data, null, 2));
    } else if (error.code === 'ECONNREFUSED') {
      console.log("❌ Connection refused - server may not be running");
    } else {
      console.log("❌ Error:", error.message);
    }
  }
}

testPlatformHr();