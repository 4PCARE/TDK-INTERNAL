import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import pgConnect from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { createReplitAuthRouter } from "./replitAuth";
import { imageAnalysisRoute } from './lineImageService';
import viteRoute from "./vite";
import debugRoutes from "./debug-routes";
import debugChunkTest from "./debug-chunk-test";
import { registerHrApiRoutes } from "./hrApi";
import { setupVite, serveStatic, log } from "./vite";
import { RouteLoader } from "./config/routeLoader";
import { db, pool } from "./db";
import { setupRoutes } from "./config/routeRegistry";
import { startDatabaseKeepAlive } from "./keepAlive";

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

const PgSession = pgConnect(session);

app.use(session({
  store: new PgSession({
    pool: pool,
    tableName: "session",
    errorLog: (err) => {
      console.warn('Session store error (will retry):', err.message);
    },
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || "default-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

(async () => {
  // Mount debug routes BEFORE registerRoutes to ensure higher priority
  app.use(debugRoutes);
  app.use("/api", debugRoutes);
  app.use("/api", debugChunkTest);

  // Register HR API routes
  registerHrApiRoutes(app);

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Use the dynamic route loader
  const routeLoader = new RouteLoader(app);
  await routeLoader.registerAllRoutes();

  // Global error handler for API routes - ensure JSON responses
  app.use('/api/*', (err: any, req: any, res: any, next: any) => {
    console.error('API Error:', err);

    // Always respond with JSON for API routes
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
      res.status(err.status || 500).json({
        error: err.name || 'Internal Server Error',
        message: err.message || 'An unexpected error occurred'
      });
    }
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

  // Start database keep-alive service
  startDatabaseKeepAlive();

  app.listen(port, "0.0.0.0", () => {
    console.log(`${new Date().toLocaleTimeString()} [express] serving on port ${port}`);
  });

  // Handle graceful shutdown
  const gracefulShutdown = (signal: string) => {
    log(`Received ${signal}. Starting graceful shutdown...`);

    server.close((err) => {
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