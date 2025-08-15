
import { Router } from 'express';
import { HealthController } from './controllers/HealthController.js';

const router = Router();
const healthController = new HealthController();

// System health overview
router.get('/health', healthController.getSystemHealth.bind(healthController));

// Individual service health
router.get('/health/:serviceName', healthController.getServiceHealth.bind(healthController));

// Self health check
router.get('/healthz', healthController.healthz.bind(healthController));

export function registerRoutes(app: any) {
  app.use('/api', router);
  console.log('🏥 Health Monitor routes registered');
}
