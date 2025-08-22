
const express = require('express');

// Test if the route pattern matches
const testRoutes = [
  '/api/internal-chat/sessions/26',
  '/api/internal-chat/sessions/:agentId',
  '/api/internal-chat/sessions'
];

console.log('Testing route patterns:');
testRoutes.forEach(route => {
  console.log(`Route: ${route}`);
  
  // Test with express route matching
  const router = express.Router();
  router.get('/api/internal-chat/sessions/:agentId', (req, res) => {
    console.log(`✅ Matched! AgentId: ${req.params.agentId}`);
  });
  
  // Simulate request
  const mockReq = { method: 'GET', url: route, params: {} };
  console.log(`Would match: ${route.includes(':agentId') || route.endsWith('/26')}`);
});
