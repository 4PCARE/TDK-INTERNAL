import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { createReplitAuthRouter } from "./replitAuth";
import { imageAnalysisRoute } from './lineImageService';
import viteRoute from "./vite";
import debugRoutes from "./debug-routes";
import debugChunkTest from "./debug-chunk-test";
import { registerHrApiRoutes } from "./hrApi";
import { setupVite, serveStatic, log } from "./vite";
import { registerDatabaseAIRoutes } from "./routes/databaseAIRoutes";

const app = express();

// Session configuration is handled in setupAuth

// CORS configuration for widget endpoints
app.use((req, res, next) => {
  if (req.path.startsWith("/api/widget/") || req.path.startsWith("/widget/")) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static("public"));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Mount debug routes BEFORE registerRoutes to ensure higher priority
  app.use(debugRoutes);
  app.use("/api", debugRoutes);
  app.use("/api", debugChunkTest);

  // Register HR API routes
  registerHrApiRoutes(app);

  const server = await registerRoutes(app);

  // Import and register folder routes
  const { registerFolderRoutes } = await import("./routes/folderRoutes");
  registerFolderRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 80 for production or 5000 for development
  // this serves both the API and the client.
  // const port = process.env.NODE_ENV === 'production' ? 80 : 5000;
  const port = process.env.PORT || 5000;
  const httpServer = server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // Handle graceful shutdown
  const gracefulShutdown = (signal: string) => {
    log(`Received ${signal}. Starting graceful shutdown...`);

    httpServer.close((err) => {
      if (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }

      log('Server closed successfully');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));
})();