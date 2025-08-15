
import type { Request, Response } from 'express';
import { CSATUseCase } from '../../application/CSATUseCase.js';

export class CSATController {
  private csatUseCase: CSATUseCase;

  constructor() {
    this.csatUseCase = new CSATUseCase();
  }

  async analyzeConversation(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId, userId, messages } = req.body;

      if (!conversationId || !userId || !Array.isArray(messages)) {
        res.status(400).json({
          error: 'Missing required fields: conversationId, userId, messages'
        });
        return;
      }

      const result = await this.csatUseCase.analyzeConversation({
        conversationId,
        userId,
        messages
      });

      res.json(result);
    } catch (error) {
      console.error('Error analyzing conversation:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async getCSATMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { userId, timeframe = '7d' } = req.query;

      // Mock metrics for now - would integrate with actual storage
      const metrics = {
        averageScore: 78.5,
        totalConversations: 156,
        sentimentDistribution: {
          positive: 65,
          neutral: 25,
          negative: 10
        },
        trends: {
          lastWeek: 76.2,
          thisWeek: 78.5,
          change: '+2.3'
        },
        timeframe
      };

      res.json(metrics);
    } catch (error) {
      console.error('Error getting CSAT metrics:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  async healthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      status: 'healthy',
      service: 'csat-svc',
      timestamp: new Date().toISOString()
    });
  }
}
