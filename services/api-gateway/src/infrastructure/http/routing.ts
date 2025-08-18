
import { Request, Response } from 'express';

// Service URLs - these should be environment variables in production
const SERVICE_URLS = {
  auth: process.env.AUTH_SVC_URL || 'http://localhost:3001',
  docIngest: process.env.DOC_INGEST_SVC_URL || 'http://localhost:3002',
  search: process.env.SEARCH_SVC_URL || 'http://localhost:3004',
  agent: process.env.AGENT_SVC_URL || 'http://localhost:3005',
  embedding: process.env.EMBEDDING_SVC_URL || 'http://localhost:3006',
  csat: process.env.CSAT_SVC_URL || 'http://localhost:3008',
  legacy: process.env.LEGACY_BASE_URL || 'http://localhost:5000'
};

export interface RouteConfig {
  pattern: RegExp;
  service: string;
  rewrite?: (path: string) => string;
  requireAuth?: boolean;
}

export const routes: RouteConfig[] = [
  // Health check routes
  { pattern: /^\/healthz$/, service: 'gateway', requireAuth: false },
  { pattern: /^\/health\/(auth|doc-ingest|search|agent|embedding|csat)$/, service: 'health', requireAuth: false },

  // Authentication routes (direct to auth service)
  { pattern: /^\/me$/, service: SERVICE_URLS.auth, requireAuth: false },
  { pattern: /^\/login$/, service: SERVICE_URLS.auth, requireAuth: false },
  { pattern: /^\/refresh$/, service: SERVICE_URLS.auth, requireAuth: false },
  { pattern: /^\/logout$/, service: SERVICE_URLS.auth, requireAuth: false },
  { pattern: /^\/roles$/, service: SERVICE_URLS.auth, requireAuth: false },

  // Document ingestion routes
  { pattern: /^\/api\/documents/, service: SERVICE_URLS.docIngest, rewrite: (path) => path.replace('/api', ''), requireAuth: true },

  // Agent/Chat routes
  { pattern: /^\/api\/chat/, service: SERVICE_URLS.agent, rewrite: (path) => path.replace('/api', ''), requireAuth: true },
  { pattern: /^\/api\/agents/, service: SERVICE_URLS.agent, rewrite: (path) => path.replace('/api', ''), requireAuth: true },

  // Search routes (will be implemented next)
  { pattern: /^\/api\/search/, service: SERVICE_URLS.search, rewrite: (path) => path.replace('/api', ''), requireAuth: true },

  // Embedding routes (will be implemented next)
  { pattern: /^\/api\/embeddings/, service: SERVICE_URLS.embedding, rewrite: (path) => path.replace('/api', ''), requireAuth: true },

  // CSAT routes (will be implemented next)
  { pattern: /^\/api\/csat/, service: SERVICE_URLS.csat, rewrite: (path) => path.replace('/api', ''), requireAuth: true },

  // Legacy fallback (everything else goes to legacy server for now)
  { pattern: /.*/, service: SERVICE_URLS.legacy, requireAuth: false }
];

export function findRoute(path: string): RouteConfig | null {
  for (const route of routes) {
    if (route.pattern.test(path)) {
      return route;
    }
  }
  return null;
}

export function getTargetUrl(route: RouteConfig, originalPath: string): string {
  if (route.service === 'gateway') {
    return ''; // Handle locally
  }
  
  if (route.service === 'health') {
    const serviceName = originalPath.split('/')[2];
    const serviceUrl = SERVICE_URLS[serviceName as keyof typeof SERVICE_URLS];
    return `${serviceUrl}/healthz`;
  }

  const targetPath = route.rewrite ? route.rewrite(originalPath) : originalPath;
  return `${route.service}${targetPath}`;
}
