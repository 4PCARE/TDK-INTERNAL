
export interface MiddlewareConfig {
  name: string;
  path: string;
  description: string;
  enabled: boolean;
  order: number;
  global?: boolean;
}

export const MIDDLEWARE_REGISTRY: MiddlewareConfig[] = [
  {
    name: "smartAuth",
    path: "../smartAuth",
    description: "Smart authentication middleware (supports both Replit and Microsoft auth)",
    enabled: true,
    order: 1,
    global: false
  },
  {
    name: "isAuthenticated",
    path: "../replitAuth",
    description: "Basic Replit authentication check",
    enabled: true,
    order: 2,
    global: false
  },
  {
    name: "isAdmin",
    path: "../replitAuth",
    description: "Admin role validation middleware",
    enabled: true,
    order: 3,
    global: false
  },
  {
    name: "isMicrosoftAuthenticated",
    path: "../microsoftAuth",
    description: "Microsoft authentication check",
    enabled: true,
    order: 4,
    global: false
  }
];

export class MiddlewareLoader {
  private middlewareModules: Map<string, any> = new Map();
  private loadedMiddleware: Map<string, any> = new Map();

  async loadMiddleware(middlewareName: string): Promise<any> {
    if (this.loadedMiddleware.has(middlewareName)) {
      return this.loadedMiddleware.get(middlewareName);
    }

    const config = MIDDLEWARE_REGISTRY.find(m => m.name === middlewareName);
    if (!config) {
      throw new Error(`Middleware config not found for: ${middlewareName}`);
    }

    if (!config.enabled) {
      throw new Error(`Middleware is disabled: ${middlewareName}`);
    }

    try {
      const module = await import(config.path);
      const middleware = module[middlewareName];
      
      if (!middleware) {
        throw new Error(`Middleware function ${middlewareName} not found in module ${config.path}`);
      }

      this.loadedMiddleware.set(middlewareName, middleware);
      console.log(`✅ Loaded middleware: ${middlewareName}`);
      
      return middleware;
    } catch (error) {
      console.error(`❌ Failed to load middleware ${middlewareName}:`, error);
      throw error;
    }
  }

  async loadAllMiddleware(): Promise<void> {
    console.log("🔧 Loading middleware modules...");
    
    const sortedMiddleware = MIDDLEWARE_REGISTRY
      .filter(m => m.enabled)
      .sort((a, b) => a.order - b.order);

    for (const config of sortedMiddleware) {
      try {
        await this.loadMiddleware(config.name);
      } catch (error) {
        console.error(`Failed to load middleware ${config.name}:`, error);
      }
    }

    console.log(`✅ Loaded ${this.loadedMiddleware.size} middleware modules`);
  }

  getMiddleware(name: string): any {
    return this.loadedMiddleware.get(name);
  }

  isLoaded(name: string): boolean {
    return this.loadedMiddleware.has(name);
  }

  getLoadedMiddleware(): string[] {
    return Array.from(this.loadedMiddleware.keys());
  }
}
