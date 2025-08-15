
# Health Monitor Service

Centralized health monitoring and service discovery for AI-KMS microservices.

## Features

- **System Health Overview**: Aggregate health status of all services
- **Individual Service Health**: Detailed health checks for each service  
- **Response Time Monitoring**: Track service response times
- **Status Categorization**: Healthy, degraded, or unhealthy states
- **Error Details**: Comprehensive error reporting and diagnostics

## API Endpoints

### GET /api/health
Returns overall system health with all service statuses.

**Response Format:**
```json
{
  "overall": "healthy|degraded|unhealthy",
  "services": [
    {
      "service": "auth-svc",
      "status": "healthy",
      "responseTime": 45,
      "lastCheck": "2024-01-15T10:30:00Z",
      "details": {}
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### GET /api/health/:serviceName
Returns health status for a specific service.

### GET /healthz
Self health check endpoint.

## Usage

```bash
# Start the service
npm run dev

# Check system health
curl http://localhost:3007/api/health

# Check specific service
curl http://localhost:3007/api/health/auth-svc
```

## Integration

The health monitor is automatically integrated into the API Gateway and accessible at:
- http://localhost:8080/api/health (via gateway)
- http://localhost:3007/api/health (direct)
