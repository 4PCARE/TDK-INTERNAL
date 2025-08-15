import { ChatController } from './controllers/ChatController.js';
import { ChatUseCase } from '../../application/ChatUseCase.js';
import { OpenAIClient } from '../llm/OpenAIClient.js';

/**
 * Routes for Agent Service
 */
export function registerRoutes(app: any): void {
  // Health checks
  app.get('/healthz', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', service: 'agent-svc' });
  });

  app.get('/readyz', (_req: any, res: any) => {
    res.status(200).json({ 
      status: 'ready', 
      service: 'agent-svc',
      timestamp: new Date().toISOString()
    });
  });

  // Initialize dependencies
  const llmClient = new OpenAIClient();
  const chatUseCase = new ChatUseCase(llmClient);
  const chatController = new ChatController(chatUseCase);

  // Chat routes
  app.post('/chat', (req: any, res: any) => chatController.chat(req, res));
  app.get('/sessions/:sessionId', (req: any, res: any) => chatController.getSession(req, res));
}