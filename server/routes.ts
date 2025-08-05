import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./replitAuth";
import { setupMicrosoftAuth } from "./microsoftAuth";
import { registerHrApiRoutes } from "./hrApi";
import { handleLineWebhook } from "./lineOaWebhook";
import path from "path";
import * as fsSync from "fs";

// Import modular route handlers
import { registerAuthRoutes } from "./routes/authRoutes";
import { registerCategoryRoutes } from "./routes/categoryRoutes";
import { registerDocumentRoutes } from "./routes/documentRoutes";
import { registerChatRoutes } from "./routes/chatRoutes";
import { registerAgentRoutes } from "./routes/agentRoutes";
import { registerAdminRoutes } from "./routes/adminRoutes";
import { registerIntegrationRoutes } from "./routes/integrationRoutes";
import { registerVectorRoutes } from "./routes/vectorRoutes";
import { registerDataRoutes } from "./routes/dataRoutes";
import { registerWidgetRoutes } from "./routes/widgetRoutes";
import { registerSurveyRoutes } from "./routes/surveyRoutes";
import { registerAnalyticsRoutes } from "./routes/analyticsRoutes";
import { registerAiFeedbackRoutes } from "./routes/aiFeedbackRoutes";
import { registerAiResponseAnalysisRoutes } from "./routes/aiResponseAnalysisRoutes";
import { registerLlmConfigRoutes } from "./routes/llmConfigRoutes";
import { registerLineTemplateRoutes } from "./routes/lineTemplateRoutes";
import { registerPythonProxyRoutes } from "./routes/pythonProxyRoutes";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);
  await setupMicrosoftAuth(app);

  // Serve uploaded files and Line images
  const uploadsPath = path.join(process.cwd(), 'uploads');
  const lineImagesPath = path.join(uploadsPath, 'line-images');

  // Ensure directories exist
  if (!fsSync.existsSync(uploadsPath)) {
    fsSync.mkdirSync(uploadsPath, { recursive: true });
  }
  if (!fsSync.existsSync(lineImagesPath)) {
    fsSync.mkdirSync(lineImagesPath, { recursive: true });
  }

  app.use('/uploads', express.static(uploadsPath));

  // Register public HR API routes (no authentication required)
  registerHrApiRoutes(app);

  // Register modular routes
  registerAuthRoutes(app);
  registerCategoryRoutes(app);
  registerDocumentRoutes(app);
  registerChatRoutes(app);
  registerAgentRoutes(app);
  registerAdminRoutes(app);
  registerIntegrationRoutes(app);
  registerVectorRoutes(app);
  registerDataRoutes(app);
  registerWidgetRoutes(app);
  registerSurveyRoutes(app);
  registerAnalyticsRoutes(app);
  registerAiFeedbackRoutes(app);
  registerAiResponseAnalysisRoutes(app);
  registerLlmConfigRoutes(app);
  registerLineTemplateRoutes(app);
  registerPythonProxyRoutes(app);

  // Line OA Webhook endpoint (no authentication required)
  app.post("/api/line/webhook", handleLineWebhook);

  const httpServer = createServer(app);

  // Create WebSocket server on /ws path to avoid conflicts with Vite HMR
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws' 
  });

  // Store connected WebSocket clients
  const wsClients = new Set<WebSocket>();

  // Also store global reference for widget message broadcasting
  (global as any).wsClients = wsClients;

  wss.on('connection', (ws, req) => {
    console.log('🔌 WebSocket client connected:', {
      url: req.url,
      origin: req.headers.origin,
      userAgent: req.headers['user-agent']?.substring(0, 50) + '...',
      totalClients: wsClients.size + 1
    });

    wsClients.add(ws);
    console.log('📊 WebSocket clients count:', wsClients.size);

    // Send initial connection confirmation
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to Agent Console WebSocket'
      }));
    }

    // Handle incoming messages from client
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 WebSocket message received:', message);

        // Handle different message types if needed
        if (message.type === 'subscribe') {
          console.log('📡 Client subscribed to Agent Console updates');
        }
      } catch (error) {
        console.error('❌ WebSocket message parse error:', error);
      }
    });

    // Clean up on disconnect
    ws.on('close', () => {
      console.log('🔌 WebSocket client disconnected');
      wsClients.delete(ws);
      console.log('📊 Remaining WebSocket clients:', wsClients.size);
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      wsClients.delete(ws);
      console.log('📊 Remaining WebSocket clients after error:', wsClients.size);
    });
  });

  // Export function to broadcast messages to all connected clients
  (global as any).broadcastToAgentConsole = (message: any) => {
    console.log(`📡 Broadcasting to ${wsClients.size} connected clients:`, message);

    wsClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error('❌ Error sending WebSocket message:', error);
          wsClients.delete(client);
        }
      } else {
        wsClients.delete(client);
      }
    });
  };

  return httpServer;
}