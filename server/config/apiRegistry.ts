
export interface ApiEndpoint {
  path: string;
  method: string;
  handler: string;
  middleware: string[];
  description: string;
  version: string;
  tags: string[];
  parameters?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
    in: 'path' | 'query' | 'body' | 'header';
  }[];
  responses?: {
    code: number;
    description: string;
    schema?: any;
  }[];
  examples?: {
    request?: any;
    response?: any;
  };
  deprecated?: boolean;
  rateLimit?: {
    requests: number;
    window: string;
  };
}

export class ApiRegistry {
  private endpoints: Map<string, ApiEndpoint[]> = new Map();
  private routeStats: Map<string, { calls: number; errors: number; avgResponseTime: number }> = new Map();

  registerEndpoint(routeName: string, endpoint: ApiEndpoint): void {
    const existingEndpoints = this.endpoints.get(routeName) || [];
    existingEndpoints.push(endpoint);
    this.endpoints.set(routeName, existingEndpoints);
  }

  getEndpoints(routeName?: string): ApiEndpoint[] {
    if (routeName) {
      return this.endpoints.get(routeName) || [];
    }
    
    const allEndpoints: ApiEndpoint[] = [];
    for (const endpoints of this.endpoints.values()) {
      allEndpoints.push(...endpoints);
    }
    return allEndpoints;
  }

  generateOpenApiSpec(): any {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: "AI KMS API",
        version: "1.0.0",
        description: "AI Knowledge Management System API Documentation"
      },
      servers: [
        {
          url: "/api",
          description: "Main API server"
        }
      ],
      paths: {},
      components: {
        securitySchemes: {
          BearerAuth: {
            type: "http",
            scheme: "bearer"
          },
          ReplitAuth: {
            type: "apiKey",
            in: "header",
            name: "Authorization"
          }
        }
      }
    };

    // Generate paths from registered endpoints
    const allEndpoints = this.getEndpoints();
    for (const endpoint of allEndpoints) {
      if (!spec.paths[endpoint.path]) {
        spec.paths[endpoint.path] = {};
      }
      
      spec.paths[endpoint.path][endpoint.method.toLowerCase()] = {
        summary: endpoint.description,
        tags: endpoint.tags,
        parameters: endpoint.parameters || [],
        responses: endpoint.responses || {
          200: { description: "Success" },
          400: { description: "Bad Request" },
          401: { description: "Unauthorized" },
          500: { description: "Internal Server Error" }
        },
        security: endpoint.middleware.includes('smartAuth') || endpoint.middleware.includes('isAuthenticated') 
          ? [{ BearerAuth: [] }] 
          : [],
        deprecated: endpoint.deprecated || false
      };
    }

    return spec;
  }

  trackRequest(path: string, method: string, responseTime: number, success: boolean): void {
    const key = `${method.toUpperCase()} ${path}`;
    const stats = this.routeStats.get(key) || { calls: 0, errors: 0, avgResponseTime: 0 };
    
    stats.calls++;
    if (!success) {
      stats.errors++;
    }
    
    // Calculate rolling average
    stats.avgResponseTime = (stats.avgResponseTime * (stats.calls - 1) + responseTime) / stats.calls;
    
    this.routeStats.set(key, stats);
  }

  getRouteStats(): Map<string, { calls: number; errors: number; avgResponseTime: number }> {
    return this.routeStats;
  }

  getHealthSummary(): any {
    const allStats = Array.from(this.routeStats.entries());
    const totalCalls = allStats.reduce((sum, [, stats]) => sum + stats.calls, 0);
    const totalErrors = allStats.reduce((sum, [, stats]) => sum + stats.errors, 0);
    const avgResponseTime = allStats.reduce((sum, [, stats]) => sum + stats.avgResponseTime, 0) / allStats.length;
    
    return {
      totalEndpoints: this.getEndpoints().length,
      totalCalls,
      totalErrors,
      errorRate: totalCalls > 0 ? (totalErrors / totalCalls) * 100 : 0,
      avgResponseTime: avgResponseTime || 0,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }
}

export const apiRegistry = new ApiRegistry();
