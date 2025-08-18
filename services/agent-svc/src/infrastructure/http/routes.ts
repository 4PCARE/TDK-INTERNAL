import { Router } from 'express';
import { ChatController } from './controllers/ChatController.js';

const router = Router();
const chatController = new ChatController();

router.get('/healthz', (req, res) => {
  res.json({ status: 'healthy', service: 'agent-svc' });
});

// Chat endpoints
router.post('/chat', chatController.processMessage.bind(chatController));
router.get('/chat/history/:sessionId', chatController.getConversationHistory.bind(chatController));

// Agent management endpoints
router.get('/agents', (req, res) => {
  const userId = req.headers['x-user-id'] || 'anonymous';

  // Mock agent list
  const agents = [
    {
      id: '1',
      name: 'Customer Support Bot',
      description: 'AI assistant for customer support',
      status: 'active',
      userId
    },
    {
      id: '2',
      name: 'Document Assistant',
      description: 'AI assistant for document queries',
      status: 'active',
      userId
    }
  ];

  res.json({ agents });
});

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

export { router };