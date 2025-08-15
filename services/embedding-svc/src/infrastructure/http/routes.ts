
import { Router } from 'express';
import { EmbeddingController } from './controllers/EmbeddingController.js';
import { EmbeddingUseCase } from '../../application/EmbeddingUseCase.js';
import { InMemoryVectorStore } from '../db/VectorStore.js';

export function registerRoutes(app: any) {
  const router = Router();
  
  // Initialize dependencies
  const vectorStore = new InMemoryVectorStore();
  const embeddingUseCase = new EmbeddingUseCase(vectorStore);
  const controller = new EmbeddingController(embeddingUseCase);

  // Health check routes
  router.get('/healthz', (req, res) => controller.healthCheck(req, res));
  router.get('/readyz', (req, res) => controller.healthCheck(req, res));

  // Embedding generation
  router.post('/embeddings/generate', (req, res) => 
    controller.generateEmbeddings(req, res)
  );

  // Document indexing
  router.post('/embeddings/index', (req, res) => 
    controller.indexDocument(req, res)
  );

  // Vector search
  router.post('/vectors/search', (req, res) => 
    controller.searchSimilar(req, res)
  );

  // Document management
  router.get('/documents/:documentId/embeddings', (req, res) => 
    controller.getDocumentEmbeddings(req, res)
  );

  router.delete('/documents/:documentId/embeddings', (req, res) => 
    controller.deleteDocumentEmbeddings(req, res)
  );

  // Provider information
  router.get('/providers', (req, res) => 
    controller.getProviders(req, res)
  );

  // Mount routes
  app.use('/', router);
}
