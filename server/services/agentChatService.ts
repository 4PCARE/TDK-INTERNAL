// Re-export agentBot functionality for backward compatibility
export { processMessage, saveAssistantResponse } from '../agentBot';

// Export a simplified chat service that uses agentBot
export const chatService = {
  async generateAgentResponse(
    userMessage: string,
    agentId: number,
    userId: string,
    sessionId: string,
    conversationHistory: any[]
  ) {
    const { processMessage } = await import('../agentBot');

    // Create bot context
    const botContext = {
      userId: sessionId, // Use sessionId as userId for widget contexts
      channelType: 'chat_widget',
      channelId: sessionId,
      agentId: agentId,
      messageId: `widget_${Date.now()}`,
      lineIntegration: null
    };

    // Create bot message
    const botMessage = {
      type: 'text',
      content: userMessage
    };

    try {
      const response = await processMessage(botMessage, botContext);

      if (response.success) {
        return {
          response: response.response,
          messageType: "ai_response",
          metadata: {
            agentId: agentId,
            searchMethod: "agent_bot",
            hasDocuments: true
          }
        };
      } else {
        return {
          response: "ขออภัย ไม่สามารถประมวลผลคำถามได้ในขณะนี้",
          messageType: "error",
          metadata: { error: response.error }
        };
      }
    } catch (error) {
      console.error("agentChatService: Error calling agentBot:", error);
      return {
        response: "ขออภัย เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง",
        messageType: "error",
        metadata: { error: error.message }
      };
    }
  },

  async generateResponseWithConfig(params: {
    message: string;
    agentConfig: any;
    documentIds: number[];
    userId: string;
    sessionId: string;
    chatHistory?: Array<{ role: "user" | "assistant"; content: string; }>;
    isTest?: boolean;
  }) {
    // For testing, we'll create a temporary agent and use agentBot
    const { message, agentConfig, documentIds, userId, sessionId, chatHistory = [], isTest = false } = params;

    try {
      // Store the agent config temporarily in the database for testing
      const { storage } = await import('../storage');

      // Create a temporary agent for testing
      const tempAgent = await storage.createAgentChatbot({
        name: agentConfig.name + ' (Test)',
        description: agentConfig.description || '',
        systemPrompt: agentConfig.systemPrompt,
        personality: agentConfig.personality,
        profession: agentConfig.profession,
        responseStyle: agentConfig.responseStyle,
        specialSkills: agentConfig.specialSkills || [],
        guardrailsConfig: agentConfig.guardrailsConfig,
        searchConfiguration: agentConfig.searchConfiguration,
        memoryEnabled: agentConfig.memoryEnabled || false,
        memoryLimit: agentConfig.memoryLimit || 10,
        userId: userId,
        isPublic: false
      });

      // Add documents to the temporary agent
      for (const docId of documentIds) {
        try {
          await storage.addDocumentToAgent(tempAgent.id, docId, userId);
        } catch (error) {
          console.log(`Warning: Could not add document ${docId} to test agent:`, error.message);
        }
      }

      try {
        // Use agentBot to process the message
        const response = await this.generateAgentResponse(
          message,
          tempAgent.id,
          userId,
          sessionId,
          chatHistory
        );

        return {
          message: response.response,
          sources: [],
          responseTime: 0
        };
      } finally {
        // Clean up temporary agent
        try {
          await storage.deleteAgentChatbot(tempAgent.id, userId);
        } catch (error) {
          console.error('Error cleaning up temporary agent:', error);
        }
      }
    } catch (error) {
      console.error('Error in generateResponseWithConfig:', error);
      throw error;
    }
  }
};