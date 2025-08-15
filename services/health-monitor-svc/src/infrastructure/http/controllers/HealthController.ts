
import { Request, Response } from 'express';
import { HealthMonitorUseCase } from '../../application/HealthMonitorUseCase.js';

export class HealthController {
  private healthMonitor = new HealthMonitorUseCase();

  async getSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = await this.healthMonitor.checkSystemHealth();
      
      // Set appropriate HTTP status based on overall health
      let status = 200;
      if (health.overall === 'degraded') {
        status = 207; // Multi-Status
      } else if (health.overall === 'unhealthy') {
        status = 503; // Service Unavailable
      }
      
      res.status(status).json(health);
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        overall: 'unhealthy',
        services: [],
        timestamp: new Date(),
        error: 'Health check system failure'
      });
    }
  }

  async getServiceHealth(req: Request, res: Response): Promise<void> {
    try {
      const { serviceName } = req.params;
      const systemHealth = await this.healthMonitor.checkSystemHealth();
      
      const service = systemHealth.services.find(s => s.service === serviceName);
      if (!service) {
        res.status(404).json({ error: 'Service not found' });
        return;
      }
      
      const status = service.status === 'healthy' ? 200 : 503;
      res.status(status).json(service);
    } catch (error) {
      console.error('Service health check error:', error);
      res.status(500).json({ error: 'Service health check failed' });
    }
  }

  // Self health check for this service
  async healthz(req: Request, res: Response): Promise<void> {
    res.json({
      service: 'health-monitor-svc',
      status: 'healthy',
      timestamp: new Date(),
      version: '1.0.0'
    });
  }
}
