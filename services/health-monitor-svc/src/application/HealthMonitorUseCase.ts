
export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  lastCheck: Date;
  details?: Record<string, any>;
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  services: ServiceHealth[];
  timestamp: Date;
}

export class HealthMonitorUseCase {
  private readonly services = [
    { name: 'auth-svc', url: 'http://localhost:3001/healthz' },
    { name: 'doc-ingest-svc', url: 'http://localhost:3002/healthz' },
    { name: 'search-svc', url: 'http://localhost:3003/healthz' },
    { name: 'embedding-svc', url: 'http://localhost:3004/healthz' },
    { name: 'agent-svc', url: 'http://localhost:3005/healthz' },
    { name: 'csat-svc', url: 'http://localhost:3006/healthz' }
  ];

  async checkSystemHealth(): Promise<SystemHealth> {
    const healthChecks = await Promise.allSettled(
      this.services.map(service => this.checkServiceHealth(service))
    );

    const services: ServiceHealth[] = healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          service: this.services[index].name,
          status: 'unhealthy',
          responseTime: -1,
          lastCheck: new Date(),
          details: { error: result.reason?.message || 'Unknown error' }
        };
      }
    });

    const healthyServices = services.filter(s => s.status === 'healthy').length;
    const totalServices = services.length;
    
    let overall: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (healthyServices === 0) {
      overall = 'unhealthy';
    } else if (healthyServices < totalServices) {
      overall = 'degraded';
    }

    return {
      overall,
      services,
      timestamp: new Date()
    };
  }

  private async checkServiceHealth(service: { name: string; url: string }): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(service.url, {
        method: 'GET',
        timeout: 5000
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return {
          service: service.name,
          status: 'healthy',
          responseTime,
          lastCheck: new Date(),
          details: data
        };
      } else {
        return {
          service: service.name,
          status: 'unhealthy',
          responseTime,
          lastCheck: new Date(),
          details: { httpStatus: response.status, statusText: response.statusText }
        };
      }
    } catch (error) {
      return {
        service: service.name,
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        details: { error: error.message }
      };
    }
  }
}
