
import type { Express } from "express";
import { isAdmin } from "../replitAuth";
import { ROUTE_REGISTRY } from "../config/routeRegistry";
import { apiRegistry } from "../config/apiRegistry";

export function registerRouteManagementRoutes(app: Express) {
  // Get all registered routes
  app.get("/api/system/routes", isAdmin, async (req: any, res) => {
    try {
      const routeLoader = (global as any).routeLoader;
      
      const routeStatus = ROUTE_REGISTRY.map(route => ({
        ...route,
        isRegistered: routeLoader ? routeLoader.isRouteRegistered(route.name) : false
      }));

      res.json({
        routes: routeStatus,
        totalRoutes: ROUTE_REGISTRY.length,
        registeredRoutes: routeLoader ? routeLoader.getRegisteredRoutes().length : 0
      });
    } catch (error) {
      console.error("Error fetching routes:", error);
      res.status(500).json({ message: "Failed to fetch routes" });
    }
  });

  // Reload a specific route
  app.post("/api/system/routes/:routeName/reload", isAdmin, async (req: any, res) => {
    try {
      const { routeName } = req.params;
      const routeLoader = (global as any).routeLoader;

      if (!routeLoader) {
        return res.status(500).json({ message: "Route loader not available" });
      }

      const success = await routeLoader.reloadRoute(routeName);
      
      if (success) {
        res.json({ 
          message: `Route ${routeName} reloaded successfully`,
          success: true
        });
      } else {
        res.status(400).json({ 
          message: `Failed to reload route ${routeName}`,
          success: false
        });
      }
    } catch (error) {
      console.error("Error reloading route:", error);
      res.status(500).json({ message: "Failed to reload route" });
    }
  });

  // Get API documentation (OpenAPI spec)
  app.get("/api/system/docs", async (req: any, res) => {
    try {
      const openApiSpec = apiRegistry.generateOpenApiSpec();
      res.json(openApiSpec);
    } catch (error) {
      console.error("Error generating API docs:", error);
      res.status(500).json({ message: "Failed to generate API documentation" });
    }
  });

  // Get route statistics
  app.get("/api/system/stats", isAdmin, async (req: any, res) => {
    try {
      const healthSummary = apiRegistry.getHealthSummary();
      const routeStats = Object.fromEntries(apiRegistry.getRouteStats());
      
      res.json({
        health: healthSummary,
        routes: routeStats
      });
    } catch (error) {
      console.error("Error fetching route stats:", error);
      res.status(500).json({ message: "Failed to fetch route statistics" });
    }
  });

  // Get system health
  app.get("/api/system/health", async (req: any, res) => {
    try {
      const health = apiRegistry.getHealthSummary();
      res.json({
        status: "healthy",
        ...health
      });
    } catch (error) {
      console.error("Error fetching system health:", error);
      res.status(500).json({ 
        status: "unhealthy",
        message: "Failed to fetch system health" 
      });
    }
  });
}
