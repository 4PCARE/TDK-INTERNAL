// Test Line OA HR integration with LangChain agents
import axios from 'axios';

async function testLineHrIntegration() {
  console.log("🧪 Testing Line OA HR integration...");
  
  try {
    // Test HR query through Line webhook simulation
    const testPayload = {
      events: [
        {
          type: "message",
          replyToken: "test-reply-token",
          source: {
            userId: "test-line-user-123",
            type: "user"
          },
          message: {
            type: "text",
            id: "test-message-id",
            text: "ข้อมูลพนักงานของฉัน เลขบัตรประชาชน 1234567890123"
          },
          timestamp: Date.now()
        }
      ]
    };

    console.log("📤 Sending test webhook payload to Line OA handler...");
    
    const response = await axios.post('http://localhost:5000/api/line/webhook', testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': 'test-signature'
      },
      timeout: 30000
    });

    console.log("✅ Response received:", response.status);
    console.log("📄 Response data:", response.data);
    
  } catch (error) {
    if (error.response) {
      console.log("❌ HTTP Error:", error.response.status);
      console.log("📄 Error response:", error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.log("❌ Connection refused - server may not be running");
    } else {
      console.log("❌ Error:", error.message);
    }
  }
}

testLineHrIntegration();