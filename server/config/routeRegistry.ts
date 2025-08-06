
export interface RouteConfig {
  name: string;
  path: string;
  handler: string;
  middleware?: string[];
  methods?: string[];
  description?: string;
  enabled: boolean;
  version?: string;
}

export interface RouteModule {
  name: string;
  registerRoutes: (app: any) => void;
  config?: {
    prefix?: string;
    middleware?: string[];
    enabled?: boolean;
  };
}

export const ROUTE_REGISTRY: RouteConfig[] = [
  {
    name: "auth",
    path: "/api/auth",
    handler: "authRoutes",
    middleware: [],
    methods: ["GET", "POST", "PUT", "DELETE"],
    description: "Authentication and user management routes",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "documents",
    path: "/api/documents",
    handler: "documentRoutes", 
    middleware: ["smartAuth"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    description: "Document management and processing routes",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "chat",
    path: "/api/chat",
    handler: "chatRoutes",
    middleware: ["smartAuth"],
    methods: ["GET", "POST", "DELETE"],
    description: "Chat and conversation management routes",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "admin",
    path: "/api/admin",
    handler: "adminRoutes",
    middleware: ["isAdmin"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    description: "Administrative functions and user management",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "agents",
    path: "/api/agents",
    handler: "agentRoutes",
    middleware: ["smartAuth"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    description: "AI agent chatbot management",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "categories",
    path: "/api/categories",
    handler: "categoryRoutes",
    middleware: ["smartAuth"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    description: "Document category management",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "integrations",
    path: "/api/integrations",
    handler: "integrationRoutes",
    middleware: ["smartAuth"],
    methods: ["GET", "POST"],
    description: "Third-party service integrations",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "vectors",
    path: "/api/vectors",
    handler: "vectorRoutes",
    middleware: ["smartAuth"],
    methods: ["GET", "POST"],
    description: "Vector database and search operations",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "data",
    path: "/api/data",
    handler: "dataRoutes",
    middleware: ["smartAuth"],
    methods: ["GET", "POST"],
    description: "Data export and import operations",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "widgets",
    path: "/api/widgets",
    handler: "widgetRoutes",
    middleware: ["smartAuth"],
    methods: ["GET", "POST", "PUT"],
    description: "Chat widget configuration and management",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "surveys",
    path: "/api/surveys",
    handler: "surveyRoutes",
    middleware: ["smartAuth"],
    methods: ["GET", "POST"],
    description: "Survey creation and response collection",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "analytics",
    path: "/api/analytics",
    handler: "analyticsRoutes",
    middleware: ["smartAuth"],
    methods: ["GET"],
    description: "System analytics and reporting",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "ai-feedback",
    path: "/api/ai-feedback",
    handler: "aiFeedbackRoutes",
    middleware: ["smartAuth"],
    methods: ["GET", "POST"],
    description: "AI response feedback collection",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "ai-response-analysis",
    path: "/api/ai-response-analysis",
    handler: "aiResponseAnalysisRoutes",
    middleware: ["smartAuth"],
    methods: ["GET"],
    description: "AI response quality analysis",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "llm-config",
    path: "/api/llm",
    handler: "llmConfigRoutes",
    middleware: ["smartAuth"],
    methods: ["GET", "PUT", "POST"],
    description: "LLM model configuration management",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "line-templates",
    path: "/api/line",
    handler: "lineTemplateRoutes",
    middleware: ["smartAuth"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    description: "LINE messaging template management",
    enabled: true,
    version: "1.0.0"
  },
  {
    name: "route-management",
    path: "/api/system",
    handler: "routeManagementRoutes",
    middleware: ["isAdmin"],
    methods: ["GET", "POST"],
    description: "System route management and monitoring",
    enabled: true,
    version: "1.0.0"
  }
];

export const SPECIAL_ROUTES = [
  {
    name: "hr-api",
    path: "/api/hr",
    handler: "hrApi",
    middleware: [],
    description: "Public HR API endpoints",
    enabled: true,
    public: true
  },
  {
    name: "line-webhook",
    path: "/api/line/webhook",
    handler: "lineOaWebhook",
    middleware: [],
    description: "LINE Official Account webhook",
    enabled: true,
    public: true,
    method: "POST"
  }
];
