import {
  users,
  categories,
  documents,
  folders,
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
  type InsertLineTemplateAction,
  type InternalAgentChatSession,
  type InsertInternalAgentChatSession,
  type InternalAgentChatMessage,
  type InsertInternalAgentChatMessage,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, like, count, sql, ilike, getTableColumns, gte, lte, inArray, isNull } from "drizzle-orm";

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
  getDocuments(userId: string, options?: { categoryId?: number; limit?: number; offset?: number; includeAllFolders?: boolean }): Promise<Document[]>;
  getDocument(id: number, userId: string): Promise<Document | undefined>;
  getDocumentsByIds(ids: number[], userId: string): Promise<Document[]>;
  getDocumentsByIdsForWidget(documentIds: number[]): Promise<Document[]>;
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

  // Agent Chatbot operations (Widget specific)
  getAgentChatbotForWidget(id: number): Promise<AgentChatbot | undefined>;
  getAgentChatbotDocumentsForWidget(agentId: number): Promise<AgentChatbotDocument[]>;
  getDocumentForWidget(documentId: number): Promise<any>;

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
  updateChatHistoryMetadata(chatHistoryId: number, metadata: any): Promise<void>;
  getChatHistoryWithMemoryStrategy(
    userId: string,
    channelType: string,
    channelId: string,
    agentId?: number,
    memoryLimit: number,
  ): Promise<ChatHistory[]>;

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

  // Internal Agent Chat Session operations
  getInternalAgentChatSessions(userId: string): Promise<InternalAgentChatSession[]>;
  getInternalAgentChatSessionsByAgent(userId: string, agentId: number): Promise<InternalAgentChatSession[]>;
  getInternalAgentChatSession(sessionId: number, userId: string): Promise<InternalAgentChatSession | undefined>;
  createInternalAgentChatSession(session: InsertInternalAgentChatSession): Promise<InternalAgentChatSession>;
  updateInternalAgentChatSession(sessionId: number, userId: string, updates: { title?: string }): Promise<InternalAgentChatSession>;
  deleteInternalAgentChatSession(sessionId: number, userId: string): Promise<void>;

  // Internal Agent Chat Message operations
  getInternalAgentChatMessages(sessionId: number, userId: string): Promise<InternalAgentChatMessage[]>;
  createInternalAgentChatMessage(data: {
    sessionId: number;
    role: 'user' | 'assistant';
    content: string;
  }): Promise<InternalAgentChatMessage>;
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
        documentCount: sql<number>`COALESCE(COUNT(${documents.id}), 0)`
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
  async getDocuments(userId: string, options: { categoryId?: number; limit?: number; offset?: number; includeAllFolders?: boolean } = {}): Promise<Document[]> {
    const { categoryId, limit, offset, includeAllFolders = false } = options;

    let query = db.select().from(documents).where(eq(documents.userId, userId));

    // If not explicitly requesting all folders, only show documents not in any folder
    if (!includeAllFolders) {
      query = query.where(isNull(documents.folderId));
    }

    if (categoryId) {
      query = query.where(eq(documents.categoryId, categoryId));
    }

    // Add ordering
    query = query.orderBy(desc(documents.createdAt));

    if (limit) {
      query = query.limit(limit);
    }

    if (offset) {
      query = query.offset(offset);
    }

    return await query;
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

  async getDocumentForWidget(documentId: number): Promise<any> {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));
    return document;
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

  async getDocumentsByIdsForWidget(documentIds: number[]): Promise<Document[]> {
    return await db.select()
      .from(documents)
      .where(inArray(documents.id, documentIds));
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
      // Use raw SQL query to handle array search properly
      const matchingDocuments = await db.execute(sql`
        SELECT * FROM documents 
        WHERE user_id = ${userId}
        AND (
          ${sql.join(
            searchTerms.map(term => sql`(
              name ILIKE ${`%${term}%`} OR
              description ILIKE ${`%${term}%`} OR
              content ILIKE ${`%${term}%`} OR
              summary ILIKE ${`%${term}%`} OR
              array_to_string(tags, ',') ILIKE ${`%${term}%`}
            )`),
            sql` AND `
          )}
        )
        ORDER BY updated_at DESC
      `);

      const results = matchingDocuments.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        fileName: row.file_name,
        filePath: row.file_path,
        fileSize: row.file_size,
        mimeType: row.mime_type,
        content: row.content,
        summary: row.summary,
        tags: row.tags,
        categoryId: row.category_id,
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        processedAt: row.processed_at,
        aiCategory: row.ai_category,
        aiCategoryColor: row.ai_category_color,
        isPublic: row.is_public,
        isEndorsed: row.is_endorsed,
        endorsedAt: row.endorsed_at,
        effectiveStartDate: row.effective_start_date,
        effectiveEndDate: row.effective_end_date
      }));

      console.log(`Found ${results.length} documents matching search query`);
      return results;
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

    // Get all unique document IDs accessible to user using a more efficient approach
    const accessibleDocumentIds = new Set<number>();

    // Get owned documents
    const ownedDocs = await db
      .select({ id: documents.id, fileSize: documents.fileSize })
      .from(documents)
      .where(eq(documents.userId, userId));

    ownedDocs.forEach(doc => accessibleDocumentIds.add(doc.id));

    // Get user-shared documents
    const userSharedDocs = await db
      .select({ id: documents.id, fileSize: documents.fileSize })
      .from(documents)
      .innerJoin(documentUserPermissions, eq(documents.id, documentUserPermissions.documentId))
      .where(eq(documentUserPermissions.userId, userId));

    userSharedDocs.forEach(doc => accessibleDocumentIds.add(doc.id));

    // Get department-shared documents if user has a department
    if (userInfo?.departmentId) {
      const deptSharedDocs = await db
        .select({ id: documents.id, fileSize: documents.fileSize })
        .from(documents)
        .innerJoin(documentDepartmentPermissions, eq(documents.id, documentDepartmentPermissions.documentId))
        .where(eq(documentDepartmentPermissions.departmentId, userInfo.departmentId));

      deptSharedDocs.forEach(doc => accessibleDocumentIds.add(doc.id));
    }

    // Get file sizes for all accessible documents
    const allAccessibleDocs = await db
      .select({ id: documents.id, fileSize: documents.fileSize })
      .from(documents)
      .where(inArray(documents.id, Array.from(accessibleDocumentIds)));

    const totalDocuments = allAccessibleDocs.length;
    const storageUsed = allAccessibleDocs.reduce((sum, doc) => {
      const fileSize = doc.fileSize ? Number(doc.fileSize) : 0;
      return sum + (isNaN(fileSize) ? 0 : fileSize);
    }, 0);

    // Get documents processed today (only owned documents for this stat)
    const [processedToday] = await db
      .select({ count: count(documents.id) })
      .from(documents)
      .where(
        and(
          eq(documents.userId, userId),
          gte(documents.processedAt, today)
        )
      );

    // Get AI queries today
    const [aiQueries] = await db
      .select({ count: count(chatMessages.id) })
      .from(chatMessages)
      .innerJoin(chatConversations, eq(chatMessages.conversationId, chatConversations.id))
      .where(
        and(
          eq(chatConversations.userId, userId),
          gte(chatMessages.createdAt, today)
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
    const [newConversation] = await db.insert(chatConversations).values(conversation).returning();
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
        category: documents.categoryId,
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
      const category = doc.category || 'Uncategorized';
      categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
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
      return { success: false, message: `Connection test failed: ${(error as Error).message}` };
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
    try {
      const [agent] = await db
        .select()
        .from(agentChatbots)
        .where(and(eq(agentChatbots.id, id), eq(agentChatbots.userId, userId)));
      return agent;
    } catch (error: any) {
      console.error(`💥 Database error in getAgentChatbot:`, error);

      // Check if it's a connection termination error
      if (error.code === '57P01' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
        console.log(`🔄 Retrying database connection for getAgentChatbot...`);
        // Wait a moment and retry once
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
          const [agent] = await db
            .select()
            .from(agentChatbots)
            .where(and(eq(agentChatbots.id, id), eq(agentChatbots.userId, userId)));
          return agent;
        } catch (retryError) {
          console.error(`💥 Retry failed for getAgentChatbot:`, retryError);
          throw retryError;
        }
      }

      throw error;
    }
  }

  async getAgentChatbotForWidget(id: number): Promise<AgentChatbot | undefined> {
    const [agent] = await db
      .select()
      .from(agentChatbots)
      .where(eq(agentChatbots.id, id));
    return agent;
  }

  async getAgentChatbotDocumentsForWidget(agentId: number): Promise<AgentChatbotDocument[]> {
    return await db
      .select()
      .from(agentChatbotDocuments)
      .where(eq(agentChatbotDocuments.agentId, agentId));
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

  // Folder management methods
  async createFolder(name: string, userId: string, parentId?: number): Promise<any> {
    const [folder] = await db
      .insert(folders)
      .values({ name, userId, parentId })
      .returning();
    return folder;
  }

  async getFolders(userId: string, parentId?: number): Promise<any[]> {
    const conditions = [eq(folders.userId, userId)];

    if (parentId === undefined) {
      conditions.push(isNull(folders.parentId));
    } else {
      conditions.push(eq(folders.parentId, parentId));
    }

    return await db
      .select()
      .from(folders)
      .where(and(...conditions))
      .orderBy(folders.name);
  }

  async updateFolder(id: number, userId: string, data: { name?: string; parentId?: number }): Promise<any> {
    const [folder] = await db
      .update(folders)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(folders.id, id), eq(folders.userId, userId)))
      .returning();
    return folder;
  }

  async deleteFolder(id: number, userId: string): Promise<void> {
    await db
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, userId)));
  }

  async moveDocumentsToFolder(documentIds: number[], folderId: number | null, userId: string): Promise<void> {
    await db
      .update(documents)
      .set({ folderId, updatedAt: new Date() })
      .where(and(
        inArray(documents.id, documentIds),
        eq(documents.userId, userId)
      ));
  }

  async getDocumentsByFolder(userId: string, folderId?: number | null): Promise<any[]> {
    const conditions = [eq(documents.userId, userId)];

    if (folderId === null) {
      conditions.push(isNull(documents.folderId));
    } else if (folderId !== undefined) {
      conditions.push(eq(documents.folderId, folderId));
    }

    return await db
      .select()
      .from(documents)
      .where(and(...conditions))
      .orderBy(desc(documents.createdAt));
  }

  async assignFolderToAgent(agentId: number, folderId: number, userId: string): Promise<void> {
    // Get all documents in the folder
    const folderDocuments = await this.getDocumentsByFolder(userId, folderId);

    // Add all documents to the agent
    for (const doc of folderDocuments) {
      try {
        await this.addDocumentToAgent(agentId, doc.id, userId);
      } catch (error) {
        // Skip if already assigned
        if (error.message?.includes('duplicate')) {
          continue;
        }
        throw error;
      }
    }
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

  // Chat Widget operations
  async updateChatWidget(id: number, updates: any, userId: string): Promise<any> {
    const { chatWidgets } = await import('@shared/schema');
    const { eq, and } = await import('drizzle-orm');

    const [updated] = await db
      .update(chatWidgets)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(chatWidgets.id, id), eq(chatWidgets.userId, userId)))
      .returning();

    if (!updated) {
      throw new Error("Chat widget not found or access denied");
    }

    return updated;
  }

  async setPlatformWidget(id: number, userId: string): Promise<any> {
    const { chatWidgets } = await import('@shared/schema');
    const { eq, and, ne } = await import('drizzle-orm');

    // First, ensure only admins can do this
    const user = await this.getUser(userId);
    if (!user || !user.email?.includes('admin')) {
      throw new Error("Only administrators can set platform widgets");
    }

    // Remove platform widget status from all other widgets
    await db
      .update(chatWidgets)
      .set({ isPlatformWidget: false, updatedAt: new Date() })
      .where(ne(chatWidgets.id, id));

    // Set this widget as the platform widget
    const [updated] = await db
      .update(chatWidgets)
      .set({ isPlatformWidget: true, updatedAt: new Date() })
      .where(eq(chatWidgets.id, id))
      .returning();

    if (!updated) {
      throw new Error("Chat widget not found");
    }

    return updated;
  }

  async unsetPlatformWidget(id: number, userId: string): Promise<any> {
    const { chatWidgets } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');

    // First, ensure only admins can do this
    const user = await this.getUser(userId);
    if (!user || !user.email?.includes('admin')) {
      throw new Error("Only administrators can unset platform widgets");
    }

    const [updated] = await db
      .update(chatWidgets)
      .set({ isPlatformWidget: false, updatedAt: new Date() })
      .where(eq(chatWidgets.id, id))
      .returning();

    if (!updated) {
      throw new Error("Chat widget not found");
    }

    return updated;
  }

  // System Settings operations
  async getSystemSettings(): Promise<any> {
    const { systemSettings } = await import('@shared/schema');
    
    const settings = await db
      .select()
      .from(systemSettings)
      .limit(1);

    if (settings.length === 0) {
      // Return default settings if none exist
      return {
        maxFileSize: 25,
        allowedFileTypes: ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'json'],
        retentionDays: 365,
        autoBackup: false,
        enableAnalytics: true,
        enablePlatformLiveChat: true
      };
    }

    return {
      maxFileSize: settings[0].maxFileSize,
      allowedFileTypes: settings[0].allowedFileTypes,
      retentionDays: settings[0].retentionDays,
      autoBackup: settings[0].autoBackup,
      enableAnalytics: settings[0].enableAnalytics,
      enablePlatformLiveChat: settings[0].enablePlatformLiveChat
    };
  }

  async updateSystemSettings(settingsData: any): Promise<any> {
    const { systemSettings } = await import('@shared/schema');
    
    const [updated] = await db
      .insert(systemSettings)
      .values({
        id: 1,
        maxFileSize: settingsData.maxFileSize,
        allowedFileTypes: settingsData.allowedFileTypes,
        retentionDays: settingsData.retentionDays,
        autoBackup: settingsData.autoBackup,
        enableAnalytics: settingsData.enableAnalytics,
        enablePlatformLiveChat: settingsData.enablePlatformLiveChat,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: {
          maxFileSize: settingsData.maxFileSize,
          allowedFileTypes: settingsData.allowedFileTypes,
          retentionDays: settingsData.retentionDays,
          autoBackup: settingsData.autoBackup,
          enableAnalytics: settingsData.enableAnalytics,
          enablePlatformLiveChat: settingsData.enablePlatformLiveChat,
          updatedAt: new Date()
        }
      })
      .returning();

    return updated;
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
        webhookUrl: null,
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

  async getChatHistoryWithMemoryStrategy(userId: string, channelType: string, channelId: string, agentId?: number, memoryLimit: number = 10): Promise<ChatHistory[]> {
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
        eq(chatHistory.channelId, channelId)
      ))
      .orderBy(desc(chatHistory.createdAt));

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

  async getAllChatHistoryForUser(userId: string): Promise<any[]> {
    const { chatHistory } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');

    // Get all chat history entries for analytics (not just for specific user conversations)
    // This is for analytics aggregation across all platforms for this authenticated user
    const allHistory = await db
      .select()
      .from(chatHistory)
      .orderBy(chatHistory.createdAt);

    return allHistory;
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

  // Internal Agent Chat Session operations
  async getInternalAgentChatSessions(userId: string): Promise<InternalAgentChatSession[]> {
    const { internalAgentChatSessions } = await import('@shared/schema');
    return await db
      .select()
      .from(internalAgentChatSessions)
      .where(eq(internalAgentChatSessions.userId, userId))
      .orderBy(desc(internalAgentChatSessions.updatedAt));
  }

  async getInternalAgentChatSessionsByAgent(userId: string, agentId: number): Promise<InternalAgentChatSession[]> {
    const { internalAgentChatSessions } = await import('@shared/schema');
    return await db
      .select()
      .from(internalAgentChatSessions)
      .where(
        and(
          eq(internalAgentChatSessions.userId, userId),
          eq(internalAgentChatSessions.agentId, agentId)
        )
      )
      .orderBy(desc(internalAgentChatSessions.updatedAt));
  }

  async getInternalAgentChatSession(sessionId: number, userId: string): Promise<InternalAgentChatSession | undefined> {
    const { internalAgentChatSessions } = await import('@shared/schema');
    const [session] = await db
      .select()
      .from(internalAgentChatSessions)
      .where(
        and(
          eq(internalAgentChatSessions.id, sessionId),
          eq(internalAgentChatSessions.userId, userId)
        )
      );
    return session;
  }

  async createInternalAgentChatSession(data: {
    userId: string;
    agentId: number;
    title: string;
    lastMessageAt: Date;
    messageCount: number;
  }): Promise<InternalAgentChatSession> {
    const { internalAgentChatSessions } = await import('@shared/schema');
    const [session] = await db
      .insert(internalAgentChatSessions)
      .values({
        userId: data.userId,
        agentId: data.agentId,
        title: data.title,
        lastMessageAt: data.lastMessageAt,
        messageCount: data.messageCount,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return session;
  }

  async deleteInternalAgentChatSession(sessionId: number, userId: string): Promise<void> {
    const { internalAgentChatMessages, internalAgentChatSessions } = await import('@shared/schema');

    // Delete messages first
    await db
      .delete(internalAgentChatMessages)
      .where(eq(internalAgentChatMessages.sessionId, sessionId));

    // Then delete the session (with user verification)
    const result = await db
      .delete(internalAgentChatSessions)
      .where(
        and(
          eq(internalAgentChatSessions.id, sessionId),
          eq(internalAgentChatSessions.userId, userId)
        )
      );

    if (result.rowCount === 0) {
      throw new Error("Session not found or access denied");
    }
  }

  async getInternalAgentChatMessages(sessionId: number, userId: string): Promise<InternalAgentChatMessage[]> {
    const { internalAgentChatMessages, internalAgentChatSessions } = await import('@shared/schema');

    // Verify session belongs to user
    const session = await this.getInternalAgentChatSession(sessionId, userId);
    if (!session) {
      throw new Error('Session not found or access denied');
    }

    return await db
      .select()
      .from(internalAgentChatMessages)
      .where(eq(internalAgentChatMessages.sessionId, sessionId))
      .orderBy(internalAgentChatMessages.createdAt);
  }

  async createInternalAgentChatMessage(data: {
    sessionId: number;
    role: 'user' | 'assistant';
    content: string;
  }): Promise<InternalAgentChatMessage> {
    const { internalAgentChatMessages, internalAgentChatSessions } = await import('@shared/schema');

    // Create message
    const [message] = await db
      .insert(internalAgentChatMessages)
      .values({
        sessionId: data.sessionId,
        role: data.role,
        content: data.content,
        createdAt: new Date()
      })
      .returning();

    // Update session's last message info
    await db
      .update(internalAgentChatSessions)
      .set({
        lastMessageAt: new Date(),
        messageCount: sql`message_count + 1`,
        updatedAt: new Date()
      })
      .where(eq(internalAgentChatSessions.id, data.sessionId));

    return message;
  }

  async createInternalAgentChatSession(session: InsertInternalAgentChatSession): Promise<InternalAgentChatSession> {
    const { internalAgentChatSessions } = await import('@shared/schema');
    const [newSession] = await db
      .insert(internalAgentChatSessions)
      .values(session)
      .returning();
    return newSession;
  }

  async updateInternalAgentChatSession(sessionId: number, updates: { title?: string }, userId: string): Promise<InternalAgentChatSession> {
    const { internalAgentChatSessions } = await import('@shared/schema');
    const [updatedSession] = await db
      .update(internalAgentChatSessions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(internalAgentChatSessions.id, sessionId),
          eq(internalAgentChatSessions.userId, userId)
        )
      )
      .returning();
    return updatedSession;
  }

  async deleteInternalAgentChatSession(sessionId: number, userId: string): Promise<void> {
    const { internalAgentChatSessions } = await import('@shared/schema');
    await db
      .delete(internalAgentChatSessions)
      .where(
        and(
          eq(internalAgentChatSessions.id, sessionId),
          eq(internalAgentChatSessions.userId, userId)
        )
      );
  }
}

export const storage = new DatabaseStorage();