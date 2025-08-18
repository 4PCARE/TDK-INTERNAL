
import { Router, Application } from 'express';
import { EmbeddingController } from './controllers/EmbeddingController.js';
import { EmbeddingUseCase } from '../../application/EmbeddingUseCase.js';
import { VectorStore } from '../db/VectorStore.js';

export function registerRoutes(app: Application): void {
  const router = Router();
  
  // Initialize dependencies
  const vectorStore = new VectorStore();
  const embeddingUseCase = new EmbeddingUseCase(vectorStore);
  const embeddingController = new EmbeddingController(embeddingUseCase);

  // Health endpoints
  router.get('/healthz', embeddingController.healthCheck.bind(embeddingController));
  router.get('/readyz', embeddingController.healthCheck.bind(embeddingController));

  // Embedding endpoints
  router.post('/embeddings/generate', embeddingController.generateEmbeddings.bind(embeddingController));
  router.post('/documents/index', embeddingController.indexDocument.bind(embeddingController));
  
  // Vector search endpoints  
  router.post('/vectors/search', embeddingController.searchSimilar.bind(embeddingController));
  router.post('/vectors/upsert', embeddingController.indexDocument.bind(embeddingController));

  // Document management
  router.get('/documents/:documentId/embeddings', embeddingController.getDocumentEmbeddings.bind(embeddingController));
  router.delete('/documents/:documentId/embeddings', embeddingController.deleteDocumentEmbeddings.bind(embeddingController));

  // Provider management
  router.get('/providers', embeddingController.getAvailableProviders.bind(embeddingController));

  app.use('/', router);
}
