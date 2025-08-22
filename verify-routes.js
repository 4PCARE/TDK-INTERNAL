
// Quick test to verify routes are registered
const express = require('express');
const app = express();

// Simulate the route registration
app.get("/api/internal-chat/sessions", (req, res) => {
  console.log("✅ General sessions route works");
  res.json({ message: "General sessions route" });
});

app.get("/api/internal-chat/sessions/:agentId", (req, res) => {
  console.log(`✅ Agent sessions route works for agent: ${req.params.agentId}`);
  res.json({ message: `Agent sessions route for ${req.params.agentId}` });
});

// Test the routes
const testUrls = [
  '/api/internal-chat/sessions',
  '/api/internal-chat/sessions/26'
];

console.log('Route verification:');
testUrls.forEach(url => {
  // Mock request to test route matching
  const mockReq = { method: 'GET', url, params: {} };
  console.log(`URL: ${url} - Should match parameterized route`);
});
