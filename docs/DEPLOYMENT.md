
# AI-KMS Deployment Guide

## Production Deployment on Replit

### 1. Environment Setup

Create production environment variables in Replit Secrets:

```bash
# Core Configuration
NODE_ENV=production
DATABASE_URL=your_production_postgres_url
REDIS_URL=your_production_redis_url

# AI Providers
OPENAI_API_KEY=your_openai_key
AI_PROVIDER=openai
EMBEDDINGS_PROVIDER=openai

# Authentication
REPLIT_CLIENT_ID=your_replit_client_id
REPLIT_CLIENT_SECRET=your_replit_client_secret
JWT_SECRET=your_secure_jwt_secret

# Service URLs (production)
API_GATEWAY_URL=https://your-app.replit.app
AUTH_SVC_URL=https://your-app.replit.app
LEGACY_BASE_URL=https://your-app.replit.app
```

### 2. Build Configuration

The system uses a multi-service architecture but deploys as a single unit via the API Gateway.

**Build Process:**
1. Install all dependencies across services
2. Compile TypeScript services
3. Build React frontend
4. Start API Gateway with service routing

### 3. Service Architecture

**Production Services:**
- **API Gateway** (Port 8080): Main entry point, routes to all services
- **Legacy Server** (Port 5000): Existing functionality during migration
- **Microservices** (Ports 3001-3007): Individual service instances
- **Health Monitor** (Port 3007): System health monitoring

### 4. Deployment Commands

```bash
# Build all services
npm run build

# Start production server
npm start

# Health check
npm run discover
```

### 5. Monitoring

**Health Endpoints:**
- System Health: `/api/health`
- Service Discovery: Run `npm run discover`
- Individual Services: `/api/health/:serviceName`

**Key Metrics:**
- Service response times
- System overall status
- Individual service health
- Error rates and details

### 6. Scaling Considerations

**Current State (Phase 8):**
- Single-instance deployment
- Shared database across services
- In-memory caching

**Future Scaling (Phase 9+):**
- Multi-instance services
- Distributed caching (Redis)
- Database connection pooling
- Load balancing

### 7. Backup and Recovery

**Database:**
- Automated PostgreSQL backups
- Point-in-time recovery
- Schema migration tracking

**Files:**
- Document storage backup
- Vector embeddings backup
- Configuration backup

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Database | Local PostgreSQL | Managed PostgreSQL |
| Caching | In-memory | Redis |
| Logging | Console | Structured logs |
| Health Checks | Manual | Automated |
| SSL/TLS | HTTP | HTTPS |
| Domain | localhost | Custom domain |
