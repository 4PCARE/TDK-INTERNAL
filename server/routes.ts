
import { Express } from "express";
import { authRoutes } from "./routes/authRoutes";
import { documentRoutes } from "./routes/documentRoutes";
import { agentRoutes } from "./routes/agentRoutes";
import { widgetRoutes } from "./routes/widgetRoutes";
import { adminRoutes } from "./routes/adminRoutes";

export function registerRoutes(app: Express): void {
  // Register all route modules
  authRoutes(app);
  documentRoutes(app);
  agentRoutes(app);
  widgetRoutes(app);
  adminRoutes(app);
}
