
import type { Express } from "express";
import { ROUTE_REGISTRY, SPECIAL_ROUTES, type RouteConfig } from "./routeRegistry";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class RouteLoader {
  private app: Express;
  private registeredRoutes: Set<string> = new Set();
  private routeModules: Map<string, any> = new Map();

  constructor(app: Express) {
    this.app = app;
  }

  async loadRouteModule(routeName: string): Promise<any> {
    if (this.routeModules.has(routeName)) {
      return this.routeModules.get(routeName);
    }

    try {
      // Convert route name to file path
      const fileName = this.getRouteFileName(routeName);
      const modulePath = path.join(__dirname, '..', 'routes', fileName);
      
      const module = await import(modulePath);
      this.routeModules.set(routeName, module);
      
      return module;
    } catch (error) {
      console.error(`Failed to load route module ${routeName}:`, error);
      throw error;
    }
  }

  private getRouteFileName(routeName: string): string {
    // Map route names to actual file names
    const routeFileMap: Record<string, string> = {
      'auth': 'authRoutes.ts',
      'documents': 'documentRoutes.ts',
      'chat': 'chatRoutes.ts',
      'admin': 'adminRoutes.ts',
      'agents': 'agentRoutes.ts',
      'categories': 'categoryRoutes.ts',
      'integrations': 'integrationRoutes.ts',
      'vectors': 'vectorRoutes.ts',
      'data': 'dataRoutes.ts',
      'widgets': 'widgetRoutes.ts',
      'surveys': 'surveyRoutes.ts',
      'analytics': 'analyticsRoutes.ts',
      'ai-feedback': 'aiFeedbackRoutes.ts',
      'ai-response-analysis': 'aiResponseAnalysisRoutes.ts',
      'llm-config': 'llmConfigRoutes.ts',
      'line-templates': 'lineTemplateRoutes.ts',
      'route-management': 'routeManagementRoutes.ts'
    };

    return routeFileMap[routeName] || `${routeName}Routes.ts`;
  }

  private getRegisterFunctionName(routeName: string): string {
    // Map route names to their register function names
    const functionMap: Record<string, string> = {
      'auth': 'registerAuthRoutes',
      'documents': 'registerDocumentRoutes',
      'chat': 'registerChatRoutes',
      'admin': 'registerAdminRoutes',
      'agents': 'registerAgentRoutes',
      'categories': 'registerCategoryRoutes',
      'integrations': 'registerIntegrationRoutes',
      'vectors': 'registerVectorRoutes',
      'data': 'registerDataRoutes',
      'widgets': 'registerWidgetRoutes',
      'surveys': 'registerSurveyRoutes',
      'analytics': 'registerAnalyticsRoutes',
      'ai-feedback': 'registerAiFeedbackRoutes',
      'ai-response-analysis': 'registerAiResponseAnalysisRoutes',
      'llm-config': 'registerLlmConfigRoutes',
      'line-templates': 'registerLineTemplateRoutes',
      'route-management': 'registerRouteManagementRoutes'
    };

    return functionMap[routeName] || `register${this.capitalize(routeName)}Routes`;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  async registerRoute(routeConfig: RouteConfig): Promise<boolean> {
    try {
      if (!routeConfig.enabled) {
        console.log(`🚫 Skipping disabled route: ${routeConfig.name}`);
        return false;
      }

      if (this.registeredRoutes.has(routeConfig.name)) {
        console.log(`⚠️  Route ${routeConfig.name} already registered`);
        return false;
      }

      console.log(`📡 Loading route module: ${routeConfig.name}`);
      const module = await this.loadRouteModule(routeConfig.name);
      const registerFunctionName = this.getRegisterFunctionName(routeConfig.name);
      
      if (typeof module[registerFunctionName] === 'function') {
        module[registerFunctionName](this.app);
        this.registeredRoutes.add(routeConfig.name);
        
        console.log(`✅ Successfully registered route: ${routeConfig.name} -> ${routeConfig.path}`);
        return true;
      } else {
        console.error(`❌ Route module ${routeConfig.name} does not export ${registerFunctionName}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Failed to register route ${routeConfig.name}:`, error);
      return false;
    }
  }

  async registerAllRoutes(): Promise<void> {
    console.log("🚀 Starting dynamic route registration...");

    // Register main API routes
    for (const routeConfig of ROUTE_REGISTRY) {
      await this.registerRoute(routeConfig);
    }

    // Register special routes
    await this.registerSpecialRoutes();

    console.log(`✅ Route registration complete. Registered ${this.registeredRoutes.size} routes.`);
    console.log(`📋 Registered routes: ${Array.from(this.registeredRoutes).join(', ')}`);
  }

  private async registerSpecialRoutes(): Promise<void> {
    console.log("🔧 Registering special routes...");

    for (const route of SPECIAL_ROUTES) {
      try {
        if (!route.enabled) {
          console.log(`🚫 Skipping disabled special route: ${route.name}`);
          continue;
        }

        if (route.name === 'hr-api') {
          const { registerHrApiRoutes } = await import('../hrApi');
          registerHrApiRoutes(this.app);
          console.log(`✅ Registered special route: ${route.name}`);
        } else if (route.name === 'line-webhook') {
          const { handleLineWebhook } = await import('../lineOaWebhook');
          this.app.post(route.path, handleLineWebhook);
          console.log(`✅ Registered special route: ${route.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to register special route ${route.name}:`, error);
      }
    }
  }

  getRegisteredRoutes(): string[] {
    return Array.from(this.registeredRoutes);
  }

  isRouteRegistered(routeName: string): boolean {
    return this.registeredRoutes.has(routeName);
  }

  async reloadRoute(routeName: string): Promise<boolean> {
    try {
      // Remove from cache
      this.routeModules.delete(routeName);
      this.registeredRoutes.delete(routeName);

      // Find route config
      const routeConfig = ROUTE_REGISTRY.find(r => r.name === routeName);
      if (!routeConfig) {
        console.error(`Route config not found for: ${routeName}`);
        return false;
      }

      // Re-register
      return await this.registerRoute(routeConfig);
    } catch (error) {
      console.error(`Failed to reload route ${routeName}:`, error);
      return false;
    }
  }
}
