import { registerRoutes } from './infrastructure/http/routes.js';

/**
 * Bootstrap CSAT Service
 */
export function createServiceApp(express: any) {
  const app = express();
  
  // Add JSON middleware if available
  try { 
    app.use(express.json ? express.json() : (_: any, __: any, next: any) => next()); 
  } catch {}
  
  // Register routes
  registerRoutes(app);
  
  return app;
}

export { registerRoutes };