
import { Express } from "express";
import { registerAuthRoutes } from "./routes/authRoutes";
import { registerDocumentRoutes } from "./routes/documentRoutes";
import { registerAgentRoutes } from "./routes/agentRoutes";
import { registerWidgetRoutes } from "./routes/widgetRoutes";
import { registerAdminRoutes } from "./routes/adminRoutes";

export function registerRoutes(app: Express): void {
  // Register all route modules
  registerAuthRoutes(app);
  registerDocumentRoutes(app);
  registerAgentRoutes(app);
  registerWidgetRoutes(app);
  registerAdminRoutes(app);
}
