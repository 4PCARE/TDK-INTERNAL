
import { Request, Response } from 'express';
import { EmbeddingUseCase } from '../../../application/EmbeddingUseCase.js';

export class EmbeddingController {
  constructor(private embeddingUseCase: EmbeddingUseCase) {}

  async generateEmbeddings(req: Request, res: Response) {
    try {
      const { texts, provider, model } = req.body;

      if (!texts || !Array.isArray(texts) || texts.length === 0) {
        return res.status(400).json({
          error: 'texts array is required and must not be empty'
        });
      }

      const result = await this.embeddingUseCase.generateEmbeddings({
        texts,
        provider,
        model
      });

      res.json(result);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      res.status(500).json({
        error: 'Failed to generate embeddings',
        details: error instanceof Error ? error.message : 'Unknown error'
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
        details: error instanceof Error ? error.message : 'Unknown error'
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

      const result = await this.embeddingUseCase.searchSimilar(query, {
        limit,
        threshold,
        filter,
        provider
      });

      res.json({ results: result });
    } catch (error) {
      console.error('Error searching embeddings:', error);
      res.status(500).json({
        error: 'Failed to search embeddings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getDocumentEmbeddings(req: Request, res: Response) {
    try {
      const documentId = parseInt(req.params.documentId);

      if (isNaN(documentId)) {
        return res.status(400).json({
          error: 'Valid documentId is required'
        });
      }

      const result = await this.embeddingUseCase.getDocumentEmbeddings(documentId);
      res.json(result);
    } catch (error) {
      console.error('Error fetching document embeddings:', error);
      res.status(500).json({
        error: 'Failed to fetch document embeddings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async deleteDocumentEmbeddings(req: Request, res: Response) {
    try {
      const documentId = parseInt(req.params.documentId);

      if (isNaN(documentId)) {
        return res.status(400).json({
          error: 'Valid documentId is required'
        });
      }

      const result = await this.embeddingUseCase.deleteDocumentEmbeddings(documentId);
      res.json({ deletedCount: result });
    } catch (error) {
      console.error('Error deleting document embeddings:', error);
      res.status(500).json({
        error: 'Failed to delete document embeddings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getAvailableProviders(req: Request, res: Response) {
    try {
      const providers = this.embeddingUseCase.getAvailableProviders();
      res.json({ providers });
    } catch (error) {
      console.error('Error fetching providers:', error);
      res.status(500).json({
        error: 'Failed to fetch providers',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

      res.json(result);
    } catch (error) {
      console.error('Error indexing document:', error);
      res.status(500).json({
        error: 'Failed to index document',
        details: error instanceof Error ? error.message : 'Unknown error'
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
        limit: limit ? parseInt(limit) : undefined,
        threshold: threshold ? parseFloat(threshold) : undefined,
        filter,
        provider
      });

      res.json({
        query,
        results,
        count: results.length
      });
    } catch (error) {
      console.error('Error searching vectors:', error);
      res.status(500).json({
        error: 'Failed to search vectors',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getDocumentEmbeddings(req: Request, res: Response) {
    try {
      const { documentId } = req.params;

      if (!documentId) {
        return res.status(400).json({
          error: 'documentId parameter is required'
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
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async deleteDocumentEmbeddings(req: Request, res: Response) {
    try {
      const { documentId } = req.params;

      if (!documentId) {
        return res.status(400).json({
          error: 'documentId parameter is required'
        });
      }

      const deleted = await this.embeddingUseCase.deleteDocumentEmbeddings(
        parseInt(documentId)
      );

      res.json({
        documentId: parseInt(documentId),
        deleted
      });
    } catch (error) {
      console.error('Error deleting document embeddings:', error);
      res.status(500).json({
        error: 'Failed to delete document embeddings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getProviders(req: Request, res: Response) {
    try {
      const providers = this.embeddingUseCase.getAvailableProviders();
      res.json({ providers });
    } catch (error) {
      console.error('Error getting providers:', error);
      res.status(500).json({
        error: 'Failed to get providers',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async healthCheck(req: Request, res: Response) {
    res.json({ 
      status: 'healthy',
      service: 'embedding-svc',
      timestamp: new Date().toISOString()
    });
  }
}
