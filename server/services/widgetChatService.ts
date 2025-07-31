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

        // If we have agent documents, try to get AI response from them
        if (agentDocs.length > 0) {
          console.log(`🔍 Widget Chat: Searching through ${agentDocs.length} agent documents`);

          // Get search prompt and aliases from agent configuration
          const searchPrompt = agent.searchPrompt || undefined;
          const aliases = agent.aliases || undefined;

          console.log(`🔍 Widget Chat: Agent search prompt:`, searchPrompt || 'none');
          console.log(`🔍 Widget Chat: Agent aliases:`, aliases ? Object.keys(aliases).length + ' mappings' : 'none');

          // Use query preprocessor with agent's custom prompt and aliases
          const { queryPreprocessor } = await import('./queryPreprocessor');
          const queryAnalysis = await queryPreprocessor.analyzeQuery(
            userMessage,
            conversationHistory,
            `Widget chat for agent: ${agent.name}`,
            searchPrompt,
            aliases
          );

          if (!queryAnalysis.needsSearch) {
            console.log(`🚫 Widget Chat: Query doesn't need search according to preprocessor`);
            // Continue to fallback response generation
          } else {
            console.log(`✅ Widget Chat: Using enhanced query with preprocessing`);

            // Use hybrid search with enhanced query
            const searchResults = await semanticSearchServiceV2.searchDocuments(
              queryAnalysis.enhancedQuery,
              null, // Widget doesn't have a userId - we'll handle this differently
              {
                searchType: 'smart_hybrid',
                maxResults: 10,
                includeContent: true,
                documentIds: agentDocs.map(doc => doc.documentId),
                keywordWeight: queryAnalysis.keywordWeight,
                vectorWeight: queryAnalysis.vectorWeight
              }
            );

            if (searchResults && searchResults.length > 0) {
              console.log(`📚 Widget Chat: Found ${searchResults.length} relevant document chunks`);
              if (queryAnalysis.aliasesApplied && queryAnalysis.aliasesApplied.length > 0) {
                console.log(`🔗 Widget Chat: Applied aliases: ${queryAnalysis.aliasesApplied.join(', ')}`);
              }

              // Get AI response with document context
              const { generateChatResponse } = await import('./openai');
              aiResponseFromDocs = await generateChatResponse(
                userMessage,
                searchResults.map(result => ({
                  id: result.documentId || 0,
                  name: result.documentName || result.name || 'Unknown Document',
                  content: result.content || result.chunk || '',
                  summary: result.summary || '',
                  tags: result.tags || []
                })),
                undefined, // No specific document ID
                'smart_hybrid',
                queryAnalysis.keywordWeight,
                queryAnalysis.vectorWeight
              );
            }
          }
        }
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

      // Build conversation messages
      const systemPrompt = `${agent.systemPrompt}

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
      if (documentContents.length > 0) {
        console.log(`\n📋 DOCUMENT CONTENT ANALYSIS:`);
        documentContents.forEach((content, index) => {
          const fullLength = content.length;
          const truncated = content.includes("...");
          console.log(`  📄 Document ${index + 1}: ${fullLength} chars${truncated ? ' (TRUNCATED at 2000 chars)' : ''}`);
        });
        console.log(`📊 Total Document Context: ${contextPrompt.length} chars`);
      } else {
        console.log(`\n📋 NO DOCUMENTS LINKED TO AGENT`);
      }

      // System prompt analysis
      console.log(`\n🧠 SYSTEM PROMPT ANALYSIS:`);
      console.log(`  Base System Prompt: ${agent.systemPrompt?.length || 0} chars`);
      console.log(`  Document Context: ${contextPrompt.length} chars`);
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
      if (documentContents.length > 0 && documentContents.every(doc => doc.includes("..."))) {
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