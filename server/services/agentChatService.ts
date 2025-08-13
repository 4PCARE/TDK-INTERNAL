import { storage } from '../storage';
import { GuardrailsService } from './guardrails';

interface WidgetChatResponse {
  response: string;
  messageType: string;
  metadata?: any;
}

export class WidgetChatService {
  /**
   * Generate AI response for widget chat using Agent Chatbot configuration
   */
  static async generateAgentResponse(
    userMessage: string,
    agentId: number,
    userId: string,
    sessionId: string,
    conversationHistory: any[]
  ): Promise<WidgetChatResponse> {
    try {
      console.log(`🤖 Widget Chat: Getting agent ${agentId} for user ${userId}`);

      // Get agent configuration
      const agent = await storage.getAgentChatbotForWidget(agentId);
      if (!agent) {
        console.log(`❌ Widget Chat: Agent ${agentId} not found`);
        return {
          response: "ขออภัย ไม่สามารถเชื่อมต่อกับระบบได้ในขณะนี้",
          messageType: "error"
        };
      }

      console.log(`✅ Widget Chat: Found agent: ${agent.name}`);

      // Get agent's documents for context and convert to format expected by generateChatResponse
      const agentDocs = await storage.getAgentChatbotDocumentsForWidget(agentId);
      console.log(`📚 Widget Chat: Found ${agentDocs.length} documents for agent`);

      const agentDocuments = [];
      for (const agentDoc of agentDocs) {
        try {
          const document = await storage.getDocumentForWidget(agentDoc.documentId);
          if (document) {
            agentDocuments.push(document);
          }
        } catch (error) {
          console.error(`❌ Widget Chat: Error fetching document ${agentDoc.documentId}:`, error);
        }
      }

      console.log(`📄 Widget Chat: Using ${agentDocuments.length} documents for hybrid search`);

      // Use the same generateChatResponse logic as general chat with hybrid search
      const { generateChatResponse } = await import('./openai');
      let aiResponseFromDocs = "";

      try {
        // Get agent document IDs to restrict search scope
        const agentDocumentIds = agentDocuments.map(doc => doc.id);
        console.log(`Widget Chat: Restricting search to agent's ${agentDocumentIds.length} documents: [${agentDocumentIds.join(', ')}]`);

        aiResponseFromDocs = await generateChatResponse(
          userMessage,
          agentDocuments,
          undefined, // No specific document ID - will be handled by hybrid search internally
          'hybrid',  // Use hybrid search like debug page
          0.4,       // keywordWeight
          0.6        // vectorWeight
        );
        console.log(`✅ Widget Chat: Generated response using hybrid search (${aiResponseFromDocs.length} chars)`);
      } catch (error) {
        console.error("Widget Chat: generateChatResponse failed:", error);
        aiResponseFromDocs = "";
      }

      // Initialize guardrails service if configured
      let guardrailsService: GuardrailsService | null = null;
      if (agent.guardrailsConfig) {
        guardrailsService = new GuardrailsService(agent.guardrailsConfig);
        console.log(`🛡️ Widget Chat: Guardrails enabled for agent ${agent.name}`);

        // Validate input message
        const inputValidation = await guardrailsService.evaluateInput(userMessage);
        if (inputValidation.blocked) {
          console.log(`🚫 Widget Chat: Input blocked by guardrails: ${inputValidation.reason}`);
          return {
            response: inputValidation.modifiedContent || "ขออภัย ไม่สามารถตอบสนองคำขอนี้ได้",
            messageType: "blocked",
            metadata: { blocked: true, reason: inputValidation.reason }
          };
        }
      }

      // If we got a response from hybrid search, use it directly
      if (aiResponseFromDocs && aiResponseFromDocs.trim()) {
        console.log(`✅ Widget Chat: Using hybrid search response directly`);

        // Validate output with guardrails if configured
        let finalResponse = aiResponseFromDocs;
        if (guardrailsService) {
          const outputValidation = await guardrailsService.evaluateOutput(finalResponse);
          if (outputValidation.blocked) {
            console.log(`🚫 Widget Chat: Output blocked by guardrails: ${outputValidation.reason}`);
            finalResponse = outputValidation.modifiedContent || "ขออภัย ไม่สามารถให้คำตอบนี้ได้";
          } else if (outputValidation.modifiedContent) {
            finalResponse = outputValidation.modifiedContent;
          }
        }

        return {
          response: finalResponse,
          messageType: "ai_response",
          metadata: {
            agentId: agent.id,
            agentName: agent.name,
            hasDocuments: agentDocs.length > 0,
            documentCount: agentDocs.length,
            guardrailsApplied: !!guardrailsService,
            searchMethod: "hybrid"
          }
        };
      }

      // Fallback to agent's system prompt if no documents or hybrid search failed
      console.log(`⚠️ Widget Chat: Falling back to system prompt conversation`);

      // Get current date and time in Thai format
      const now = new Date();
      const thaiDate = now.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
      const thaiTime = now.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // Build conversation messages
      const systemPrompt = `${agent.systemPrompt}

📅 วันที่และเวลาปัจจุบัน: ${thaiDate} เวลา ${thaiTime} น.

ตอบเป็นภาษาไทยเสมอ เว้นแต่ผู้ใช้จะสื่อสารเป็นภาษาอื่น
ตอบอย่างเป็นมิตรและช่วยเหลือ

⚠️ สำคัญมาก: ไม่มีเอกสารอ้างอิงสำหรับคำถามนี้
- ห้ามให้ข้อมูลเฉพาะเจาะจง เช่น ที่อยู่ เบอร์โทร ราคา ชั้น หรือรายละเอียดใดๆ ที่ต้องอาศัยข้อมูลจากเอกสาร
- ให้ตอบเพียงว่าไม่สามารถให้ข้อมูลเฉพาะเจาะจงได้เนื่องจากไม่มีเอกสารอ้างอิง
- แนะนำให้ติดต่อแหล่งข้อมูลที่เชื่อถือได้แทน`;

      const messages: any[] = [
        {
          role: "system",
          content: systemPrompt
        }
      ];

      // Add conversation history (only user and assistant messages)
      const memoryLimit = agent.memoryLimit || 10;
      const recentHistory = conversationHistory
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .slice(-memoryLimit);

      recentHistory.forEach(msg => {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        });
      });

      // Add current user message
      messages.push({
        role: "user",
        content: userMessage
      });

      // === COMPREHENSIVE DEBUG OUTPUT ===
      console.log(`\n🔍 === WIDGET CHAT DEBUG SESSION ${sessionId} ===`);
      console.log(`🎯 Agent: ${agent.name} (ID: ${agentId})`);
      console.log(`👤 User: ${userId}`);
      console.log(`📝 User Message: ${userMessage}`);
      console.log(`📚 Documents Found: ${agentDocs.length}`);
      console.log(`💾 Memory Limit: ${memoryLimit}`);
      console.log(`📜 Total Conversation History: ${conversationHistory.length} messages`);
      console.log(`📤 Messages to OpenAI: ${messages.length}`);

      // Document content analysis
      if (agentDocuments.length > 0) {
        console.log(`\n📋 DOCUMENT CONTENT ANALYSIS:`);
        agentDocuments.forEach((doc, index) => {
          const fullLength = doc.content.length;
          const truncated = doc.content.includes("...");
          console.log(`  📄 Document ${index + 1}: ${fullLength} chars${truncated ? ' (TRUNCATED at 2000 chars)' : ''}`);
        });
        // Assuming contextPrompt is generated elsewhere or not directly needed here for logging
      } else {
        console.log(`\n📋 NO DOCUMENTS LINKED TO AGENT`);
      }

      // System prompt analysis
      console.log(`\n🧠 SYSTEM PROMPT ANALYSIS:`);
      console.log(`  Base System Prompt: ${agent.systemPrompt?.length || 0} chars`);
      // Assuming contextPrompt is generated elsewhere or not directly needed here for logging
      console.log(`  Total System Prompt: ${systemPrompt.length} chars`);

      // Conversation history analysis
      console.log(`\n💬 CONVERSATION HISTORY ANALYSIS:`);
      console.log(`  Raw History: ${conversationHistory.length} messages`);
      console.log(`  Filtered History: ${recentHistory.length} messages (user/assistant only)`);
      console.log(`  Applied Memory Limit: ${memoryLimit} messages`);

      if (recentHistory.length > 0) {
        console.log(`  Recent History Details:`);
        recentHistory.forEach((msg, index) => {
          const preview = msg.content.substring(0, 100);
          console.log(`    ${index + 1}. ${msg.role}: ${preview}${msg.content.length > 100 ? '...' : ''} (${msg.content.length} chars)`);
        });
      }

      // Final OpenAI request analysis
      console.log(`\n📨 FINAL OPENAI REQUEST ANALYSIS:`);
      console.log(`  Total Messages: ${messages.length}`);
      console.log(`  System Message: ${messages[0].content.length} chars`);
      console.log(`  History Messages: ${messages.length - 2} messages`);
      console.log(`  User Message: ${userMessage.length} chars`);

      // Token estimation
      const totalContent = messages.map(m => m.content).join('');
      const estimatedTokens = Math.ceil(totalContent.length / 4);
      console.log(`  Estimated Total Tokens: ~${estimatedTokens}`);

      // Check for potential issues
      if (estimatedTokens > 8000) {
        console.log(`  ⚠️  WARNING: High token count, may hit limits`);
      }
      if (agentDocuments.length > 0 && agentDocuments.every(doc => doc.content.includes("..."))) {
        console.log(`  ⚠️  WARNING: All documents truncated at 2000 chars`);
      }

      console.log(`\n📤 SENDING REQUEST TO OPENAI...`);
      console.log(`=== END DEBUG ===\n`);

      console.log(`🤖 Widget Chat: Sending ${messages.length} messages to OpenAI`);

      // Generate response with OpenAI
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
      });

      let response = completion.choices[0].message.content || "ขออภัย ไม่สามารถสร้างคำตอบได้ในขณะนี้";

      // Validate output with guardrails if configured
      if (guardrailsService) {
        const outputValidation = await guardrailsService.evaluateOutput(response);
        if (outputValidation.blocked) {
          console.log(`🚫 Widget Chat: Output blocked by guardrails: ${outputValidation.reason}`);
          response = outputValidation.modifiedContent || "ขออภัย ไม่สามารถให้คำตอบนี้ได้";
        } else if (outputValidation.modifiedContent) {
          response = outputValidation.modifiedContent;
        }
      }

      console.log(`✅ Widget Chat: Generated response (${response.length} chars)`);

      return {
        response,
        messageType: "ai_response",
        metadata: {
          agentId: agent.id,
          agentName: agent.name,
          hasDocuments: agentDocs.length > 0,
          documentCount: agentDocs.length,
          guardrailsApplied: !!guardrailsService,
          searchMethod: "fallback_conversation"
        }
      };

    } catch (error) {
      console.error("Widget Chat Service Error:", error);
      return {
        response: "ขออภัย เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง",
        messageType: "error",
        metadata: { error: error.message }
      };
    }
  }

  /**
   * Extract JSON from OpenAI response that might be wrapped in markdown
   */
  private static extractJsonFromResponse(response: string): any {
    try {
      // First try direct JSON parsing
      return JSON.parse(response);
    } catch (e) {
      try {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = response.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1]);
        }

        // Try to find JSON-like content between braces
        const braceMatch = response.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          return JSON.parse(braceMatch[0]);
        }

        throw new Error("No valid JSON found");
      } catch (parseError) {
        console.error("Failed to extract JSON from response:", response);
        throw parseError;
      }
    }
  }
}

async function generateResponseWithConfig(params: {
  message: string;
  agentConfig: any;
  documentIds: number[];
  userId: string;
  sessionId: string;
  chatHistory?: Array<{ role: "user" | "assistant"; content: string; }>;
  isTest?: boolean;
}) {
  const { message, agentConfig, documentIds, userId, sessionId, chatHistory = [], isTest = false } = params;

  try {
    console.log(`🤖 Generating response with agent config for user ${userId}`);

    // Create a temporary agent-like object from the config
    const tempAgent = {
      id: -1, // Temporary ID for testing
      name: agentConfig.name,
      description: agentConfig.description || "",
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
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log(`📊 Test agent config: Memory=${tempAgent.memoryEnabled}, Guardrails=${!!tempAgent.guardrailsConfig}`);

    // Build system prompt
    const systemPrompts = [tempAgent.systemPrompt];

    // Add personality and profession context
    if (tempAgent.personality) {
      systemPrompts.push(`Personality: ${tempAgent.personality}`);
    }
    if (tempAgent.profession) {
      systemPrompts.push(`Professional role: ${tempAgent.profession}`);
    }
    if (tempAgent.responseStyle) {
      systemPrompts.push(`Response style: ${tempAgent.responseStyle}`);
    }

    // Add search configuration context if enabled
    if (tempAgent.searchConfiguration?.enableCustomSearch && tempAgent.searchConfiguration.additionalSearchDetail) {
      systemPrompts.push(`Additional context: ${tempAgent.searchConfiguration.additionalSearchDetail}`);
    }

    // Memory handling for chat history
    let memoryContext = '';
    if (tempAgent.memoryEnabled && chatHistory.length > 0) {
      const memoryLimit = tempAgent.memoryLimit || 10;
      const recentHistory = chatHistory.slice(-memoryLimit);

      console.log(`📚 Using ${recentHistory.length} messages from chat history (limit: ${memoryLimit})`);

      memoryContext = '\nPrevious conversation:\n' +
        recentHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n') +
        '\n';
    }

    let documentContext = '';

    // Perform document search if documents are available
    if (documentIds.length > 0) {
      console.log(`🔍 Searching ${documentIds.length} documents for context`);

      const { searchSmartHybridDebug } = await import('./newSearch');
      const searchResults = await searchSmartHybridDebug(
        message,
        userId,
        {
          specificDocumentIds: documentIds,
          keywordWeight: tempAgent.searchConfiguration?.keywordWeight || 0.4,
          vectorWeight: tempAgent.searchConfiguration?.vectorWeight || 0.6,
          massSelectionPercentage: tempAgent.searchConfiguration?.documentMass || 0.3,
          limit: 8
        }
      );

      if (searchResults && searchResults.rankedChunks && searchResults.rankedChunks.length > 0) {
        console.log(`📄 Found ${searchResults.rankedChunks.length} relevant document chunks`);
        documentContext = '\nRelevant information:\n' +
          searchResults.rankedChunks.map((chunk: any) => chunk.content).join('\n\n') + '\n';
      }
    }

    // Build the full prompt with agent configuration
    const basePrompt = `You are ${tempAgent.name}, a ${tempAgent.profession} AI assistant.

Personality: ${tempAgent.personality}
Response Style: ${tempAgent.responseStyle}
${tempAgent.specialSkills ? `Special Skills: ${tempAgent.specialSkills}` : ''}

${tempAgent.systemPrompt || `You are a helpful AI assistant. Please provide accurate and helpful responses based on the available information.`}`;

    const fullPrompt = documentContext.length > 0 
      ? `${basePrompt}

${documentContext}

IMPORTANT: Base your response primarily on the information provided in the RELEVANT DOCUMENTS section above. If the documents contain relevant information to answer the user's question, use that information and mention that you found it in the available documents. If the documents don't contain relevant information, clearly state that you couldn't find specific information about their question in the available documents.

Please respond in a helpful and professional manner.`
      : `${basePrompt}

No specific documents were found relevant to this query. Please provide a helpful general response based on your knowledge as a ${tempAgent.profession} assistant.

Please respond in a helpful and professional manner.`;

    console.log(`📝 Full prompt length: ${fullPrompt.length} characters`);

    // Generate response using OpenAI
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const startTime = Date.now();

    let response;

    // Build messages for OpenAI
    const messages = [
      {
        role: "system" as const,
        content: fullPrompt
      },
      {
        role: "user" as const,
        content: message
      }
    ];

    // Apply guardrails if enabled
    if (tempAgent.guardrailsConfig) {
      console.log(`🛡️ Applying guardrails to response`);
      const guardrailsService = await import('./guardrails');
      response = await guardrailsService.generateGuardedResponse({
        prompt: fullPrompt,
        userMessage: message,
        guardrailsConfig: tempAgent.guardrailsConfig
      });
    } else {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
      });

      response = completion.choices[0].message.content || "ขออภัย ไม่สามารถสร้างคำตอบได้ในขณะนี้";
    }

    const responseTime = Date.now() - startTime;
    console.log(`⚡ Response generated in ${responseTime}ms`);

    return {
      message: response,
      sources: [], // Could add source tracking later
      responseTime: responseTime
    };

  } catch (error) {
    console.error('❌ Error generating response with config:', error);
    throw error;
  }
}

// Assuming generateResponse, processUserMessage, getOrCreateSession, updateSessionMemory, getSessionHistory are defined elsewhere or are intended to be part of this export.
// For the purpose of this edit, we'll assume they exist and are correctly imported or defined.
// If they are not defined, this export would cause a runtime error.

// Placeholder for other functions that might be exported by this module
declare function generateResponse(params: any): Promise<any>;
declare function processUserMessage(params: any): Promise<any>;
declare function getOrCreateSession(params: any): Promise<any>;
declare function updateSessionMemory(params: any): Promise<any>;
declare function getSessionHistory(params: any): Promise<any>;


export const chatService = {
  generateAgentResponse: WidgetChatService.generateAgentResponse, // Exporting the static method directly
  generateResponseWithConfig,
  // Include other functions if they are defined within this scope or imported elsewhere
  // generateResponse,
  // processUserMessage,
  // getOrCreateSession,
  // updateSessionMemory,
  // getSessionHistory
};