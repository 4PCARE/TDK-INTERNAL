
import { Request, Response } from 'express';
import { ChatUseCase } from '../../../application/ChatUseCase.js';

export class ChatController {
  constructor(private chatUseCase: ChatUseCase) {}

  async chat(req: Request, res: Response): Promise<void> {
    try {
      const { message, sessionId, documentContext } = req.body;
      const userId = req.user?.id || 'anonymous';

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required and must be a string' });
        return;
      }

      const result = await this.chatUseCase.chat({
        userId,
        message,
        sessionId,
        documentContext
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({
        error: 'Chat processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const session = this.chatUseCase.getSession(sessionId);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json({
        success: true,
        data: {
          id: session.id,
          userId: session.userId,
          messages: session.messages,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        }
      });
    } catch (error) {
      console.error('Get session error:', error);
      res.status(500).json({
        error: 'Failed to get session'
      });
    }
  }
}
