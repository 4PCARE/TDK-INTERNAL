import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  integer,
  boolean,
  real,
  date,
  uniqueIndex,
  InferInsertModel,
  InferSelectModel,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  role: text("role").notNull().default("user"),
  departmentId: integer("department_id").references(() => departments.id),
  loginMethod: text("login_method").notNull().default("replit"), // 'replit' or 'microsoft'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Document categories
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  color: varchar("color").notNull().default("#3B82F6"),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Documents
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  fileName: varchar("file_name").notNull(),
  filePath: varchar("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type").notNull(),
  content: text("content"), // Extracted text content
  summary: text("summary"), // AI-generated summary
  tags: text("tags").array(), // AI-generated tags
  aiCategory: varchar("ai_category", { length: 50 }), // AI-classified category
  aiCategoryColor: varchar("ai_category_color", { length: 10 }), // Category color
  categoryId: integer("category_id").references(() => categories.id),
  folderId: integer("folder_id").references(() => folders.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  isPublic: boolean("is_public").default(false),
  isFavorite: boolean("is_favorite").default(false),
  processedAt: timestamp("processed_at"),
  // Endorsement fields
  isEndorsed: boolean("is_endorsed").default(false),
  endorsedBy: varchar("endorsed_by").references(() => users.id),
  endorsedAt: timestamp("endorsed_at"),
  effectiveStartDate: date("effective_start_date"),
  effectiveEndDate: date("effective_end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Document translations for caching
export const documentTranslations = pgTable("document_translations", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  language: varchar("language").notNull(), // 'thai', 'english', 'chinese'
  translatedSummary: text("translated_summary"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Document vectors for semantic search
export const documentVectors = pgTable("document_vectors", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  totalChunks: integer("total_chunks").notNull(),
  content: text("content").notNull(),
  embedding: real("embedding").array().notNull(), // Keep original column for production stability
  embeddingMulti: jsonb("embedding_multi").$type<{
    openai?: number[];
    gemini?: number[];
  }>(), // New multi-provider column (nullable for gradual migration)
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Chat conversations
export const chatConversations = pgTable("chat_conversations", {
  id: serial("id").primaryKey(),
  title: varchar("title").notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat messages
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => chatConversations.id).notNull(),
  role: varchar("role").notNull(), // user, assistant
  content: text("content").notNull(),
  documentIds: integer("document_ids").array(), // Referenced documents
  createdAt: timestamp("created_at").defaultNow(),
});

// Document access logs
export const documentAccess = pgTable("document_access", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  accessType: varchar("access_type").notNull(), // view, download, edit
  createdAt: timestamp("created_at").defaultNow(),
});

// Data connections table for database and API connections
export const dataConnections = pgTable("data_connections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  type: varchar("type").notNull(), // 'database', 'api', or 'enterprise'

  // Database connection fields
  dbType: varchar("db_type"), // 'postgresql', 'mysql', 'sqlserver', 'oracle', 'redshift', 'snowflake', 'tidb'
  host: varchar("host"),
  port: integer("port"),
  database: varchar("database"),
  username: varchar("username"),
  password: varchar("password"), // encrypted
  connectionString: text("connection_string"), // encrypted

  // API connection fields
  apiUrl: text("api_url"),
  method: varchar("method"), // 'GET', 'POST', 'PUT', 'DELETE'
  headers: jsonb("headers"),
  body: text("body"),
  authType: varchar("auth_type"), // 'none', 'basic', 'bearer', 'api_key'
  authConfig: jsonb("auth_config"), // stores auth credentials

  // Enterprise system fields
  enterpriseType: varchar("enterprise_type"), // 'salesforce', 'sap', 'oracle_erp', 'microsoft_dynamics'
  instanceUrl: varchar("instance_url"), // For Salesforce, SAP, etc.
  clientId: varchar("client_id"),
  clientSecret: varchar("client_secret"),

  isActive: boolean("is_active").default(true),
  lastTested: timestamp("last_tested"),
  testStatus: varchar("test_status"), // 'success', 'failed', 'pending'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  categories: many(categories),
  chatConversations: many(chatConversations),
  documentAccess: many(documentAccess),
  dataConnections: many(dataConnections),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [documents.categoryId],
    references: [categories.id],
  }),
  folder: one(folders, {
    fields: [documents.folderId],
    references: [folders.id],
  }),
  accessLogs: many(documentAccess),
  translations: many(documentTranslations),
}));

export const documentTranslationsRelations = relations(documentTranslations, ({ one }) => ({
  document: one(documents, {
    fields: [documentTranslations.documentId],
    references: [documents.id],
  }),
}));

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  user: one(users, {
    fields: [chatConversations.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));

export const documentAccessRelations = relations(documentAccess, ({ one }) => ({
  document: one(documents, {
    fields: [documentAccess.documentId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [documentAccess.userId],
    references: [users.id],
  }),
}));

export const dataConnectionsRelations = relations(dataConnections, ({ one }) => ({
  user: one(users, {
    fields: [dataConnections.userId],
    references: [users.id],
  }),
}));

// HR and Widget tables
export const hrEmployees = pgTable("hr_employees", {
  id: serial("id").primaryKey(),
  employeeId: varchar("employee_id").notNull().unique(),
  citizenId: varchar("citizen_id", { length: 13 }).notNull().unique(),
  name: varchar("name").notNull(),
  department: varchar("department").notNull(),
  position: varchar("position").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),
  hireDate: timestamp("hire_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Live Chat Widget configurations
export const chatWidgets = pgTable("chat_widgets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  widgetKey: varchar("widget_key", { length: 255 }).notNull().unique(),
  isActive: boolean("is_active").default(true),
  agentId: integer("agent_id"),
  primaryColor: varchar("primary_color", { length: 7 }).default("#2563eb"),
  textColor: varchar("text_color", { length: 7 }).default("#ffffff"),
  position: varchar("position", { length: 50 }).default("bottom-right"),
  welcomeMessage: text("welcome_message").default("Hi! How can I help you today?"),
  offlineMessage: text("offline_message").default("We're currently offline. Please leave a message."),
  enableHrLookup: boolean("enable_hr_lookup").default(false),
  hrApiEndpoint: varchar("hr_api_endpoint", { length: 255 }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  isPlatformWidget: boolean("is_platform_widget").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  maxFileSize: integer("max_file_size").default(25),
  allowedFileTypes: text("allowed_file_types").array().default(['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'json']),
  retentionDays: integer("retention_days").default(365),
  autoBackup: boolean("auto_backup").default(false),
  enableAnalytics: boolean("enable_analytics").default(true),
  enablePlatformLiveChat: boolean("enable_platform_live_chat").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Widget chat sessions
export const widgetChatSessions = pgTable("widget_chat_sessions", {
  id: serial("id").primaryKey(),
  widgetId: integer("widget_id").notNull(),
  sessionId: varchar("session_id").notNull().unique(),
  visitorId: varchar("visitor_id"),
  visitorName: varchar("visitor_name"),
  visitorEmail: varchar("visitor_email"),
  visitorPhone: varchar("visitor_phone"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Widget chat messages
export const widgetChatMessages = pgTable("widget_chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  content: text("content").notNull(),
  messageType: varchar("message_type", { length: 50 }).default("text"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatWidgetsRelations = relations(chatWidgets, ({ one, many }) => ({
  user: one(users, {
    fields: [chatWidgets.userId],
    references: [users.id],
  }),
  agent: one(agentChatbots, {
    fields: [chatWidgets.agentId],
    references: [agentChatbots.id],
  }),
  sessions: many(widgetChatSessions),
}));

export const widgetChatSessionsRelations = relations(widgetChatSessions, ({ one, many }) => ({
  widget: one(chatWidgets, {
    fields: [widgetChatSessions.widgetId],
    references: [chatWidgets.id],
  }),
  messages: many(widgetChatMessages),
}));

export const widgetChatMessagesRelations = relations(widgetChatMessages, ({ one }) => ({
  session: one(widgetChatSessions, {
    fields: [widgetChatMessages.sessionId],
    references: [widgetChatSessions.sessionId],
  }),
}));

// AI Assistant Feedback System for RLHF preparation
export const aiAssistantFeedback = pgTable("ai_assistant_feedback", {
  id: serial("id").primaryKey(),
  chatMessageId: integer("chat_message_id").references(() => chatMessages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  userQuery: text("user_query").notNull(),
  assistantResponse: text("assistant_response").notNull(),
  feedbackType: varchar("feedback_type").notNull(), // 'helpful', 'not_helpful'
  userNote: text("user_note"), // Optional explanation for negative feedback
  documentContext: jsonb("document_context"), // Which documents were referenced
  conversationId: integer("conversation_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiAssistantFeedbackRelations = relations(aiAssistantFeedback, ({ one }) => ({
  chatMessage: one(chatMessages, {
    fields: [aiAssistantFeedback.chatMessageId],
    references: [chatMessages.id],
  }),
}));

// AI Response Analysis System for analyzing bot responses
export const aiResponseAnalysis = pgTable("ai_response_analysis", {
  id: serial("id").primaryKey(),
  chatMessageId: integer("chat_message_id").references(() => chatMessages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  userQuery: text("user_query").notNull(),
  assistantResponse: text("assistant_response").notNull(),
  analysisResult: varchar("analysis_result").notNull(), // 'positive', 'fallback'
  analysisConfidence: real("analysis_confidence"), // 0.0 to 1.0
  analysisReason: text("analysis_reason"), // Why the AI classified it this way
  documentContext: jsonb("document_context"), // Which documents were referenced
  responseTime: integer("response_time"), // Response time in milliseconds
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiResponseAnalysisRelations = relations(aiResponseAnalysis, ({ one }) => ({
  chatMessage: one(chatMessages, {
    fields: [aiResponseAnalysis.chatMessageId],
    references: [chatMessages.id],
  }),
}));

// Insert schemas
export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
}).partial();

export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertDataConnectionSchema = createInsertSchema(dataConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateDataConnectionSchema = createInsertSchema(dataConnections).omit({
  id: true,
  userId: true,
  createdAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect & { documentCount?: number };
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type UpdateDocument = z.infer<typeof updateDocumentSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type DocumentAccess = typeof documentAccess.$inferSelect;
export type DocumentTranslation = typeof documentTranslations.$inferSelect;
export type InsertDocumentTranslation = typeof documentTranslations.$inferInsert;
export type DocumentVector = typeof documentVectors.$inferSelect;
export type InsertDocumentVector = typeof documentVectors.$inferInsert;
export type DataConnection = typeof dataConnections.$inferSelect;
export type InsertDataConnection = z.infer<typeof insertDataConnectionSchema>;
export type UpdateDataConnection = z.infer<typeof updateDataConnectionSchema>;

// HR and Widget types
export type HrEmployee = typeof hrEmployees.$inferSelect;
export type InsertHrEmployee = typeof hrEmployees.$inferInsert;
export type ChatWidget = typeof chatWidgets.$inferSelect;
export type InsertChatWidget = typeof chatWidgets.$inferInsert;
export type WidgetChatSession = typeof widgetChatSessions.$inferSelect;
export type InsertWidgetChatSession = typeof widgetChatSessions.$inferInsert;
export type WidgetChatMessage = InferSelectModel<typeof widgetChatMessages>;
export type NewWidgetChatMessage = InferInsertModel<typeof widgetChatMessages>;

export type InternalAgentChatSession = InferSelectModel<typeof internalAgentChatSessions>;
export type NewInternalAgentChatSession = InferInsertModel<typeof internalAgentChatSessions>;

export type InternalAgentChatMessage = InferSelectModel<typeof internalAgentChatMessages>;
export type NewInternalAgentChatMessage = InferInsertModel<typeof internalAgentChatMessages>;

// Departments table
export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Document User Permissions (Many-to-Many)
export const documentUserPermissions = pgTable("document_user_permissions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  userId: varchar("user_id").notNull(),
  permissionType: varchar("permission_type").default("read"),
  grantedAt: timestamp("granted_at").defaultNow(),
  grantedBy: varchar("granted_by"),
});

// Document Department Permissions (Many-to-Many)
export const documentDepartmentPermissions = pgTable("document_department_permissions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  departmentId: integer("department_id").notNull(),
  permissionType: varchar("permission_type").default("read"),
  grantedAt: timestamp("granted_at").defaultNow(),
  grantedBy: varchar("granted_by"),
});

// Department relations
export const departmentsRelations = relations(departments, ({ many }) => ({
  users: many(users),
  documentPermissions: many(documentDepartmentPermissions),
}));

// Document User Permissions relations
export const documentUserPermissionsRelations = relations(documentUserPermissions, ({ one }) => ({
  document: one(documents, {
    fields: [documentUserPermissions.documentId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [documentUserPermissions.userId],
    references: [users.id],
  }),
}));

// Document Department Permissions relations
export const documentDepartmentPermissionsRelations = relations(documentDepartmentPermissions, ({ one }) => ({
  document: one(documents, {
    fields: [documentDepartmentPermissions.documentId],
    references: [documents.id],
  }),
  department: one(departments, {
    fields: [documentDepartmentPermissions.departmentId],
    references: [departments.id],
  }),
}));



// Additional types
export type Folder = typeof folders.$inferSelect;
export type InsertFolder = typeof folders.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = typeof departments.$inferInsert;
export type DocumentUserPermission = typeof documentUserPermissions.$inferSelect;
export type InsertDocumentUserPermission = typeof documentUserPermissions.$inferInsert;
export type DocumentDepartmentPermission = typeof documentDepartmentPermissions.$inferSelect;
export type InsertDocumentDepartmentPermission = typeof documentDepartmentPermissions.$inferInsert;

export type AiAssistantFeedback = typeof aiAssistantFeedback.$inferSelect;
export type InsertAiAssistantFeedback = typeof aiAssistantFeedback.$inferInsert;
export type AiResponseAnalysis = typeof aiResponseAnalysis.$inferSelect;
export type InsertAiResponseAnalysis = typeof aiResponseAnalysis.$inferInsert;

// LLM Provider Configuration
export const llmConfig = pgTable("llm_config", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  provider: varchar("provider").notNull().default("OpenAI"), // 'OpenAI' or 'Gemini'
  embeddingProvider: varchar("embedding_provider").notNull().default("OpenAI"), // Track embedding provider separately
  configData: jsonb("config_data"), // Store provider-specific config
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("llm_config_user_idx").on(table.userId),
]);

// Document chunk embeddings with provider tracking
export const documentChunkEmbeddings = pgTable("document_chunk_embeddings", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  embedding: text("embedding").notNull(), // JSON array of embedding vector
  embeddingProvider: varchar("embedding_provider").notNull(), // Track which provider generated this
  embeddingModel: varchar("embedding_model").notNull(), // Track model version
  chunkText: text("chunk_text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("doc_chunk_embedding_idx").on(table.documentId, table.chunkIndex),
  index("embedding_provider_idx").on(table.embeddingProvider),
]);

// Audit logs for compliance tracking
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: varchar("action").notNull(), // 'login', 'logout', 'upload', 'download', 'search', 'translate', 'delete', 'update', 'create', 'api_call'
  resourceId: varchar("resource_id"), // document_id, user_id, category_id, etc.
  resourceType: varchar("resource_type"), // 'document', 'user', 'category', 'api', 'system'
  details: jsonb("details"), // Additional metadata
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  duration: integer("duration"), // in milliseconds
  timestamp: timestamp("timestamp").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// User favorites table for per-user favorite documents
export const userFavorites = pgTable("user_favorites", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userFavoritesRelations = relations(userFavorites, ({ one }) => ({
  user: one(users, {
    fields: [userFavorites.userId],
    references: [users.id],
  }),
  document: one(documents, {
    fields: [userFavorites.documentId],
    references: [documents.id],
  }),
}));

// Agent Chatbot tables
export const agentChatbots = pgTable("agent_chatbots", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  channels: jsonb("channels").$type<string[]>().default([]).notNull(), // ['lineoa', 'facebook', 'tiktok']

  // New personality and capabilities fields
  personality: varchar("personality"), // 'friendly', 'professional', 'energetic', etc.
  profession: varchar("profession"), // 'sales', 'hr', 'it', etc.
  responseStyle: varchar("response_style"), // 'concise', 'detailed', 'conversational', 'educational'
  specialSkills: jsonb("special_skills").$type<string[]>().default([]),

  // Guardrails configuration
  contentFiltering: boolean("content_filtering").default(true),
  toxicityPrevention: boolean("toxicity_prevention").default(true),
  privacyProtection: boolean("privacy_protection").default(true),
  factualAccuracy: boolean("factual_accuracy").default(true),
  responseLength: varchar("response_length").default("medium"), // 'short', 'medium', 'long'
  allowedTopics: jsonb("allowed_topics").$type<string[]>().default([]),
  blockedTopics: jsonb("blocked_topics").$type<string[]>().default([]),

  // Memory configuration for chat history
  memoryEnabled: boolean("memory_enabled").default(true),

  // Search configuration
  searchConfiguration: jsonb("search_configuration").$type<{
    enableCustomSearch?: boolean;
    additionalSearchDetail?: string;
    chunkMaxType?: 'number' | 'percentage';
    chunkMaxValue?: number;
    documentMass?: number;
    tokenLimitEnabled?: boolean;
    tokenLimitType?: 'document' | 'final';
    documentTokenLimit?: number;
    finalTokenLimit?: number;
  }>(),
  memoryLimit: integer("memory_limit").default(10), // Number of previous messages to remember

  lineOaConfig: jsonb("lineoa_config").$type<{
    lineOaId?: string;
    lineOaName?: string;
    accessToken?: string;
  }>(),
  facebookConfig: jsonb("facebook_config").$type<{
    pageId?: string;
    pageName?: string;
    accessToken?: string;
  }>(),
  tiktokConfig: jsonb("tiktok_config").$type<{
    accountId?: string;
    accountName?: string;
    accessToken?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: integer("parent_id"),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agentChatbotDocuments = pgTable("agent_chatbot_documents", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => agentChatbots.id, { onDelete: "cascade" }).notNull(),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentDatabaseConnections = pgTable("agent_database_connections", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => agentChatbots.id, { onDelete: "cascade" }).notNull(),
  connectionId: integer("connection_id").references(() => dataConnections.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Add folder relationship to documents
// Note: You'll need to add folderId: integer("folder_id").references(() => folders.id, { onDelete: "set null" })
// to your existing documents table definition

// Social Media Integrations table
export const socialIntegrations = pgTable("social_integrations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(), // 'lineoa', 'facebook', 'tiktok'
  description: text("description"),
  // Line OA specific fields
  channelId: varchar("channel_id"),
  channelSecret: varchar("channel_secret"),
  channelAccessToken: varchar("channel_access_token"),
  botUserId: varchar("bot_user_id"),
  // Facebook specific fields
  facebookPageId: varchar("facebook_page_id"),
  facebookAccessToken: varchar("facebook_access_token"),
  // TikTok specific fields
  tiktokChannelId: varchar("tiktok_channel_id"),
  tiktokAccessToken: varchar("tiktok_access_token"),
  // Agent assignment
  agentId: integer("agent_id").references(() => agentChatbots.id, { onDelete: "set null" }),
  // Status fields
  isActive: boolean("is_active").default(true),
  isVerified: boolean("is_verified").default(false),
  lastVerifiedAt: timestamp("last_verified_at"),
  // Configuration and metadata
  config: jsonb("config").default({}),
  webhookUrl: varchar("webhook_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations for Agent Chatbots
export const agentChatbotsRelations = relations(agentChatbots, ({ one, many }) => ({
  user: one(users, {
    fields: [agentChatbots.userId],
    references: [users.id],
  }),
  agentDocuments: many(agentChatbotDocuments),
}));

export const agentChatbotDocumentsRelations = relations(agentChatbotDocuments, ({ one }) => ({
  agent: one(agentChatbots, {
    fields: [agentChatbotDocuments.agentId],
    references: [agentChatbots.id],
  }),
  document: one(documents, {
    fields: [agentChatbotDocuments.documentId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [agentChatbotDocuments.userId],
    references: [users.id],
  }),
}));

export const agentDatabaseConnectionsRelations = relations(agentDatabaseConnections, ({ one }) => ({
  agent: one(agentChatbots, {
    fields: [agentDatabaseConnections.agentId],
    references: [agentChatbots.id],
  }),
  connection: one(dataConnections, {
    fields: [agentDatabaseConnections.connectionId],
    references: [dataConnections.id],
  }),
  user: one(users, {
    fields: [agentDatabaseConnections.userId],
    references: [users.id],
  }),
}));

export const socialIntegrationsRelations = relations(socialIntegrations, ({ one }) => ({
  user: one(users, {
    fields: [socialIntegrations.userId],
    references: [users.id],
  }),
  agent: one(agentChatbots, {
    fields: [socialIntegrations.agentId],
    references: [agentChatbots.id],
  }),
}));

// Folder relations
export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
  }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
  }),
  children: many(folders),
  documents: many(documents),
}));

// Insert schemas
export const insertAgentChatbotSchema = createInsertSchema(agentChatbots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAgentChatbotDocumentSchema = createInsertSchema(agentChatbotDocuments).omit({
  id: true,
  createdAt: true,
});

export const insertSocialIntegrationSchema = createInsertSchema(socialIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type UserFavorite = typeof userFavorites.$inferSelect;
export type InsertUserFavorite = typeof userFavorites.$inferInsert;

// Agent Chatbot types
export type AgentChatbot = typeof agentChatbots.$inferSelect;
export type InsertAgentChatbot = z.infer<typeof insertAgentChatbotSchema>;
export type AgentChatbotDocument = typeof agentChatbotDocuments.$inferSelect;
export type InsertAgentChatbotDocument = z.infer<typeof insertAgentChatbotDocumentSchema>;

// Social Integration types
export type SocialIntegration = typeof socialIntegrations.$inferSelect;
export type InsertSocialIntegration = z.infer<typeof insertSocialIntegrationSchema>;

// LLM Configuration types and schemas
export const insertLlmConfigSchema = createInsertSchema(llmConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentChunkEmbeddingSchema = createInsertSchema(documentChunkEmbeddings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LlmConfig = typeof llmConfig.$inferSelect;
export type InsertLlmConfig = z.infer<typeof insertLlmConfigSchema>;
export type DocumentChunkEmbedding = typeof documentChunkEmbeddings.$inferSelect;
export type InsertDocumentChunkEmbedding = z.infer<typeof insertDocumentChunkEmbeddingSchema>;

// Relations for LLM Config
export const llmConfigRelations = relations(llmConfig, ({ one }) => ({
  user: one(users, {
    fields: [llmConfig.userId],
    references: [users.id],
  }),
}));

export const documentChunkEmbeddingsRelations = relations(documentChunkEmbeddings, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunkEmbeddings.documentId],
    references: [documents.id],
  }),
}));

// Chat History table - stores conversation history for each user/channel
export const chatHistory = pgTable("chat_history", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // External user ID (from Line/FB/etc)
  channelType: varchar("channel_type").notNull(), // 'lineoa', 'facebook', 'tiktok', 'web'
  channelId: varchar("channel_id").notNull(), // Channel/Bot ID
  agentId: integer("agent_id").notNull().references(() => agentChatbots.id, { onDelete: "cascade" }),
  messageType: varchar("message_type").notNull(), // 'user', 'assistant'
  content: text("content").notNull(),
  metadata: jsonb("metadata"), // Store additional info like reply tokens, etc.
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("chat_history_user_channel_idx").on(table.userId, table.channelType, table.channelId),
  index("chat_history_agent_idx").on(table.agentId),
  index("chat_history_created_at_idx").on(table.createdAt),
]);

// Chat History schemas
export const insertChatHistorySchema = createInsertSchema(chatHistory).omit({
  id: true,
  createdAt: true,
});

// Chat History types
export type ChatHistory = typeof chatHistory.$inferSelect;
export type InsertChatHistory = z.infer<typeof insertChatHistorySchema>;

// Line Message Templates - Main template table
export const lineMessageTemplates = pgTable("line_message_templates", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  integrationId: integer("integration_id").references(() => socialIntegrations.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  descriptionEmbedding: text("description_embedding"), // Vector embedding for intent matching
  tags: text("tags").array().default([]), // Intent tags for smart matching
  templateType: varchar("template_type").notNull().default("carousel"), // 'carousel', 'flex', 'bubble', etc.
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Line Carousel Columns - Store individual columns for carousel templates
export const lineCarouselColumns = pgTable("line_carousel_columns", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => lineMessageTemplates.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0), // Display order
  thumbnailImageUrl: varchar("thumbnail_image_url").notNull(),
  title: varchar("title").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Line Template Actions - Store actions for each column
export const lineTemplateActions = pgTable("line_template_actions", {
  id: serial("id").primaryKey(),
  columnId: integer("column_id").notNull().references(() => lineCarouselColumns.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0), // Action order (max 3 per column)
  type: varchar("type").notNull(), // 'uri', 'postback', 'message'
  label: varchar("label").notNull(),
  uri: text("uri"), // For 'uri' type actions
  data: text("data"), // For 'postback' type actions
  text: text("text"), // For 'message' type actions
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations for Line Message Templates
export const lineMessageTemplatesRelations = relations(lineMessageTemplates, ({ one, many }) => ({
  user: one(users, {
    fields: [lineMessageTemplates.userId],
    references: [users.id],
  }),
  integration: one(socialIntegrations, {
    fields: [lineMessageTemplates.integrationId],
    references: [socialIntegrations.id],
  }),
  columns: many(lineCarouselColumns),
}));

export const lineCarouselColumnsRelations = relations(lineCarouselColumns, ({ one, many }) => ({
  template: one(lineMessageTemplates, {
    fields: [lineCarouselColumns.templateId],
    references: [lineMessageTemplates.id],
  }),
  actions: many(lineTemplateActions),
}));

export const lineTemplateActionsRelations = relations(lineTemplateActions, ({ one }) => ({
  column: one(lineCarouselColumns, {
    fields: [lineTemplateActions.columnId],
    references: [lineCarouselColumns.id],
  }),
}));

// SQL Snippets table for AI training
export const sqlSnippets = pgTable("sql_snippets", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => dataConnections.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  sql: text("sql").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// AI Database Queries table for query history
export const aiDatabaseQueries = pgTable("ai_database_queries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id").notNull().references(() => dataConnections.id, { onDelete: "cascade" }),
  userQuery: text("user_query").notNull(),
  generatedSql: text("generated_sql"),
  executionResult: jsonb("execution_result"),
  success: boolean("success").notNull(),
  executionTime: integer("execution_time"), // in milliseconds
  createdAt: timestamp("created_at").defaultNow(),
});

// SQL Snippets relations
export const sqlSnippetsRelations = relations(sqlSnippets, ({ one }) => ({
  connection: one(dataConnections, {
    fields: [sqlSnippets.connectionId],
    references: [dataConnections.id],
  }),
  user: one(users, {
    fields: [sqlSnippets.userId],
    references: [users.id],
  }),
}));

// AI Database Queries relations
export const aiDatabaseQueriesRelations = relations(aiDatabaseQueries, ({ one }) => ({
  connection: one(dataConnections, {
    fields: [aiDatabaseQueries.connectionId],
    references: [dataConnections.id],
  }),
  user: one(users, {
    fields: [aiDatabaseQueries.userId],
    references: [users.id],
  }),
}));

// Insert schemas for Line templates
export const insertLineMessageTemplateSchema = createInsertSchema(lineMessageTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLineCarouselColumnSchema = createInsertSchema(lineCarouselColumns).omit({
  id: true,
  createdAt: true,
});

export const insertLineTemplateActionSchema = createInsertSchema(lineTemplateActions).omit({
  id: true,
  createdAt: true,
});

// Line template types
export type LineMessageTemplate = typeof lineMessageTemplates.$inferSelect;
export type InsertLineMessageTemplate = z.infer<typeof insertLineMessageTemplateSchema>;
export type LineCarouselColumn = typeof lineCarouselColumns.$inferSelect;
export type InsertLineCarouselColumn = z.infer<typeof insertLineCarouselColumnSchema>;
export type LineTemplateAction = typeof lineTemplateActions.$inferSelect;
export type InsertLineTemplateAction = z.infer<typeof insertLineTemplateActionSchema>;

// Internal Agent Chat Sessions table
export const internalAgentChatSessions = pgTable("internal_agent_chat_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  agentId: integer("agent_id").notNull().references(() => agentChatbots.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  lastMessageAt: timestamp("last_message_at").notNull(),
  messageCount: integer("message_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const internalAgentChatMessages = pgTable("internal_agent_chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => internalAgentChatSessions.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInternalAgentChatSessionSchema = createInsertSchema(internalAgentChatSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInternalAgentChatMessageSchema = createInsertSchema(internalAgentChatMessages).omit({
  id: true,
  createdAt: true,
});

export type InternalAgentChatSession = typeof internalAgentChatSessions.$inferSelect;
export type InsertInternalAgentChatSession = z.infer<typeof insertInternalAgentChatSessionSchema>;
export type InternalAgentChatMessage = typeof internalAgentChatMessages.$inferSelect;
export type InsertInternalAgentChatMessage = z.infer<typeof insertInternalAgentChatMessageSchema>;

// SQL Snippets schemas and types
export const insertSQLSnippetSchema = createInsertSchema(sqlSnippets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAIDatabaseQuerySchema = createInsertSchema(aiDatabaseQueries).omit({
  id: true,
  createdAt: true,
});

export type SQLSnippet = typeof sqlSnippets.$inferSelect;
export type InsertSQLSnippet = z.infer<typeof insertSQLSnippetSchema>;
export type AIDatabaseQuery = typeof aiDatabaseQueries.$inferSelect;
export type InsertAIDatabaseQuery = z.infer<typeof insertAIDatabaseQuerySchema>;
// Web search configuration for agents
export const agentWebSearchConfig = pgTable("agent_web_search_config", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => agentChatbots.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  whitelistedDomains: jsonb("whitelisted_domains").$type<Array<{
    domain: string;
    description: string;
    searchKeywords: string[];
    priority: number;
    isActive: boolean;
  }>>().default([]),
  maxResultsPerDomain: integer("max_results_per_domain").default(2),
  enableAutoTrigger: boolean("enable_auto_trigger").default(true),
  searchConfidenceThreshold: real("search_confidence_threshold").default(0.7),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agentWebSearchConfigRelations = relations(agentWebSearchConfig, ({ one }) => ({
  agent: one(agentChatbots, {
    fields: [agentWebSearchConfig.agentId],
    references: [agentChatbots.id],
  }),
  user: one(users, {
    fields: [agentWebSearchConfig.userId],
    references: [users.id],
  }),
}));

// Web search logs for tracking usage
export const webSearchLogs = pgTable("web_search_logs", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => agentChatbots.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id).notNull(),
  query: text("query").notNull(),
  domainsSearched: text("domains_searched").array(),
  resultsFound: integer("results_found").default(0),
  searchTriggered: boolean("search_triggered").default(false),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const webSearchLogsRelations = relations(webSearchLogs, ({ one }) => ({
  agent: one(agentChatbots, {
    fields: [webSearchLogs.agentId],
    references: [agentChatbots.id],
  }),
  user: one(users, {
    fields: [webSearchLogs.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertAgentWebSearchConfigSchema = createInsertSchema(agentWebSearchConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWebSearchLogSchema = createInsertSchema(webSearchLogs).omit({
  id: true,
  createdAt: true,
});

// Types
export type AgentWebSearchConfig = typeof agentWebSearchConfig.$inferSelect;
export type InsertAgentWebSearchConfig = z.infer<typeof insertAgentWebSearchConfigSchema>;
export type WebSearchLog = typeof webSearchLogs.$inferSelect;
export type InsertWebSearchLog = z.infer<typeof insertWebSearchLogSchema>;
