import { Router } from 'express';
import { ChatController } from './controllers/ChatController.js';

const router = Router();
const chatController = new ChatController();

router.get('/healthz', (req, res) => {
  res.json({ status: 'healthy', service: 'agent-svc' });
});

// Mock agents data
const agents = [
  {
    id: 'agent-1',
    name: 'Customer Support Agent',
    description: 'Handles customer inquiries and support requests',
    status: 'active',
    type: 'support'
  },
  {
    id: 'agent-2',
    name: 'Sales Assistant',
    description: 'Assists with sales inquiries and product information',
    status: 'active',
    type: 'sales'
  }
];

// Get agents list
router.get('/agents', (req, res) => {
  console.log('🤖 Agent service: GET /agents called');
  try {
    res.json({
      agents,
      total: agents.length
    });
  } catch (error) {
    console.error('🚨 Error in /agents endpoint:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Chat endpoints
router.post('/chat', chatController.processMessage.bind(chatController));
router.get('/chat/history/:sessionId', chatController.getConversationHistory.bind(chatController));

router.get('/agents/:id', (req, res) => {
  const { id } = req.params;

  // Mock agent details
  const agent = {
    id,
    name: 'Customer Support Bot',
    description: 'AI assistant for customer support',
    status: 'active',
    systemPrompt: 'You are a helpful AI assistant that provides customer support.',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 1000
  };

  res.json({ agent });
});

// Catch-all for unmatched routes - return JSON instead of HTML
router.use('*', (req, res) => {
  console.log(`🚨 Agent service: Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    service: 'agent-svc'
  });
});

export { router };