
import { Router } from 'express';
import { EmbeddingController } from './controllers/EmbeddingController.js';

export function setupRoutes(app: any) {
  const router = Router();
  const embeddingController = new EmbeddingController();

  // Health checks
  router.get('/healthz', embeddingController.healthCheck.bind(embeddingController));
  router.get('/readyz', embeddingController.healthCheck.bind(embeddingController));

  // Core embedding operations
  router.post('/embed', embeddingController.generateEmbeddings.bind(embeddingController));
  router.post('/index', embeddingController.indexDocument.bind(embeddingController));
  
  // Vector search
  router.post('/search', embeddingController.searchSimilar.bind(embeddingController));
  router.post('/vectors/search', embeddingController.searchSimilar.bind(embeddingController));
  
  // Document management
  router.get('/documents/:documentId/embeddings', embeddingController.getDocumentEmbeddings.bind(embeddingController));
  router.delete('/documents/:documentId/embeddings', embeddingController.deleteDocumentEmbeddings.bind(embeddingController));
  
  // Provider management
  router.get('/providers', embeddingController.getAvailableProviders.bind(embeddingController));
  
  // Stats and monitoring
  router.get('/stats', embeddingController.getStats.bind(embeddingController));

  app.use('/', router);
}
