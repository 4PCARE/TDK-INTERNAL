
import { Request, Response } from 'express';
import { EmbeddingUseCase } from '../../../application/EmbeddingUseCase.js';
import { VectorStore } from '../../db/VectorStore.js';

export class EmbeddingController {
  private embeddingUseCase: EmbeddingUseCase;

  constructor() {
    const vectorStore = new VectorStore();
    this.embeddingUseCase = new EmbeddingUseCase(vectorStore);
  }

  async generateEmbeddings(req: Request, res: Response) {
    try {
      const { texts, documentId, provider, model } = req.body;

      if (!texts || !Array.isArray(texts) || texts.length === 0) {
        return res.status(400).json({ 
          error: 'texts array is required and cannot be empty' 
        });
      }

      const result = await this.embeddingUseCase.generateEmbeddings({
        texts,
        documentId,
        provider,
        model
      });

      res.json(result);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      res.status(500).json({ 
        error: 'Failed to generate embeddings',
        details: error.message 
      });
    }
  }

  async indexDocument(req: Request, res: Response) {
    try {
      const { documentId, chunks } = req.body;

      if (!documentId || !chunks || !Array.isArray(chunks)) {
        return res.status(400).json({ 
          error: 'documentId and chunks array are required' 
        });
      }

      const result = await this.embeddingUseCase.indexDocument({
        documentId,
        chunks
      });

      res.json(result);
    } catch (error) {
      console.error('Error indexing document:', error);
      res.status(500).json({ 
        error: 'Failed to index document',
        details: error.message 
      });
    }
  }

  async searchSimilar(req: Request, res: Response) {
    try {
      const { query, limit, threshold, filter, provider } = req.body;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ 
          error: 'query string is required' 
        });
      }

      const results = await this.embeddingUseCase.searchSimilar(query, {
        limit,
        threshold,
        filter,
        provider
      });

      res.json({
        query,
        results,
        count: results.length
      });
    } catch (error) {
      console.error('Error searching similar chunks:', error);
      res.status(500).json({ 
        error: 'Failed to search similar chunks',
        details: error.message 
      });
    }
  }

  async getDocumentEmbeddings(req: Request, res: Response) {
    try {
      const { documentId } = req.params;

      if (!documentId || isNaN(parseInt(documentId))) {
        return res.status(400).json({ 
          error: 'Valid documentId is required' 
        });
      }

      const embeddings = await this.embeddingUseCase.getDocumentEmbeddings(
        parseInt(documentId)
      );

      res.json({
        documentId: parseInt(documentId),
        embeddings,
        count: embeddings.length
      });
    } catch (error) {
      console.error('Error getting document embeddings:', error);
      res.status(500).json({ 
        error: 'Failed to get document embeddings',
        details: error.message 
      });
    }
  }

  async deleteDocumentEmbeddings(req: Request, res: Response) {
    try {
      const { documentId } = req.params;

      if (!documentId || isNaN(parseInt(documentId))) {
        return res.status(400).json({ 
          error: 'Valid documentId is required' 
        });
      }

      const deletedCount = await this.embeddingUseCase.deleteDocumentEmbeddings(
        parseInt(documentId)
      );

      res.json({
        documentId: parseInt(documentId),
        deletedCount,
        success: true
      });
    } catch (error) {
      console.error('Error deleting document embeddings:', error);
      res.status(500).json({ 
        error: 'Failed to delete document embeddings',
        details: error.message 
      });
    }
  }

  async getAvailableProviders(req: Request, res: Response) {
    try {
      const providers = this.embeddingUseCase.getAvailableProviders();
      
      res.json({
        providers,
        default: providers.includes('openai') ? 'openai' : providers[0]
      });
    } catch (error) {
      console.error('Error getting available providers:', error);
      res.status(500).json({ 
        error: 'Failed to get available providers',
        details: error.message 
      });
    }
  }

  async getStats(req: Request, res: Response) {
    try {
      const stats = await this.embeddingUseCase.getStats();
      res.json(stats);
    } catch (error) {
      console.error('Error getting embedding stats:', error);
      res.status(500).json({ 
        error: 'Failed to get embedding stats',
        details: error.message 
      });
    }
  }

  async healthCheck(req: Request, res: Response) {
    try {
      const health = await this.embeddingUseCase.healthCheck();
      res.json(health);
    } catch (error) {
      console.error('Error in health check:', error);
      res.json({ 
        status: 'unhealthy',
        service: 'embedding-svc',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}
