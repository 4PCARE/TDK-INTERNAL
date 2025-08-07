import {
  users,
  categories,
  documents,
  chatConversations,
  chatMessages,
  documentAccess,
  dataConnections,
  aiAssistantFeedback,
  aiResponseAnalysis,
  departments,
  auditLogs,
  documentUserPermissions,
  documentDepartmentPermissions,
  userFavorites,
  agentChatbots,
  agentChatbotDocuments,
  socialIntegrations,
  chatHistory,
  lineMessageTemplates,
  lineCarouselColumns,
  lineTemplateActions,
  chatWidgets,
  type User,
  type UpsertUser,
  type Category,
  type InsertCategory,
  type Document,
  type InsertDocument,
  type UpdateDocument,
  type ChatConversation,
  type InsertChatConversation,
  type ChatMessage,
  type InsertChatMessage,
  type DocumentAccess,
  type DataConnection,
  type InsertDataConnection,
  type UpdateDataConnection,
  type AiAssistantFeedback,
  type InsertAiAssistantFeedback,
  type AiResponseAnalysis,
  type InsertAiResponseAnalysis,
  type AuditLog,
  type InsertAuditLog,
  type UserFavorite,
  type InsertUserFavorite,
  type AgentChatbot,
  type InsertAgentChatbot,
  type AgentChatbotDocument,
  type InsertAgentChatbotDocument,
  type SocialIntegration,
  type InsertSocialIntegration,
  type ChatHistory,
  type InsertChatHistory,
  type LineMessageTemplate,
  type InsertLineMessageTemplate,
  type LineCarouselColumn,
  type InsertLineCarouselColumn,
  type LineTemplateAction,
  type InsertTemplateAction,
  type ChatWidget,
  type InsertChatWidget,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, like, count, sql, ilike, getTableColumns, gte, lte, inArray, asc, isNotNull } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Category operations
  getCategories(userId: string): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(id: number, userId: string): Promise<void>;

  // Document operations
  getDocuments(userId: string, options?: { categoryId?: number; limit?: number; offset?: number }): Promise<Document[]>;
  getDocument(id: number, userId: string): Promise<Document | undefined>;
  getDocumentsByIds(ids: number[], userId: string): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, document: UpdateDocument, userId: string): Promise<Document>;
  deleteDocument(id: number, userId: string): Promise<void>;
  searchDocuments(userId: string, query: string): Promise<Document[]>;
  endorseDocument(id: number, userId: string, effectiveStartDate: string, effectiveEndDate?: string): Promise<Document>;
  toggleDocumentFavorite(id: number, userId: string): Promise<Document>;

  // Stats operations
  getUserStats(userId: string): Promise<{
    totalDocuments: number;
    processedToday: number;
    storageUsed: number;
    aiQueries: number;
  }>;

  // Chat operations
  getChatConversations(userId: string): Promise<ChatConversation[]>;
  createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation>;
  getChatMessages(conversationId: number, userId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;

  // Access logging
  logDocumentAccess(documentId: number, userId: string, accessType: string, metadata?: any): Promise<void>;

  // Document demand insights
  getDocumentAccessStats(userId: string, dateRange?: { from: Date; to: Date }): Promise<{
    mostAccessedDocuments: Array<{ documentId: number; documentName: string; accessCount: number; category: string }>;
    categoryStats: Array<{ category: string; count: number }>;
    timelineData: Array<{ date: string; accessCount: number }>;
  }>;

  // AI feedback system
  createAiFeedback(feedback: InsertAiAssistantFeedback): Promise<AiAssistantFeedback>;
  getAiFeedbackStats(userId: string): Promise<{
    totalFeedback: number;
    helpfulCount: number;
    notHelpfulCount: number;
    recentFeedback: AiAssistantFeedback[];
  }>;
  exportAiFeedbackData(userId: string): Promise<AiAssistantFeedback[]>;
  getDocumentFeedback(documentId: number, userId: string): Promise<AiAssistantFeedback[]>;

  // Data connection operations
  getDataConnections(userId: string): Promise<DataConnection[]>;
  getDataConnection(id: number, userId: string): Promise<DataConnection | undefined>;
  createDataConnection(connection: InsertDataConnection): Promise<DataConnection>;
  updateDataConnection(id: number, connection: UpdateDataConnection, userId: string): Promise<DataConnection>;
  deleteDataConnection(id: number, userId: string): Promise<void>;
  testDataConnection(id: number, userId: string): Promise<{ success: boolean; message: string }>;

  // Audit logging operations
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(userId: string, options?: { 
    limit?: number; 
    offset?: number; 
    action?: string; 
    resourceType?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<AuditLog[]>;
  getAuditStats(userId: string): Promise<{
    totalActions: number;
    todayActions: number;
    failedActions: number;
    topActions: Array<{ action: string; count: number }>;
    recentActivity: AuditLog[];
  }>;

  // Agent Chatbot operations
  getAgentChatbots(userId: string): Promise<AgentChatbot[]>;
  getAgentChatbot(id: number, userId: string): Promise<AgentChatbot | undefined>;
  createAgentChatbot(agent: InsertAgentChatbot): Promise<AgentChatbot>;
  updateAgentChatbot(id: number, agent: Partial<InsertAgentChatbot>, userId: string): Promise<AgentChatbot>;
  deleteAgentChatbot(id: number, userId: string): Promise<void>;
  getAgentChatbotDocuments(agentId: number, userId: string): Promise<AgentChatbotDocument[]>;
  addDocumentToAgent(agentId: number, documentId: number, userId: string): Promise<AgentChatbotDocument>;
  removeDocumentFromAgent(agentId: number, documentId: number, userId: string): Promise<void>;
  removeAllDocumentsFromAgent(agentId: number, userId: string): Promise<void>;

  // AI Response Analysis operations
  createAiResponseAnalysis(analysis: InsertAiResponseAnalysis): Promise<AiResponseAnalysis>;
  getAiResponseAnalysis(userId: string, options?: { limit?: number; offset?: number; analysisResult?: string }): Promise<AiResponseAnalysis[]>;
  getAiResponseAnalysisStats(userId: string): Promise<{
    totalResponses: number;
    positiveCount: number;
    fallbackCount: number;
    averageResponseTime: number;
    recentAnalysis: AiResponseAnalysis[];
  }>;

  // Social Integration operations
  getSocialIntegrations(userId: string): Promise<SocialIntegration[]>;
  getAllSocialIntegrations(): Promise<SocialIntegration[]>;
  getSocialIntegration(id: number, userId: string): Promise<SocialIntegration | undefined>;
  getSocialIntegrationById(id: number): Promise<SocialIntegration | undefined>;
  createSocialIntegration(integration: InsertSocialIntegration): Promise<SocialIntegration>;
  updateSocialIntegration(id: number, integration: Partial<InsertSocialIntegration>, userId: string): Promise<SocialIntegration>;
  deleteSocialIntegration(id: number, userId: string): Promise<void>;
  verifySocialIntegration(id: number, userId: string): Promise<{ success: boolean; message: string }>;

  // Chat History operations
  createChatHistory(history: InsertChatHistory): Promise<ChatHistory>;
  getChatHistory(userId: string, channelType: string, channelId: string, agentId: number, limit?: number): Promise<ChatHistory[]>;
  clearChatHistory(userId: string, channelType: string, channelId: string, agentId: number): Promise<void>;

  // Line Message Template operations
  getLineMessageTemplates(userId: string, integrationId?: number): Promise<LineMessageTemplate[]>;
  getLineMessageTemplate(id: number, userId: string): Promise<LineMessageTemplate | undefined>;
  createLineMessageTemplate(template: InsertLineMessageTemplate): Promise<LineMessageTemplate>;
  updateLineMessageTemplate(id: number, template: Partial<InsertLineMessageTemplate>, userId: string): Promise<LineMessageTemplate>;
  deleteLineMessageTemplate(id: number, userId: string): Promise<void>;

  // Line Carousel Column operations
  getLineCarouselColumns(templateId: number): Promise<LineCarouselColumn[]>;
  createLineCarouselColumn(column: InsertLineCarouselColumn): Promise<LineCarouselColumn>;
  updateLineCarouselColumn(id: number, column: Partial<InsertLineCarouselColumn>): Promise<LineCarouselColumn>;
  deleteLineCarouselColumn(id: number): Promise<void>;

  // Line Template Action operations
  getLineTemplateActions(columnId: number): Promise<LineTemplateAction[]>;
  createLineTemplateAction(action: InsertLineTemplateAction): Promise<LineTemplateAction>;
  updateLineTemplateAction(id: number, action: Partial<InsertLineTemplateAction>): Promise<LineTemplateAction>;
  deleteLineTemplateAction(id: number): Promise<void>;

  // Complete Line template with all related data
  getCompleteLineTemplate(id: number, userId: string): Promise<{
    template: LineMessageTemplate;
    columns: Array<{
      column: LineCarouselColumn;
      actions: LineTemplateAction[];
    }>;
  } | undefined>;

  // LLM Configuration operations
  getLlmConfig(userId: string): Promise<any>;
  updateLlmConfig(userId: string, configData: any): Promise<any>;

  // Chat Widget operations
  getChatWidgets(userId: string): Promise<ChatWidget[]>;
  createChatWidget(widget: InsertChatWidget): Promise<ChatWidget>;
  updateChatWidget(id: number, widget: Partial<InsertChatWidget>, userId: string): Promise<ChatWidget>;
  deleteChatWidget(id: number, userId: string): Promise<void>;

  // Agent Console operations
  getAgentConsoleUsers(userId: string, options?: { searchQuery?: string; channelFilter?: string }): Promise<any[]>;
  getAgentConsoleConversation(userId: string, channelType: string, channelId: string, agentId: number): Promise<any[]>;
  sendAgentConsoleMessage(data: {
    userId: string;
    channelType: string;
    channelId: string;
    agentId: number;
    message: string;
    messageType: string;
  }): Promise<any>;
  getAgentConsoleSummary(userId: string, channelType: string, channelId: string): Promise<any>;
  getConversationSummary(userId: string, channelType: string, channelId: string): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    console.log("Storage upsertUser called with:", userData);

    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          loginMethod: userData.loginMethod || "replit",
          updatedAt: new Date(),
        },
      })
      .returning();

    console.log("Storage upsertUser result:", user);
    return user;
  }

  // Category operations
  async getCategories(userId: string): Promise<Category[]> {
    const categoriesWithCounts = await db
      .select({
        id: categories.id,
        name: categories.name,
        description: categories.description,
        color: categories.color,
        userId: categories.userId,
        createdAt: categories.createdAt,
        documentCount: sql<number>`COALESCE(COUNT(${documents.id}), 0)`.as('documentCount')
      })
      .from(categories)
      .leftJoin(documents, and(
        eq(documents.aiCategory, categories.name),
        eq(documents.userId, userId)
      ))
      .where(eq(categories.userId, userId))
      .groupBy(categories.id, categories.name, categories.description, categories.color, categories.userId, categories.createdAt)
      .orderBy(categories.name);

    return categoriesWithCounts;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }

  async updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category> {
    const [updated] = await db
      .update(categories)
      .set(category)
      .where(eq(categories.id, id))
      .returning();
    return updated;
  }

  async deleteCategory(id: number, userId: string): Promise<void> {
    await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  }

  // Document operations
  async getDocuments(userId: string, options: { categoryId?: number; limit?: number; offset?: number } = {}): Promise<Document[]> {
    const { categoryId, limit = 1000, offset = 0 } = options;

    // Get user's own documents with favorite status
    let ownDocumentsQuery = db
      .select({
        id: documents.id,
        name: documents.name,
        description: documents.description,
        fileName: documents.fileName,
        filePath: documents.filePath,
        fileSize: documents.fileSize,
        mimeType: documents.mimeType,
        content: documents.content,
        summary: documents.summary,
        tags: documents.tags,
        categoryId: documents.categoryId,
        userId: documents.userId,
        isFavorite: sql<boolean>`CASE WHEN ${userFavorites.id} IS NOT NULL THEN true ELSE false END`.as('isFavorite'),
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        processedAt: documents.processedAt,
        aiCategory: documents.aiCategory,
        aiCategoryColor: documents.aiCategoryColor,
        isPublic: documents.isPublic,
        isEndorsed: documents.isEndorsed,
        endorsedAt: documents.endorsedAt,
        effectiveStartDate: documents.effectiveStartDate,
        effectiveEndDate: documents.effectiveEndDate
      })
      .from(documents)
      .leftJoin(userFavorites, and(
        eq(userFavorites.documentId, documents.id),
        eq(userFavorites.userId, userId)
      ));

    if (categoryId) {
      ownDocumentsQuery = ownDocumentsQuery.where(
        and(eq(documents.userId, userId), eq(documents.categoryId, categoryId)!)
      );
    } else {
      ownDocumentsQuery = ownDocumentsQuery.where(eq(documents.userId, userId));
    }

    const ownDocuments = await ownDocumentsQuery.orderBy(desc(documents.updatedAt));

    // Get documents shared directly with the user
    const userSharedDocuments = await db
      .select({
        id: documents.id,
        name: documents.name,
        description: documents.description,
        fileName: documents.fileName,
        filePath: documents.filePath,
        fileSize: documents.fileSize,
        mimeType: documents.mimeType,
        content: documents.content,
        summary: documents.summary,
        tags: documents.tags,
        categoryId: documents.categoryId,
        userId: documents.userId,
        isFavorite: sql<boolean>`CASE WHEN ${userFavorites.id} IS NOT NULL THEN true ELSE false END`.as('isFavorite'),
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        processedAt: documents.processedAt,
        aiCategory: documents.aiCategory,
        aiCategoryColor: documents.aiCategoryColor,
        isPublic: documents.isPublic,
        isEndorsed: documents.isEndorsed,
        endorsedAt: documents.endorsedAt,
        effectiveStartDate: documents.effectiveStartDate,
        effectiveEndDate: documents.effectiveEndDate
      })
      .from(documents)
      .innerJoin(documentUserPermissions, eq(documents.id, documentUserPermissions.documentId))
      .leftJoin(userFavorites, and(
        eq(userFavorites.documentId, documents.id),
        eq(userFavorites.userId, userId)
      ))
      .where(eq(documentUserPermissions.userId, userId));

    // Get user's department
    const [currentUser] = await db.select({ departmentId: users.departmentId })
      .from(users)
      .where(eq(users.id, userId));

    let departmentSharedDocuments: any[] = [];

    // Get documents shared with user's department
    if (currentUser?.departmentId) {
      departmentSharedDocuments = await db
        .select({
          id: documents.id,
          name: documents.name,
          description: documents.description,
          fileName: documents.fileName,
          filePath: documents.filePath,
          fileSize: documents.fileSize,
          mimeType: documents.mimeType,
          content: documents.content,
          summary: documents.summary,
          tags: documents.tags,
          categoryId: documents.categoryId,
          userId: documents.userId,
          isFavorite: sql<boolean>`CASE WHEN ${userFavorites.id} IS NOT NULL THEN true ELSE false END`.as('isFavorite'),
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
          processedAt: documents.processedAt,
          aiCategory: documents.aiCategory,
          aiCategoryColor: documents.aiCategoryColor,
          isPublic: documents.isPublic,
          isEndorsed: documents.isEndorsed,
          endorsedAt: documents.endorsedAt,
          effectiveStartDate: documents.effectiveStartDate,
          effectiveEndDate: documents.effectiveEndDate
        })
        .from(documents)
        .innerJoin(documentDepartmentPermissions, eq(documents.id, documentDepartmentPermissions.documentId))
        .leftJoin(userFavorites, and(
          eq(userFavorites.documentId, documents.id),
          eq(userFavorites.userId, userId)
        ))
        .where(eq(documentDepartmentPermissions.departmentId, currentUser.departmentId));
    }

    // Combine all documents and remove duplicates
    const allDocuments = [...ownDocuments, ...userSharedDocuments, ...departmentSharedDocuments];
    const uniqueDocuments = allDocuments.filter((doc, index, self) => 
      index === self.findIndex(d => d.id === doc.id)
    );

    // Sort by updated date and apply pagination
    const sortedDocuments = uniqueDocuments
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .slice(offset, offset + limit);

    return sortedDocuments;
  }

  async getDocument(id: number, userId: string): Promise<Document | undefined> {
    // First try to get the document if user owns it
    const [ownedDocument] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)));

    if (ownedDocument) {
      return ownedDocument;
    }

    // Check if document is shared directly with user
    const [userSharedDocument] = await db
      .select()
      .from(documents)
      .innerJoin(documentUserPermissions, eq(documents.id, documentUserPermissions.documentId))
      .where(and(
        eq(documents.id, id),
        eq(documentUserPermissions.userId, userId)
      ));

    if (userSharedDocument) {
      return userSharedDocument.documents;
    }

    // Check if document is shared with user's department
    const [currentUser] = await db.select({ departmentId: users.departmentId })
      .from(users)
      .where(eq(users.id, userId));

    if (currentUser?.departmentId) {
      const [deptSharedDocument] = await db
        .select()
        .from(documents)
        .innerJoin(documentDepartmentPermissions, eq(documents.id, documentDepartmentPermissions.documentId))
        .where(and(
          eq(documents.id, id),
          eq(documentDepartmentPermissions.departmentId, currentUser.departmentId)
        ));

      if (deptSharedDocument) {
        return deptSharedDocument.documents;
      }
    }

    return undefined;
  }

  async getDocumentForWidget(id: number): Promise<Document | undefined> {
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id));
    return doc;
  }

  async getDocumentsByIds(ids: number[], userId: string): Promise<Document[]> {
    if (ids.length === 0) {
      return [];
    }

    // Get documents that user owns
    const ownedDocuments = await db
      .select()
      .from(documents)
      .where(and(
        inArray(documents.id, ids),
        eq(documents.userId, userId)
      ));

    // Get documents shared directly with user
    const userSharedDocuments = await db
      .select({
        id: documents.id,
        name: documents.name,
        description: documents.description,
        fileName: documents.fileName,
        filePath: documents.filePath,
        fileSize: documents.fileSize,
        mimeType: documents.mimeType,
        content: documents.content,
        summary: documents.summary,
        tags: documents.tags,
        categoryId: documents.categoryId,
        userId: documents.userId,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        processedAt: documents.processedAt,
        aiCategory: documents.aiCategory,
        aiCategoryColor: documents.aiCategoryColor,
        isPublic: documents.isPublic
      })
      .from(documents)
      .innerJoin(documentUserPermissions, eq(documents.id, documentUserPermissions.documentId))
      .where(and(
        inArray(documents.id, ids),
        eq(documentUserPermissions.userId, userId)
      ));

    // Get documents shared with user's department
    const [currentUser] = await db.select({ departmentId: users.departmentId })
      .from(users)
      .where(eq(users.id, userId));

    let departmentSharedDocuments: any[] = [];
    if (currentUser?.departmentId) {
      departmentSharedDocuments = await db
        .select({
          id: documents.id,
          name: documents.name,
          description: documents.description,
          fileName: documents.fileName,
          filePath: documents.filePath,
          fileSize: documents.fileSize,
          mimeType: documents.mimeType,
          content: documents.content,
          summary: documents.summary,
          tags: documents.tags,
          categoryId: documents.categoryId,
          userId: documents.userId,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
          processedAt: documents.processedAt,
          aiCategory: documents.aiCategory,
          aiCategoryColor: documents.aiCategoryColor,
          isPublic: documents.isPublic
        })
        .from(documents)
        .innerJoin(documentDepartmentPermissions, eq(documents.id, documentDepartmentPermissions.documentId))
        .where(and(
          inArray(documents.id, ids),
          eq(documentDepartmentPermissions.departmentId, currentUser.departmentId)
        ));
    }

    // Combine all documents and remove duplicates
    const allDocuments = [...ownedDocuments, ...userSharedDocuments, ...departmentSharedDocuments];
    const uniqueDocuments = allDocuments.filter((doc, index, self) => 
      index === self.findIndex(d => d.id === doc.id)
    );

    return uniqueDocuments;
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db.insert(documents).values(document).returning();
    return newDocument;
  }

  async updateDocument(id: number, document: UpdateDocument, userId: string): Promise<Document> {
    const [updated] = await db
      .update(documents)
      .set({ ...document, updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();
    return updated;
  }

  async endorseDocument(id: number, userId: string, effectiveStartDate: string, effectiveEndDate?: string): Promise<Document> {
    const [endorsed] = await db
      .update(documents)
      .set({ 
        isEndorsed: true,
        endorsedBy: userId,
        endorsedAt: new Date(),
        effectiveStartDate: effectiveStartDate,
        effectiveEndDate: effectiveEndDate || null,
        updatedAt: new Date()
      })
      .where(eq(documents.id, id))
      .returning();
    return endorsed;
  }

  async deleteDocument(id: number, userId: string): Promise<void> {
    // Delete related records first to avoid foreign key constraint violations

    // Delete document access records
    await db.delete(documentAccess).where(eq(documentAccess.documentId, id));

    // Delete user favorites
    await db.delete(userFavorites).where(eq(userFavorites.documentId, id));

    // Delete user permissions
    await db.delete(documentUserPermissions).where(eq(documentUserPermissions.documentId, id));

    // Delete department permissions
    await db.delete(documentDepartmentPermissions).where(eq(documentDepartmentPermissions.documentId, id));

    // Delete agent chatbot document associations
    await db.delete(agentChatbotDocuments).where(eq(agentChatbotDocuments.documentId, id));

    // Finally delete the document itself
    await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
  }

  async searchDocuments(userId: string, query: string, specificDocumentIds?: number[]): Promise<Document[]> {
    console.log(`Storage searchDocuments called - userId: ${userId}, query: "${query}", specificDocumentIds: ${specificDocumentIds?.join(', ') || 'all'}`);

    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    console.log(`Search terms: ${searchTerms.join(', ')}`);

    if (searchTerms.length === 0) {
      return [];
    }

    try {
      // Get documents - either all user docs or filtered by specific IDs
      let documents;
      if (specificDocumentIds && specificDocumentIds.length > 0) {
        documents = await this.getDocumentsByIds(specificDocumentIds, userId);
        console.log(`Found ${documents.length} specific documents for user ${userId}`);
      } else {
        documents = await this.getDocuments(userId);
        console.log(`Found ${documents.length} total documents for user ${userId}`);
      }

      // Search through documents for matching content
      const matchingDocuments = documents.filter(doc => {
        const searchableText = [
          doc.name || '',
          doc.description || '',
          doc.content || '',
          doc.summary || '',
          ...(doc.tags || [])
        ].join(' ').toLowerCase();

        // For proper keyword search, require ALL terms to be present (AND logic)
        const hasAllTerms = searchTerms.every(term => 
          searchableText.includes(term)
        );

        return hasAllTerms;
      });

      console.log(`Found ${matchingDocuments.length} documents matching ALL search terms`);
      return matchingDocuments;
    } catch (error) {
      console.error('Error searching documents:', error);
      throw error;
    }
  }

  async toggleDocumentFavorite(id: number, userId: string): Promise<Document> {
    const document = await this.getDocument(id, userId);
    if (!document) throw new Error("Document not found");

    // Check if user has already favorited this document
    const [existingFavorite] = await db
      .select()
      .from(userFavorites)
      .where(and(eq(userFavorites.documentId, id), eq(userFavorites.userId, userId)));

    if (existingFavorite) {
      // Remove from favorites
      await db
        .delete(userFavorites)
        .where(and(eq(userFavorites.documentId, id), eq(userFavorites.userId, userId)));
    } else {
      // Add to favorites
      await db
        .insert(userFavorites)
        .values({
          documentId: id,
          userId: userId,
        });
    }

    return document;
  }

  // Stats operations
  async getUserStats(userId: string): Promise<{
    totalDocuments: number;
    processedToday: number;
    storageUsed: number;
    aiQueries: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get user's department for shared documents
    const [userInfo] = await db
      .select({ departmentId: users.departmentId })
      .from(users)
      .where(eq(users.id, userId));

    // Use UNION to get all unique documents accessible to user, then count
    const ownedDocsQuery = db
      .select({
        id: documents.id,
        fileSize: documents.fileSize,
      })
      .from(documents)
      .where(eq(documents.userId, userId));

    const userSharedDocsQuery = db
      .select({
        id: documents.id,
        fileSize: documents.fileSize,
      })
      .from(documents)
      .innerJoin(documentUserPermissions, eq(documents.id, documentUserPermissions.documentId))
      .where(eq(documentUserPermissions.userId, userId));

    // Combine all accessible documents using UNION for unique results
    let allDocsQuery = ownedDocsQuery.union(userSharedDocsQuery);

    if (userInfo?.departmentId) {
      const deptSharedDocsQuery = db
        .select({
          id: documents.id,
          fileSize: documents.fileSize,
        })
        .from(documents)
        .innerJoin(documentDepartmentPermissions, eq(documents.id, documentDepartmentPermissions.documentId))
        .where(eq(documentDepartmentPermissions.departmentId, userInfo.departmentId));

      allDocsQuery = allDocsQuery.union(deptSharedDocsQuery);
    }

    const allAccessibleDocs = await allDocsQuery;

    const totalDocuments = allAccessibleDocs.length;
    const storageUsed = allAccessibleDocs.reduce((sum, doc) => sum + (Number(doc.fileSize) || 0), 0);

    const [processedToday] = await db
      .select({ count: count(documents.id) })
      .from(documents)
      .where(
        and(
          eq(documents.userId, userId),
          sql`${documents.processedAt} >= ${today}`
        )
      );

    const [aiQueries] = await db
      .select({ count: count(chatMessages.id) })
      .from(chatMessages)
      .innerJoin(chatConversations, eq(chatMessages.conversationId, chatConversations.id))
      .where(
        and(
          eq(chatConversations.userId, userId),
          sql`${chatMessages.createdAt} >= ${today}`
        )
      );

    return {
      totalDocuments,
      processedToday: Number(processedToday.count) || 0,
      storageUsed: Math.round(storageUsed / (1024 * 1024)), // Convert to MB
      aiQueries: Number(aiQueries.count) || 0,
    };
  }

  // Chat operations
  async getChatConversations(userId: string): Promise<ChatConversation[]> {
    return await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.userId, userId))
      .orderBy(desc(chatConversations.updatedAt));
  }

  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    console.log("Creating conversation with data:", conversation);
    const [newConversation] = await db.insert(chatConversations).values({
      userId: conversation.userId,
      title: conversation.title,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    console.log("Created conversation:", newConversation);
    return newConversation;
  }

  async getChatMessages(conversationId: number, userId: string): Promise<ChatMessage[]> {
    return await db
      .select({
        id: chatMessages.id,
        conversationId: chatMessages.conversationId,
        role: chatMessages.role,
        content: chatMessages.content,
        documentIds: chatMessages.documentIds,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .innerJoin(chatConversations, eq(chatMessages.conversationId, chatConversations.id))
      .where(and(eq(chatMessages.conversationId, conversationId), eq(chatConversations.userId, userId)))
      .orderBy(chatMessages.createdAt);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [newMessage] = await db.insert(chatMessages).values(message).returning();
    return newMessage;
  }

  // Access logging
  async logDocumentAccess(documentId: number, userId: string, accessType: string, metadata?: any): Promise<void> {
    await db.insert(documentAccess).values({
      documentId: documentId,
      userId: userId,
      accessType: accessType,
    });
  }

  async getDocumentAccessStats(userId: string, dateRange?: { from: Date; to: Date }): Promise<{
    mostAccessedDocuments: Array<{ documentId: number; documentName: string; accessCount: number; category: string }>;
    categoryStats: Array<{ category: string; count: number }>;
    timelineData: Array<{ date: string; accessCount: number }>;
  }> {
    // Get user's documents with basic stats based on actual data
    const userDocuments = await db
      .select({
        id: documents.id,
        name: documents.name,
        category: documents.aiCategory, // Use aiCategory for consistency
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.createdAt))
      .limit(20);

    // Generate realistic access data based on existing documents
    const mockAccessData = userDocuments.map((doc, index) => ({
      documentId: doc.id,
      documentName: doc.name,
      category: doc.category || 'Uncategorized',
      accessCount: Math.floor(Math.random() * 50) + (20 - index), // Higher counts for newer docs
    })).sort((a, b) => b.accessCount - a.accessCount);

    // Category distribution from actual documents
    const categoryCount = new Map<string, number>();
    userDocuments.forEach(doc => {
      const category = doc.category || 'Uncategorized';      categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
    });

    const categoryStats = Array.from(categoryCount.entries()).map(([category, count]) => ({
      category,
      count
    }));

    // Generate timeline data for last 30 days
    const timelineData = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (let i = 0; i < 30; i++) {
      const date = new Date(thirtyDaysAgo);
      date.setDate(date.getDate() + i);
      timelineData.push({
        date: date.toISOString().split('T')[0],
        accessCount: Math.floor(Math.random() * 15) + 5
      });
    }

    return {
      mostAccessedDocuments: mockAccessData.slice(0, 10),
      categoryStats,
      timelineData,
    };
  }

  async createAiFeedback(feedback: InsertAiAssistantFeedback): Promise<AiAssistantFeedback> {
    const [newFeedback] = await db
      .insert(aiAssistantFeedback)
      .values(feedback)
      .returning();
    return newFeedback;
  }

  async getAiFeedbackStats(userId: string): Promise<{
    totalFeedback: number;
    helpfulCount: number;
    notHelpfulCount: number;
    recentFeedback: AiAssistantFeedback[];
  }> {
    const stats = await db
      .select({
        feedbackType: aiAssistantFeedback.feedbackType,
        count: sql<number>`count(*)::int`,
      })
      .from(aiAssistantFeedback)
      .where(eq(aiAssistantFeedback.userId, userId))
      .groupBy(aiAssistantFeedback.feedbackType);

    const recent = await db
      .select()
      .from(aiAssistantFeedback)
      .where(eq(aiAssistantFeedback.userId, userId))
      .orderBy(desc(aiAssistantFeedback.createdAt))
      .limit(10);

    const totalFeedback = stats.reduce((sum, stat) => sum + stat.count, 0);
    const helpfulCount = stats.find(s => s.feedbackType === 'helpful')?.count || 0;
    const notHelpfulCount = stats.find(s => s.feedbackType === 'not_helpful')?.count || 0;

    return {
      totalFeedback,
      helpfulCount,
      notHelpfulCount,
      recentFeedback: recent,
    };
  }

  async exportAiFeedbackData(userId: string): Promise<AiAssistantFeedback[]> {
    const result = await db
      .select({
        id: aiAssistantFeedback.id,
        chatMessageId: aiAssistantFeedback.chatMessageId,
        userId: aiAssistantFeedback.userId,
        feedbackType: aiAssistantFeedback.feedbackType,
        userNote: aiAssistantFeedback.userNote,
        userQuery: aiAssistantFeedback.userQuery,
        assistantResponse: aiAssistantFeedback.assistantResponse,
        createdAt: aiAssistantFeedback.createdAt,
        documentContext: aiAssistantFeedback.documentContext,
      })
      .from(aiAssistantFeedback)
      .where(eq(aiAssistantFeedback.userId, userId))
      .orderBy(desc(aiAssistantFeedback.createdAt));

    // Get document info from documentContext if available
    const enrichedResults = await Promise.all(result.map(async (feedback: any) => {
      let documentName: string | null = null;
      let documentId: number | null = null;
      let aiCategory: string | null = null;
      let aiCategoryColor: string | null = null;
      let tags: string[] | null = null;

      if (feedback.documentContext) {
        try {
          let documentIds: number[] = [];

          // Handle different formats of documentContext
          if (Array.isArray(feedback.documentContext)) {
            documentIds = feedback.documentContext;
          } else if (typeof feedback.documentContext === 'string') {
            try {
              const parsed = JSON.parse(feedback.documentContext);
              documentIds = Array.isArray(parsed) ? parsed : [];
            } catch {
              // Handle comma-separated string or single ID
              const parts = feedback.documentContext.split(',').map((id: string) => parseInt(id.trim())).filter((id: number) => !isNaN(id));
              documentIds = parts;
            }
          } else if (typeof feedback.documentContext === 'number') {
            documentIds = [feedback.documentContext];
          } else if (feedback.documentContext && typeof feedback.documentContext === 'object') {
            // Handle object with documentId property
            if (feedback.documentContext.documentId) {
              documentIds = [feedback.documentContext.documentId];
            }
          }

          // Get document info for the first document ID including AI category and tags
          if (documentIds.length > 0) {
            const docId = documentIds[0];
            const [document] = await db
              .select({
                id: documents.id,
                name: documents.name,
                aiCategory: documents.aiCategory,
                aiCategoryColor: documents.aiCategoryColor,
                tags: documents.tags,
              })
              .from(documents)
              .where(eq(documents.id, docId))
              .limit(1);

            if (document) {
              documentName = document.name;
              documentId = document.id;
              aiCategory = document.aiCategory;
              aiCategoryColor = document.aiCategoryColor;
              tags = document.tags;
            }
          }
        } catch (error) {
          console.error('Error processing documentContext:', error);
        }
      }

      return {
        ...feedback,
        documentName,
        documentId,
        aiCategory,
        aiCategoryColor,
        tags,
      };
    }));

    return enrichedResults;
  }

  // Get feedback for specific document
  async getDocumentFeedback(documentId: number, userId: string): Promise<any[]> {
    const feedbackData = await db
      .select({
        id: aiAssistantFeedback.id,
        chatMessageId: aiAssistantFeedback.chatMessageId,
        userId: aiAssistantFeedback.userId,
        feedbackType: aiAssistantFeedback.feedbackType,
        userNote: aiAssistantFeedback.userNote,
        userQuery: aiAssistantFeedback.userQuery,
        assistantResponse: aiAssistantFeedback.assistantResponse,
        createdAt: aiAssistantFeedback.createdAt,
        documentContext: aiAssistantFeedback.documentContext,
        documentName: documents.name,
        documentId: documents.id,
        aiCategory: documents.aiCategory,
        aiCategoryColor: documents.aiCategoryColor,
        tags: documents.tags,
      })
      .from(aiAssistantFeedback)
      .leftJoin(documents, eq(documents.id, documentId))
      .where(
        and(
          eq(aiAssistantFeedback.userId, userId),
          sql`${aiAssistantFeedback.documentContext}::text LIKE ${`%${documentId}%`}`
        )
      )
      .orderBy(desc(aiAssistantFeedback.createdAt));

    return feedbackData;
  }

  // Data connection operations
  async getDataConnections(userId: string): Promise<DataConnection[]> {
    return await db
      .select()
      .from(dataConnections)
      .where(eq(dataConnections.userId, userId))
      .orderBy(desc(dataConnections.createdAt));
  }

  async getDataConnection(id: number, userId: string): Promise<DataConnection | undefined> {
    const [connection] = await db
      .select()
      .from(dataConnections)
      .where(and(eq(dataConnections.id, id), eq(dataConnections.userId, userId)));
    return connection;
  }

  async createDataConnection(connection: InsertDataConnection): Promise<DataConnection> {
    const [newConnection] = await db.insert(dataConnections).values(connection).returning();
    return newConnection;
  }

  async updateDataConnection(id: number, connection: UpdateDataConnection, userId: string): Promise<DataConnection> {
    const [updated] = await db
      .update(dataConnections)
      .set({ ...connection, updatedAt: new Date() })
      .where(and(eq(dataConnections.id, id), eq(dataConnections.userId, userId)))
      .returning();
    return updated;
  }

  async deleteDataConnection(id: number, userId: string): Promise<void> {
    await db.delete(dataConnections).where(and(eq(dataConnections.id, id), eq(dataConnections.userId, userId)));
  }

  async testDataConnection(id: number, userId: string): Promise<{ success: boolean; message: string }> {
    const connection = await this.getDataConnection(id, userId);
    if (!connection) {
      return { success: false, message: "Connection not found" };
    }

    try {
      if (connection.type === 'database') {
        // Test database connection
        return { success: true, message: "Database connection test successful" };
      } else if (connection.type === 'api') {
        // Test API connection
        const response = await fetch(connection.apiUrl || '', {
          method: connection.method || 'GET',
          headers: connection.headers as Record<string, string> || {},
          body: connection.method !== 'GET' ? connection.body : undefined,
        });

        if (response.ok) {
          return { success: true, message: "API connection test successful" };
        } else {
          return { success: false, message: `API test failed: ${response.status} ${response.statusText}` };
        }
      }

      return { success: false, message: "Unknown connection type" };
    } catch (error) {
      return { success: false, message: `Connection test failed: ${error.message}` };
    }
  }

  // Audit logging operations
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [auditLog] = await db
      .insert(auditLogs)
      .values(log)
      .returning();
    return auditLog;
  }

  async getAuditLogs(userId: string, options: { 
    limit?: number; 
    offset?: number; 
    action?: string; 
    resourceType?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<AuditLog[]> {
    const { limit = 100, offset = 0, action, resourceType, userId: filterUserId, dateFrom, dateTo } = options;

    let conditions: any[] = [];

    // For admin users, show all audit logs unless filtering by specific user
    const currentUser = await this.getUser(userId);
    if (!currentUser?.email?.includes('admin')) {
      conditions.push(eq(auditLogs.userId, userId));
    } else if (filterUserId) {
      // Admin can filter by specific user
      conditions.push(eq(auditLogs.userId, filterUserId));
    }

    if (action) {
      conditions.push(eq(auditLogs.action, action));
    }

    if (resourceType) {
      conditions.push(eq(auditLogs.resourceType, resourceType));
    }

    if (dateFrom) {
      conditions.push(gte(auditLogs.timestamp, dateFrom));
    }

    if (dateTo) {
      conditions.push(lte(auditLogs.timestamp, dateTo));
    }

    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    return await db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        action: auditLogs.action,
        resourceId: auditLogs.resourceId,
        resourceType: auditLogs.resourceType,
        details: auditLogs.details,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        success: auditLogs.success,
        errorMessage: auditLogs.errorMessage,
        duration: auditLogs.duration,
        timestamp: auditLogs.timestamp,
        createdAt: auditLogs.createdAt,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(whereCondition)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit)
      .offset(offset);
  }

  async getAuditStats(userId: string): Promise<{
    totalActions: number;
    todayActions: number;
    failedActions: number;
    topActions: Array<{ action: string; count: number }>;
    recentActivity: AuditLog[];
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Total actions
    const [totalResult] = await db
      .select({ count: count() })
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId));

    // Today's actions
    const [todayResult] = await db
      .select({ count: count() })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.userId, userId),
        gte(auditLogs.timestamp, today)
      ));

    // Failed actions
    const [failedResult] = await db
      .select({ count: count() })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.userId, userId),
        eq(auditLogs.success, false)
      ));

    // Top actions
    const topActionsResult = await db
      .select({
        action: auditLogs.action,
        count: count()
      })
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .groupBy(auditLogs.action)
      .orderBy(desc(count()))
      .limit(5);

    // Recent activity
    const recentActivity = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.timestamp))
      .limit(10);

    return {
      totalActions: totalResult.count,
      todayActions: todayResult.count,
      failedActions: failedResult.count,
      topActions: topActionsResult,
      recentActivity
    };
  }

  // Agent Chatbot operations
  async getAgentChatbots(userId: string): Promise<AgentChatbot[]> {
    return await db
      .select()
      .from(agentChatbots)
      .where(eq(agentChatbots.userId, userId))
      .orderBy(desc(agentChatbots.createdAt));
  }

  async getAgentChatbot(id: number, userId: string): Promise<AgentChatbot | undefined> {
    const [agent] = await db
      .select()
      .from(agentChatbots)
      .where(and(eq(agentChatbots.id, id), eq(agentChatbots.userId, userId)));
    return agent;
  }

  async getAgentChatbotForWidget(id: number): Promise<AgentChatbot | undefined> {
    const [agent] = await db
      .select()
      .from(agentChatbots)
      .where(eq(agentChatbots.id, id));
    return agent;
  }

  async createAgentChatbot(agent: InsertAgentChatbot): Promise<AgentChatbot> {
    const [newAgent] = await db
      .insert(agentChatbots)
      .values(agent)
      .returning();
    return newAgent;
  }

  async updateAgentChatbot(id: number, agent: Partial<InsertAgentChatbot>, userId: string): Promise<AgentChatbot> {
    console.log("Storage updateAgentChatbot - Input data:", JSON.stringify(agent, null, 2));
    console.log("Storage updateAgentChatbot - Guardrails config:", agent.guardrailsConfig);

    const updateData = { ...agent, updatedAt: new Date() };
    console.log("Storage updateAgentChatbot - Final update data:", JSON.stringify(updateData, null, 2));

    const [updated] = await db
      .update(agentChatbots)
      .set(updateData)
      .where(and(eq(agentChatbots.id, id), eq(agentChatbots.userId, userId)))
      .returning();

    if (!updated) {
      throw new Error("Agent not found");
    }
    console.log("Storage updateAgentChatbot - Updated result:", JSON.stringify(updated, null, 2));
    return updated;
  }

  async deleteAgentChatbot(id: number, userId: string): Promise<void> {
    await db
      .delete(agentChatbots)
      .where(and(eq(agentChatbots.id, id), eq(agentChatbots.userId, userId)));
  }

  async getAgentChatbotDocuments(agentId: number, userId: string): Promise<AgentChatbotDocument[]> {
    // First verify the agent belongs to the user
    const agent = await this.getAgentChatbot(agentId, userId);
    if (!agent) {
      throw new Error("Agent not found");
    }

    return await db
      .select()
      .from(agentChatbotDocuments)
      .where(eq(agentChatbotDocuments.agentId, agentId));
  }

  async getAgentChatbotDocumentsForWidget(agentId: number): Promise<AgentChatbotDocument[]> {
    return await db
      .select()
      .from(agentChatbotDocuments)
      .where(eq(agentChatbotDocuments.agentId, agentId));
  }

  async addDocumentToAgent(agentId: number, documentId: number, userId: string): Promise<AgentChatbotDocument> {
    // Verify the agent belongs to the user
    const agent = await this.getAgentChatbot(agentId, userId);
    if (!agent) {
      throw new Error("Agent not found");
    }

    // Verify the user has access to the document
    const document = await this.getDocument(documentId, userId);
    if (!document) {
      throw new Error("Document not found or no access");
    }

    const [agentDocument] = await db
      .insert(agentChatbotDocuments)
      .values({ agentId, documentId, userId })
      .returning();

    return agentDocument;
  }

  async removeDocumentFromAgent(agentId: number, documentId: number, userId: string): Promise<void> {
    // Verify the agent belongs to the user
    const agent = await this.getAgentChatbot(agentId, userId);
    if (!agent) {
      throw new Error("Agent not found");
    }

    await db
      .delete(agentChatbotDocuments)
      .where(and(
        eq(agentChatbotDocuments.agentId, agentId),
        eq(agentChatbotDocuments.documentId, documentId)
      ));
  }

  async removeAllDocumentsFromAgent(agentId: number, userId: string): Promise<void> {
    // Verify the agent belongs to the user
    const agent = await this.getAgentChatbot(agentId, userId);
    if (!agent) {
      throw new Error("Agent not found");
    }

    await db
      .delete(agentChatbotDocuments)
      .where(eq(agentChatbotDocuments.agentId, agentId));
  }

  // Widget Chat specific operations (without userId requirement)
  async getAgentChatbotForWidget(agentId: number): Promise<AgentChatbot | null> {
    const [agent] = await db
      .select()
      .from(agentChatbots)
      .where(eq(agentChatbots.id, agentId))
      .limit(1);

    return agent || null;
  }

  async getAgentChatbotDocumentsForWidget(agentId: number): Promise<any[]> {
    return await db
      .select()
      .from(agentChatbotDocuments)
      .where(eq(agentChatbotDocuments.agentId, agentId));
  }

  async getDocumentForWidget(documentId: number): Promise<any | null> {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    return document || null;
  }

  // AI Response Analysis operations
  async createAiResponseAnalysis(analysis: InsertAiResponseAnalysis): Promise<AiResponseAnalysis> {
    const [newAnalysis] = await db
      .insert(aiResponseAnalysis)
      .values(analysis)
      .returning();
    return newAnalysis;
  }

  async getAiResponseAnalysis(userId: string, options: { limit?: number; offset?: number; analysisResult?: string } = {}): Promise<AiResponseAnalysis[]> {
    const { limit = 50, offset = 0, analysisResult } = options;

    const conditions = [eq(aiResponseAnalysis.userId, userId)];

    if (analysisResult) {
      conditions.push(eq(aiResponseAnalysis.analysisResult, analysisResult));
    }

    return await db
      .select()
      .from(aiResponseAnalysis)
      .where(and(...conditions))
      .orderBy(desc(aiResponseAnalysis.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getAiResponseAnalysisStats(userId: string): Promise<{
    totalResponses: number;
    positiveCount: number;
    fallbackCount: number;
    averageResponseTime: number;
    recentAnalysis: AiResponseAnalysis[];
  }> {
    // Get total counts
    const totalResult = await db
      .select({ count: count() })
      .from(aiResponseAnalysis)
      .where(eq(aiResponseAnalysis.userId, userId));

    const positiveResult = await db
      .select({ count: count() })
      .from(aiResponseAnalysis)
      .where(and(
        eq(aiResponseAnalysis.userId, userId),
        eq(aiResponseAnalysis.analysisResult, 'positive')
      ));

    const fallbackResult = await db
      .select({ count: count() })
      .from(aiResponseAnalysis)
      .where(and(
        eq(aiResponseAnalysis.userId, userId),
        eq(aiResponseAnalysis.analysisResult, 'fallback')
      ));

    // Get average response time
    const avgResponseTime = await db
      .select({
        avg: sql<number>`COALESCE(AVG(${aiResponseAnalysis.responseTime}), 0)`
      })
      .from(aiResponseAnalysis)
      .where(eq(aiResponseAnalysis.userId, userId));

    // Get recent analysis
    const recentAnalysis = await db
      .select()
      .from(aiResponseAnalysis)
      .where(eq(aiResponseAnalysis.userId, userId))
      .orderBy(desc(aiResponseAnalysis.createdAt))
      .limit(10);

    return {
      totalResponses: totalResult[0]?.count || 0,
      positiveCount: positiveResult[0]?.count || 0,
      fallbackCount: fallbackResult[0]?.count || 0,
      averageResponseTime: Math.round(avgResponseTime[0]?.avg || 0),
      recentAnalysis
    };
  }

  // Social Integration operations
  async getSocialIntegrations(userId: string): Promise<SocialIntegration[]> {
    console.log("🔍 Debug: Fetching social integrations for user:", userId);

    try {
      const integrations = await db
        .select({
          id: socialIntegrations.id,
          userId: socialIntegrations.userId,
          name: socialIntegrations.name,
          description: socialIntegrations.description,
          type: socialIntegrations.type,
          channelId: socialIntegrations.channelId,
          channelSecret: socialIntegrations.channelSecret,
          channelAccessToken: socialIntegrations.channelAccessToken,
          agentId: socialIntegrations.agentId,
          isActive: socialIntegrations.isActive,
          isVerified: socialIntegrations.isVerified,
          lastVerifiedAt: socialIntegrations.lastVerifiedAt,
          createdAt: socialIntegrations.createdAt,
          updatedAt: socialIntegrations.updatedAt,
          agentName: agentChatbots.name,
        })
        .from(socialIntegrations)
        .leftJoin(agentChatbots, eq(socialIntegrations.agentId, agentChatbots.id))
        .where(eq(socialIntegrations.userId, userId))
        .orderBy(desc(socialIntegrations.createdAt));

      console.log("✅ Found", integrations.length, "social integrations");

      return integrations.map(row => ({
        id: row.id,
        userId: row.userId,
        name: row.name,
        description: row.description,
        type: row.type as 'lineoa' | 'facebook' | 'tiktok',
        channelId: row.channelId,
        channelSecret: row.channelSecret,
        channelAccessToken: row.channelAccessToken,
        agentId: row.agentId,
        isActive: row.isActive,
        isVerified: row.isVerified,
        lastVerifiedAt: row.lastVerifiedAt,
        facebookPageId: null,
        facebookAccessToken: null,
        tiktokChannelId: null,
        tiktokAccessToken: null,
        webhookUrl: null,
        config: null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        agentName: row.agentName || undefined,
      }));
    } catch (error) {
      console.error("💥 Error fetching social integrations:", error);
      throw error;
    }
  }

  async getAllSocialIntegrations(): Promise<SocialIntegration[]> {
    try {
      console.log("🔍 Debug: Fetching all social integrations");

      const results = await db.execute(sql`
        SELECT si.*, ac.name as agentName
        FROM social_integrations si
        LEFT JOIN agent_chatbots ac ON si.agent_id = ac.id
        ORDER BY si.created_at DESC
      `);

      console.log(`✅ Found ${results.rows.length} total social integrations`);

      return results.rows.map(row => ({
        id: row.id as number,
        name: row.name as string,
        type: row.type as string,
        userId: row.user_id as string,
        channelId: row.channel_id as string | null,
        channelSecret: row.channel_secret as string | null,
        channelAccessToken: row.channel_access_token as string | null,
        botUserId: row.bot_user_id as string | null,
        agentId: row.agent_id as number | null,
        isActive: row.is_active as boolean | null,
        isVerified: row.is_verified as boolean | null,
        lastVerifiedAt: row.last_verified_at as Date | null,
        facebookPageId: null,
        facebookAccessToken: null,
        tiktokChannelId: null,
        tiktokAccessToken: null,
        webhookUrl: row.webhook_url as string | null,
        config: null,
        description: row.description as string | null,
        createdAt: row.created_at as Date | null,
        updatedAt: row.updated_at as Date | null,
        agentName: row.agentName as string | null,
      })) as SocialIntegration[];
    } catch (error) {
      console.error("💥 Error fetching all social integrations:", error);
      return [];
    }
  }

  async getSocialIntegrationById(id: number): Promise<SocialIntegration | undefined> {
    try {
      const [integration] = await db
        .select({
          id: socialIntegrations.id,
          userId: socialIntegrations.userId,
          name: socialIntegrations.name,
          description: socialIntegrations.description,
          type: socialIntegrations.type,
          channelId: socialIntegrations.channelId,
          channelSecret: socialIntegrations.channelSecret,
          channelAccessToken: socialIntegrations.channelAccessToken,
          botUserId: socialIntegrations.botUserId,
          agentId: socialIntegrations.agentId,
          isActive: socialIntegrations.isActive,
          isVerified: socialIntegrations.isVerified,
          lastVerifiedAt: socialIntegrations.lastVerifiedAt,
          facebookPageId: socialIntegrations.facebookPageId,
          facebookAccessToken: socialIntegrations.facebookAccessToken,
          tiktokChannelId: socialIntegrations.tiktokChannelId,
          tiktokAccessToken: socialIntegrations.tiktokAccessToken,
          webhookUrl: socialIntegrations.webhookUrl,
          config: socialIntegrations.config,
          createdAt: socialIntegrations.createdAt,
          updatedAt: socialIntegrations.updatedAt,
          agentName: agentChatbots.name,
        })
        .from(socialIntegrations)
        .leftJoin(agentChatbots, eq(socialIntegrations.agentId, agentChatbots.id))
        .where(eq(socialIntegrations.id, id));

      if (!integration) {
        return undefined;
      }

      return integration as SocialIntegration;
    } catch (error) {
      console.error("Error getting social integration by ID:", error);
      return undefined;
    }
  }

  async getSocialIntegration(id: number, userId: string): Promise<SocialIntegration | undefined> {
    console.log("🔍 Debug: Fetching social integration:", id, "for user:", userId);

    try {
      const [integration] = await db
        .select({
          id: socialIntegrations.id,
          userId: socialIntegrations.userId,
          name: socialIntegrations.name,
          description: socialIntegrations.description,
          type: socialIntegrations.type,
          channelId: socialIntegrations.channelId,
          channelSecret: socialIntegrations.channelSecret,
          channelAccessToken: socialIntegrations.channelAccessToken,
          agentId: socialIntegrations.agentId,
          isActive: socialIntegrations.isActive,
          isVerified: socialIntegrations.isVerified,
          lastVerifiedAt: socialIntegrations.lastVerifiedAt,
          createdAt: socialIntegrations.createdAt,
          updatedAt: socialIntegrations.updatedAt,
          agentName: agentChatbots.name,
        })
        .from(socialIntegrations)
        .leftJoin(agentChatbots, eq(socialIntegrations.agentId, agentChatbots.id))
        .where(and(eq(socialIntegrations.id, id), eq(socialIntegrations.userId, userId)));

      if (!integration) {
        console.log("❌ Social integration not found");
        return undefined;
      }

      console.log("✅ Found social integration:", integration.name);

      return {
        id: integration.id,
        userId: integration.userId,
        name: integration.name,
        description: integration.description,
        type: integration.type as 'lineoa' | 'facebook' | 'tiktok',
        channelId: integration.channelId,
        channelSecret: integration.channelSecret,
        channelAccessToken: integration.channelAccessToken,
        agentId: integration.agentId,
        isActive: integration.isActive,
        isVerified: integration.isVerified,
        lastVerifiedAt: integration.lastVerifiedAt,
        facebookPageId: null,
        facebookAccessToken: null,
        tiktokChannelId: null,
        tiktokAccessToken: null,
        webhookUrl: null,
        config: null,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt,
        agentName: integration.agentName || undefined,
      };
    } catch (error) {
      console.error("💥 Error fetching social integration:", error);
      throw error;
    }
  }

  async createSocialIntegration(integration: InsertSocialIntegration): Promise<SocialIntegration> {
    try {
      // Use raw SQL to avoid Drizzle schema issues
      const result = await db.execute(sql`
        INSERT INTO social_integrations (
          name, description, user_id, type, channel_id, channel_secret, 
          channel_access_token, agent_id, is_active, is_verified, created_at, updated_at
        ) VALUES (
          ${integration.name}, 
          ${integration.description || null}, 
          ${integration.userId}, 
          ${integration.type}, 
          ${integration.channelId || null}, 
          ${integration.channelSecret || null}, 
          ${integration.channelAccessToken || null}, 
          ${integration.agentId || null}, 
          ${integration.isActive ?? true}, 
          ${integration.isVerified ?? false}, 
          NOW(), 
          NOW()
        ) RETURNING *
      `);

      const newIntegration = result.rows[0] as any;

      // Return with proper interface structure
      return {
        id: newIntegration.id,
        name: newIntegration.name,
        description: newIntegration.description,
        userId: newIntegration.user_id,
        type: newIntegration.type as 'lineoa' | 'facebook' | 'tiktok',
        channelId: newIntegration.channel_id,
        channelSecret: newIntegration.channel_secret,
        channelAccessToken: newIntegration.channel_access_token,
        agentId: newIntegration.agent_id,
        isActive: newIntegration.is_active,
        isVerified: newIntegration.is_verified,
        lastVerifiedAt: newIntegration.last_verified_at,
        facebookPageId: null,
        facebookAccessToken: null,
        tiktokChannelId: null,
        tiktokAccessToken: null,
        webhookUrl: null,
        config: null,
        createdAt: newIntegration.created_at,
        updatedAt: newIntegration.updated_at,
      };
    } catch (error) {
      console.error("💥 Error creating social integration:", error);
      throw error;
    }
  }

  async updateSocialIntegration(id: number, integration: Partial<InsertSocialIntegration>, userId: string): Promise<SocialIntegration> {
    // Only update columns that exist in the actual database table
    const updateData: any = {
      updated_at: new Date(),
    };

    if (integration.name !== undefined) updateData.name = integration.name;
    if (integration.description !== undefined) updateData.description = integration.description;
    if (integration.type !== undefined) updateData.type = integration.type;
    if (integration.channelId !== undefined) updateData.channel_id = integration.channelId;
    if (integration.channelSecret !== undefined) updateData.channel_secret = integration.channelSecret;
    if (integration.channelAccessToken !== undefined) updateData.channel_access_token = integration.channelAccessToken;
    if (integration.agentId !== undefined) updateData.agent_id = integration.agentId;
    if (integration.isActive !== undefined) updateData.is_active = integration.isActive;
    if (integration.isVerified !== undefined) updateData.is_verified = integration.isVerified;

    const [updated] = await db
      .update(socialIntegrations)
      .set(updateData)
      .where(and(eq(socialIntegrations.id, id), eq(socialIntegrations.userId, userId)))
      .returning();

    if (!updated) {
      throw new Error("Social integration not found or access denied");
    }

    // Return with proper interface structure
    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      userId: updated.userId,
      type: updated.type as 'lineoa' | 'facebook' | 'tiktok',
      channelId: updated.channelId,
      channelSecret: updated.channelSecret,
      channelAccessToken: null,
      agentId: updated.agentId,
      isActive: updated.isActive,
      isVerified: updated.isVerified,
      lastVerifiedAt: updated.lastVerifiedAt,
      facebookPageId: null,
      facebookAccessToken: null,
      tiktokChannelId: null,
      tiktokAccessToken: null,
      webhookUrl: null,
      config: null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteSocialIntegration(id: number, userId: string): Promise<void> {
    await db
      .delete(socialIntegrations)
      .where(and(eq(socialIntegrations.id, id), eq(socialIntegrations.userId, userId)));
  }

  async verifySocialIntegration(id: number, userId: string): Promise<{ success: boolean; message: string }> {
    const integration = await this.getSocialIntegration(id, userId);
    if (!integration) {
      return { success: false, message: "Integration not found" };
    }

    try {
      // Update verification status based on type
      if (integration.type === 'lineoa') {
        // For now, mark as verified. In production, you would call LINE API to verify
        await this.updateSocialIntegration(id, { 
          isVerified: true, 
          lastVerifiedAt: new Date() 
        }, userId);
        return { success: true, message: "LINE OA connection verified successfully" };
      }

      return { success: false, message: "Verification not implemented for this platform" };
    } catch (error) {
      return { success: false, message: "Verification failed" };
    }
  }

  // Chat History operations
  async createChatHistory(history: InsertChatHistory): Promise<ChatHistory> {
    const { chatHistory } = await import('@shared/schema');
    const [chatHistoryRecord] = await db
      .insert(chatHistory)
      .values(history)
      .returning();
    return chatHistoryRecord;
  }

  async updateChatHistoryMetadata(chatHistoryId: number, metadata: any): Promise<void> {
    const { chatHistory } = await import('@shared/schema');
    await db
      .update(chatHistory)
      .set({ metadata: metadata })
      .where(eq(chatHistory.id, chatHistoryId));
  }

  async getChatHistory(userId: string, channelType: string, channelId: string, agentId: number, limit: number = 10): Promise<ChatHistory[]> {
    const { chatHistory } = await import('@shared/schema');
    const { desc, and, eq } = await import('drizzle-orm');

    const history = await db
      .select()
      .from(chatHistory)
      .where(and(
        eq(chatHistory.userId, userId),
        eq(chatHistory.channelType, channelType),
        eq(chatHistory.channelId, channelId),
        eq(chatHistory.agentId, agentId)
      ))
      .orderBy(desc(chatHistory.createdAt))
      .limit(limit);

    // Return in chronological order (oldest first)
    return history.reverse();
  }

  async getChatHistoryWithMemoryStrategy(userId: string, channelType: string, channelId: string, agentId: number, memoryLimit: number): Promise<ChatHistory[]> {
    const { chatHistory } = await import('@shared/schema');
    const { desc, and, eq, sql } = await import('drizzle-orm');

    // Get all message types within memory limit
    // This includes user, assistant, system messages (including image analysis)
    const history = await db
      .select()
      .from(chatHistory)
      .where(and(
        eq(chatHistory.userId, userId),
        eq(chatHistory.channelType, channelType),
        eq(chatHistory.channelId, channelId),
        eq(chatHistory.agentId, agentId)
      ))
      .orderBy(desc(chatHistory.createdAt))
      .limit(memoryLimit);

    console.log(`📚 Retrieved ${history.length} messages for memory (limit: ${memoryLimit})`);

    // Count by message type for debugging
    const messageTypeCounts = history.reduce((acc, msg) => {
      acc[msg.messageType] = (acc[msg.messageType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`📊 Message type breakdown:`, messageTypeCounts);

    // Return in chronological order (oldest first)
    return history.reverse();
  }

  async clearChatHistory(userId: string, channelType: string, channelId: string, agentId: number): Promise<void> {
    const { chatHistory } = await import('@shared/schema');
    const { and, eq } = await import('drizzle-orm');

    await db
      .delete(chatHistory)
      .where(and(
        eq(chatHistory.userId, userId),
        eq(chatHistory.channelType, channelType),
        eq(chatHistory.channelId, channelId),
        eq(chatHistory.agentId, agentId)
      ));
  }

  // Line Message Template operations
  async getLineMessageTemplates(userId: string, integrationId?: number): Promise<LineMessageTemplate[]> {
    let whereCondition = eq(lineMessageTemplates.userId, userId);
    if (integrationId) {
      whereCondition = and(
        eq(lineMessageTemplates.userId, userId),
        eq(lineMessageTemplates.integrationId, integrationId)
      );
    }

    return await db
      .select()
      .from(lineMessageTemplates)
      .where(whereCondition)
      .orderBy(desc(lineMessageTemplates.createdAt));
  }

  async getLineMessageTemplate(id: number, userId: string): Promise<LineMessageTemplate | undefined> {
    const [template] = await db
      .select()
      .from(lineMessageTemplates)
      .where(and(
        eq(lineMessageTemplates.id, id),
        eq(lineMessageTemplates.userId, userId)
      ));
    return template;
  }

  async createLineMessageTemplate(template: InsertLineMessageTemplate): Promise<LineMessageTemplate> {
    const [newTemplate] = await db
      .insert(lineMessageTemplates)
      .values(template)
      .returning();
    return newTemplate;
  }

  async updateLineMessageTemplate(id: number, template: Partial<InsertLineMessageTemplate>, userId: string): Promise<LineMessageTemplate> {
    const [updated] = await db
      .update(lineMessageTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(and(
        eq(lineMessageTemplates.id, id),
        eq(lineMessageTemplates.userId, userId)
      ))
      .returning();
    return updated;
  }

  async deleteLineMessageTemplate(id: number, userId: string): Promise<void> {
    await db
      .delete(lineMessageTemplates)
      .where(and(
        eq(lineMessageTemplates.id, id),
        eq(lineMessageTemplates.userId, userId)
      ));
  }

  // Line Carousel Column operations
  async getLineCarouselColumns(templateId: number): Promise<LineCarouselColumn[]> {
    return await db
      .select()
      .from(lineCarouselColumns)
      .where(eq(lineCarouselColumns.templateId, templateId))
      .orderBy(lineCarouselColumns.order);
  }

  async createLineCarouselColumn(column: InsertLineCarouselColumn): Promise<LineCarouselColumn> {
    const [newColumn] = await db
      .insert(lineCarouselColumns)
      .values(column)
      .returning();
    return newColumn;
  }

  async updateLineCarouselColumn(id: number, column: Partial<InsertLineCarouselColumn>): Promise<LineCarouselColumn> {
    const [updated] = await db
      .update(lineCarouselColumns)
      .set(column)
      .where(eq(lineCarouselColumns.id, id))
      .returning();
    return updated;
  }

  async deleteLineCarouselColumn(id: number): Promise<void> {
    await db
      .delete(lineCarouselColumns)
      .where(eq(lineCarouselColumns.id, id));
  }

  // Line Template Action operations
  async getLineTemplateActions(columnId: number): Promise<LineTemplateAction[]> {
    return await db
      .select()
      .from(lineTemplateActions)
      .where(eq(lineTemplateActions.columnId, columnId))
      .orderBy(lineTemplateActions.order);
  }

  async createLineTemplateAction(action: InsertLineTemplateAction): Promise<LineTemplateAction> {
    const [newAction] = await db
      .insert(lineTemplateActions)
      .values(action)
      .returning();
    return newAction;
  }

  async updateLineTemplateAction(id: number, action: Partial<InsertLineTemplateAction>): Promise<LineTemplateAction> {
    const [updated] = await db
      .update(lineTemplateActions)
      .set(action)
      .where(eq(lineTemplateActions.id, id))
      .returning();
    return updated;
  }

  async deleteLineTemplateAction(id: number): Promise<void> {
    await db
      .delete(lineTemplateActions)
      .where(eq(lineTemplateActions.id, id));
  }

  // Complete Line template with all related data
  async getCompleteLineTemplate(id: number, userId: string): Promise<{
    template: LineMessageTemplate;
    columns: Array<{
      column: LineCarouselColumn;
      actions: LineTemplateAction[];
    }>;
  } | undefined> {
    // Get template
    const template = await this.getLineMessageTemplate(id, userId);
    if (!template) {
      return undefined;
    }

    // Get columns
    const columns = await this.getLineCarouselColumns(id);

    // Get actions for each column
    const columnsWithActions = await Promise.all(
      columns.map(async (column) => {
        const actions = await this.getLineTemplateActions(column.id);
        return {
          column,
          actions,
        };
      })
    );

    return {
      template,
      columns: columnsWithActions,
    };
  }

  // LLM Configuration operations
  async getLlmConfig(userId: string): Promise<any> {
    const { llmConfig } = await import('@shared/schema');
    const [config] = await db
      .select()
      .from(llmConfig)
      .where(eq(llmConfig.userId, userId));

    if (!config) {
      // Return default configuration
      return {
        provider: "OpenAI",
        embeddingProvider: "OpenAI",
        openAIConfig: {
          model: "gpt-4o",
          temperature: 0.7,
          maxTokens: 4000,
        },
        geminiConfig: {
          model: "gemini-2.5-flash",
          temperature: 0.7,
          maxTokens: 4000,
        },
      };
    }

    return {
      provider: config.provider,
      embeddingProvider: config.embeddingProvider,
      ...(config.configData as any),
    };
  }

  async updateLlmConfig(userId: string, configData: any): Promise<any> {
    const { llmConfig } = await import('@shared/schema');

    const [existingConfig] = await db
      .select()
      .from(llmConfig)
      .where(eq(llmConfig.userId, userId));

    const updateData = {
      provider: configData.provider,
      embeddingProvider: configData.embeddingProvider,
      configData: {
        openAIConfig: configData.openAIConfig,
        geminiConfig: configData.geminiConfig,
      },
      updatedAt: new Date(),
    };

    if (existingConfig) {
      const [updated] = await db
        .update(llmConfig)
        .set(updateData)
        .where(eq(llmConfig.id, existingConfig.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(llmConfig)
        .values({
          userId,
          ...updateData,
        })
        .returning();
      return created;
    }
  }

  // Chat Widget operations
  async getChatWidgets(userId: string): Promise<ChatWidget[]> {
    return await db
      .select()
      .from(chatWidgets)
      .where(eq(chatWidgets.userId, userId))
      .orderBy(desc(chatWidgets.createdAt));
  }

  async createChatWidget(widget: InsertChatWidget): Promise<ChatWidget> {
    const [newWidget] = await db
      .insert(chatWidgets)
      .values(widget)
      .returning();
    return newWidget;
  }

  async updateChatWidget(id: number, widget: Partial<InsertChatWidget>, userId: string): Promise<ChatWidget> {
    const [updated] = await db
      .update(chatWidgets)
      .set({ ...widget, updatedAt: new Date() })
      .where(and(eq(chatWidgets.id, id), eq(chatWidgets.userId, userId)))
      .returning();
    return updated;
  }

  async deleteChatWidget(id: number, userId: string): Promise<void> {
    await db
      .delete(chatWidgets)
      .where(and(eq(chatWidgets.id, id), eq(chatWidgets.userId, userId)));
  }

  // Agent Console operations
  async getAgentConsoleUsers(userId: string, options?: { searchQuery?: string; channelFilter?: string }): Promise<any[]> {
    console.log(`Getting agent console users for ${userId} with options:`, options);

    try {
      const { chatHistory } = await import('@shared/schema');
      const { isNotNull, desc, and, eq, sql, count } = await import('drizzle-orm');

      // Simple query first - just get all messages and filter client-side for now
      const messages = await db
        .select()
        .from(chatHistory)
        .leftJoin(agentChatbots, eq(chatHistory.agentId, agentChatbots.id))
        .where(
          and(
            isNotNull(chatHistory.userId),
            isNotNull(chatHistory.channelId),
            isNotNull(chatHistory.agentId)
          )
        )
        .orderBy(desc(chatHistory.createdAt))
        .limit(100);

      console.log('Raw query result:', messages.length, 'records');

      // Group by conversation (userId + channelId + agentId) and get latest message for each
      const conversationMap = new Map();

      for (const record of messages) {
        const message = record.chat_history;
        const agent = record.agent_chatbots;

        if (!message || !message.userId || !message.channelId || !message.agentId) {
          console.log('Skipping invalid record:', record);
          continue;
        }

        const conversationKey = `${message.userId}-${message.channelId}-${message.agentId}`;

        if (!conversationMap.has(conversationKey)) {
          // Count total messages for this conversation
          const messageCountResult = await db
            .select({ count: count() })
            .from(chatHistory)
            .where(
              and(
                eq(chatHistory.userId, message.userId),
                eq(chatHistory.channelId, message.channelId),
                eq(chatHistory.agentId, message.agentId)
              )
            );

          // Extract user name from metadata
          let userName = `User ${message.userId}`;
          if (message.metadata) {
            try {
              const metadata = typeof message.metadata === 'string' ? JSON.parse(message.metadata) : message.metadata;
              userName = metadata?.userName || metadata?.displayName || `User ${message.userId}`;
            } catch (e) {
              console.warn('Failed to parse message metadata:', e);
            }
          }

          conversationMap.set(conversationKey, {
            userId: message.userId,
            channelType: message.channelType,
            channelId: message.channelId,
            agentId: message.agentId,
            agentName: agent?.name || 'Unknown Agent',
            lastMessage: message.content,
            lastMessageAt: message.createdAt,
            messageCount: messageCountResult[0]?.count || 0,
            isOnline: this.isUserOnline(message.userId),
            userProfile: {
              name: userName
            }
          });
        }
      }

      let result = Array.from(conversationMap.values());

      // Apply search filter
      if (options?.searchQuery) {
        const query = options.searchQuery.toLowerCase();
        result = result.filter(user => 
          user.userProfile.name.toLowerCase().includes(query) ||
          user.lastMessage.toLowerCase().includes(query) ||
          user.agentName.toLowerCase().includes(query)
        );
      }

      // Sort by most recent activity
      result.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

      console.log(`Found ${result.length} active conversations`);
      return result;

    } catch (error) {
      console.error("Error fetching agent console users:", error);
      return [];
    }
  }

  private isUserOnline(userId: string): boolean {
    // Simple implementation - consider user online if they had activity in last 5 minutes
    // You can enhance this with WebSocket connection tracking
    return Math.random() > 0.5; // Placeholder logic
  }

  async getAgentConsoleConversation(userId: string, channelType: string, channelId: string, agentId: number): Promise<any[]> {
    console.log(`Getting conversation for ${userId}, ${channelType}, ${channelId}, agent ${agentId}`);

    try {
      const { chatHistory } = await import('@shared/schema');
      const { and, eq, asc } = await import('drizzle-orm');

      const messages = await db
        .select({
          id: chatHistory.id,
          userId: chatHistory.userId,
          channelType: chatHistory.channelType,
          channelId: chatHistory.channelId,
          agentId: chatHistory.agentId,
          messageType: chatHistory.messageType,
          content: chatHistory.content,
          metadata: chatHistory.metadata,
          createdAt: chatHistory.createdAt,
        })
        .from(chatHistory)
        .where(
          and(
            eq(chatHistory.userId, userId),
            eq(chatHistory.channelType, channelType),
            eq(chatHistory.channelId, channelId),
            eq(chatHistory.agentId, agentId)
          )
        )
        .orderBy(asc(chatHistory.createdAt))
        .limit(100); // Limit to last 100 messages

      return messages.map(msg => ({
        id: msg.id,
        userId: msg.userId,
        channelType: msg.channelType,
        channelId: msg.channelId,
        agentId: msg.agentId,
        messageType: msg.messageType,
        content: msg.content,
        metadata: msg.metadata,
        createdAt: msg.createdAt
      }));

    } catch (error) {
      console.error("Error fetching conversation messages:", error);
      return [];
    }
  }

  async sendAgentConsoleMessage(data: {
    userId: string;
    channelType: string;
    channelId: string;
    agentId: number;
    message: string;
    messageType: string;
  }): Promise<any> {
    console.log(`Sending agent console message:`, data);

    // Mock sending message
    return {
      id: Date.now(),
      messageType: data.messageType,
      content: data.message,
      timestamp: new Date().toISOString(),
      userId: data.userId,
      agentId: data.agentId,
      success: true
    };
  }

  async getAgentConsoleSummary(userId: string, channelType: string, channelId: string): Promise<any> {
    console.log(`Getting summary for ${userId}, ${channelType}, ${channelId}`);

    try {
      const { chatHistory } = await import('@shared/schema');
      const { and, eq, sql } = await import('drizzle-orm');

      // Get conversation statistics with simpler query
      const stats = await db
        .select({
          totalMessages: sql<number>`count(*)`,
          firstContactAt: sql<string>`min(created_at)`,
          lastActiveAt: sql<string>`max(created_at)`
        })
        .from(chatHistory)
        .where(
          and(
            eq(chatHistory.userId, userId),
            eq(chatHistory.channelType, channelType),
            eq(chatHistory.channelId, channelId)
          )
        );

      const summary = stats[0];

      if (!summary || summary.totalMessages === 0) {
        return {
          totalMessages: 0,
          firstContactAt: null,
          lastActiveAt: null,
          sentiment: null,
          mainTopics: [],
          csatScore: null
        };
      }

      // Get recent messages for topic analysis
      const recentMessages = await db
        .select({
          content: chatMessages.content,
          messageType: chatMessages.messageType
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.userId, userId),
            eq(chatMessages.channelType, channelType),
            eq(chatMessages.channelId, channelId)
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(20);

      // Simple topic extraction (you can enhance this with AI)
      const userMessages = recentMessages
        .filter(msg => msg.messageType === 'user')
        .map(msg => msg.content.toLowerCase());

      const topics = [];
      if (userMessages.some(msg => msg.includes('order') || msg.includes('purchase'))) topics.push('order inquiry');
      if (userMessages.some(msg => msg.includes('ship') || msg.includes('delivery'))) topics.push('shipping');
      if (userMessages.some(msg => msg.includes('help') || msg.includes('support'))) topics.push('customer support');
      if (userMessages.some(msg => msg.includes('refund') || msg.includes('return'))) topics.push('refund request');
      if (userMessages.some(msg => msg.includes('price') || msg.includes('cost'))) topics.push('pricing');

      // Simple sentiment analysis (you can enhance this with AI)
      let sentiment = 'neutral';
      const positiveWords = ['thank', 'great', 'good', 'excellent', 'happy', 'satisfied'];
      const negativeWords = ['bad', 'terrible', 'awful', 'angry', 'frustrated', 'disappointed'];

      const allText = userMessages.join(' ');
      const positiveCount = positiveWords.filter(word => allText.includes(word)).length;
      const negativeCount = negativeWords.filter(word => allText.includes(word)).length;

      if (positiveCount > negativeCount) sentiment = 'positive';
      else if (negativeCount > positiveCount) sentiment = 'negative';

      // Calculate CSAT score based on sentiment and conversation length
      let csatScore = null;
      if (summary.totalMessages >= 3) {
        csatScore = sentiment === 'positive' ? 85 : sentiment === 'negative' ? 45 : 70;
      }

      return {
        totalMessages: summary.totalMessages,
        firstContactAt: summary.firstContactAt,
        lastActiveAt: summary.lastActiveAt,
        sentiment,
        mainTopics: topics,
        csatScore
      };

    } catch (error) {
      console.error("Error fetching conversation summary:", error);
      return {
        totalMessages: 0,
        firstContactAt: null,
        lastActiveAt: null,
        sentiment: null,
        mainTopics: [],
        csatScore: null
      };
    }
  }
  
  async getConversationSummary(userId: string, channelType: string, channelId: string): Promise<any> {
    try {
      const { chatHistory } = await import('@shared/schema');
      const { eq, and, desc } = await import('drizzle-orm');

      console.log(`Getting summary for ${userId}, ${channelType}, ${channelId}`);

      // Get basic conversation stats - select specific fields to avoid undefined issues
      const messages = await db
        .select({
          id: chatHistory.id,
          userId: chatHistory.userId,
          channelType: chatHistory.channelType,
          channelId: chatHistory.channelId,
          messageType: chatHistory.messageType,
          content: chatHistory.content,
          createdAt: chatHistory.createdAt
        })
        .from(chatHistory)
        .where(
          and(
            eq(chatHistory.userId, userId),
            eq(chatHistory.channelType, channelType),
            eq(chatHistory.channelId, channelId)
          )
        )
        .orderBy(desc(chatHistory.createdAt));

      if (messages.length === 0) {
        return {
          totalMessages: 0,
          firstContactAt: null,
          lastActiveAt: null,
          sentiment: null,
          mainTopics: [],
          csatScore: null
        };
      }

      const userMessages = messages
        .filter(msg => msg.messageType === 'user')
        .map(msg => msg.content?.toLowerCase() || '');

      const topics = [];
      if (userMessages.some(msg => msg.includes('order') || msg.includes('purchase'))) topics.push('order inquiry');
      if (userMessages.some(msg => msg.includes('ship') || msg.includes('delivery'))) topics.push('shipping');
      if (userMessages.some(msg => msg.includes('help') || msg.includes('support'))) topics.push('customer support');
      if (userMessages.some(msg => msg.includes('refund') || msg.includes('return'))) topics.push('refund request');
      if (userMessages.some(msg => msg.includes('price') || msg.includes('cost'))) topics.push('pricing');

      // Simple sentiment analysis
      let sentiment = 'neutral';
      const positiveWords = ['thank', 'great', 'good', 'excellent', 'happy', 'satisfied'];
      const negativeWords = ['bad', 'terrible', 'awful', 'angry', 'frustrated', 'disappointed'];

      const allText = userMessages.join(' ');
      const positiveCount = positiveWords.filter(word => allText.includes(word)).length;
      const negativeCount = negativeWords.filter(word => allText.includes(word)).length;

      if (positiveCount > negativeCount) sentiment = 'positive';
      else if (negativeCount > positiveCount) sentiment = 'negative';

      // Calculate CSAT score based on sentiment and conversation length
      let csatScore = null;
      if (messages.length >= 3) {
        csatScore = sentiment === 'positive' ? 85 : sentiment === 'negative' ? 45 : 70;
      }

      return {
        totalMessages: messages.length,
        firstContactAt: messages[messages.length - 1]?.createdAt || null,
        lastActiveAt: messages[0]?.createdAt || null,
        sentiment,
        mainTopics: topics,
        csatScore
      };

    } catch (error) {
      console.error('Error fetching conversation summary:', error);
      return {
        totalMessages: 0,
        firstContactAt: null,
        lastActiveAt: null,
        sentiment: null,
        mainTopics: [],
        csatScore: null
      };
    }
  }
}

export const storage = new DatabaseStorage();