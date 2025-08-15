
import express from 'express';
import { CSATController } from './controllers/CSATController.js';

const router = express.Router();
const csatController = new CSATController();

// Health check
router.get('/healthz', csatController.healthCheck.bind(csatController));

// CSAT analysis endpoints
router.post('/analyze', csatController.analyzeConversation.bind(csatController));
router.get('/metrics', csatController.getCSATMetrics.bind(csatController));

export function registerRoutes(app: express.Application): void {
  app.use('/', router);
}
