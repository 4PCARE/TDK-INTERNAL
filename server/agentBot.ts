import OpenAI from "openai";
import { storage } from "./storage";
import { LineImageService } from "./lineImageService";
import { GuardrailsService, GuardrailConfig } from "./services/guardrails";
import { semanticSearchServiceV2 } from "./services/semanticSearchV2";
import { generateChatResponse, generateEmbedding } from "./services/openai";
import { webSearchTool, WebSearchToolConfig } from "./services/webSearchTool";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_API_KEY });

export interface MessageMetadata {
  messageType?: string;
  messageId?: string;
  contentProvider?: any;
  originalContentUrl?: string;
  previewImageUrl?: string;
  packageId?: string;
  stickerId?: string;
  relatedImageMessageId?: string;
  documentSearch?: boolean;
}

export interface BotMessage {
  type: "text" | "image" | "sticker" | string;
  content: string;
  metadata?: MessageMetadata;
}

export interface BotContext {
  userId: string;
  channelType: string;
  channelId: string;
  agentId: number;
  messageId: string;
  lineIntegration: any;
  hrEmployeeData?: any;
}

export interface BotResponse {
  success: boolean;
  response?: string;
  error?: string;
  needsImageProcessing?: boolean;
  imageProcessingPromise?: Promise<string>;
}

/**
 * Check if a message is image-related based on keywords
 */
function isImageRelatedQuery(message: string): boolean {
  const imageKeywords = [
    "รูป",
    "รูปอะไรครับ",
    "ภาพ",
    "รูปภาพ",
    "ภาพถ่าย",
    "image",
    "picture",
    "photo",
    "เห็นอะไร",
    "ในรูป",
    "ในภาพ",
    "อธิบาย",
    "บรรยาย",
    "ดูเหมือน",
    "รูปนี้",
    "ภาพนี้",
    "รูปที่ส่ง",
    "ภาพที่ส่ง",
    "รูปที่แนบ",
    "what's in",
    "describe",
    "tell me about",
    "show",
    "picture",
    "ข้อมูล",
    "รายละเอียด",
    "เนื้อหา",
    "สิ่งที่เห็น",
  ];

  const lowerMessage = message.toLowerCase();
  return imageKeywords.some((keyword) =>
    lowerMessage.includes(keyword.toLowerCase()),
  );
}

/**
 * Extract image analysis from system messages
 */
function extractImageAnalysis(messages: any[]): string {
  const systemMessages = messages.filter(
    (msg) =>
      msg.messageType === "system" &&
      msg.metadata?.messageType === "image_analysis",
  );

  if (systemMessages.length === 0) {
    return "";
  }

  let imageContext = "\n=== การวิเคราะห์รูปภาพที่ส่งมาก่อนหน้า ===\n";

  // Get the most recent image analyses (last 3)
  const recentAnalyses = systemMessages.slice(-3);

  recentAnalyses.forEach((msg, index) => {
    const analysisContent = msg.content.replace("[การวิเคราะห์รูปภาพ] ", "");
    imageContext += `\n--- รูปภาพที่ ${index + 1} ---\n${analysisContent}\n`;
  });

  return imageContext;
}

/**
 * Generate AI response using OpenAI with document search and chat history
 */
async function getAiResponseDirectly(
  userMessage: string,
  agentId: number,
  userId: string,
  channelType: string,
  channelId: string,
  skipSearch: boolean = false,
  hrEmployeeData: any = null,
): Promise<string> {
  try {
    console.log(`🔍 Debug: Getting agent ${agentId} for user ${userId}`);

    // Get agent configuration with retry logic
    let agentData;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        // For widget contexts (web channel), use getAgentChatbotForWidget which doesn't require user ownership
        if (channelType === 'web' || channelType === 'chat_widget') {
          agentData = await storage.getAgentChatbotForWidget(agentId);
        } else {
          agentData = await storage.getAgentChatbot(agentId, userId);
        }
        break; // Success, exit retry loop
      } catch (dbError: any) {
        retryCount++;
        console.log(`🔄 Database connection attempt ${retryCount}/${maxRetries} failed:`, dbError.code);

        if (retryCount >= maxRetries) {
          throw dbError; // Re-throw after max retries
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }

    if (!agentData) {
      console.log(`❌ Agent ${agentId} not found${channelType === 'web' || channelType === 'chat_widget' ? '' : ` for user ${userId}`}`);
      return "ขออภัย ไม่สามารถเชื่อมต่อกับระบบได้ในขณะนี้";
    }

    console.log(`✅ Found agent: ${agentData.name}`);

    // Check if this is an image-related query
    const isImageQuery = isImageRelatedQuery(userMessage);
    console.log(`🖼️ Image-related query detected: ${isImageQuery}`);
    console.log(`🔍 User message for analysis: "${userMessage}"`);

    // Get chat history if memory is enabled
    let chatHistory: any[] = [];
    if (agentData.memoryEnabled) {
      const memoryLimit = agentData.memoryLimit || 10;
      console.log(
        `📚 Fetching chat history (limit: ${memoryLimit}) for channel type: ${channelType}`,
      );

      try {
        if (channelType === "chat_widget") {
          // For widget chat, fetch from widgetChatMessages table
          const { widgetChatMessages } = await import("@shared/schema");
          const { db } = await import("./db");
          const { desc, eq } = await import("drizzle-orm");

          const widgetMessages = await db
            .select({
              role: widgetChatMessages.role,
              content: widgetChatMessages.content,
              messageType: widgetChatMessages.messageType,
              metadata: widgetChatMessages.metadata,
              createdAt: widgetChatMessages.createdAt,
            })
            .from(widgetChatMessages)
            .where(eq(widgetChatMessages.sessionId, channelId))
            .orderBy(desc(widgetChatMessages.createdAt))
            .limit(memoryLimit);

          // Convert widget messages to chat history format
          chatHistory = widgetMessages.reverse().map((msg) => ({
            role: msg.role,
            content: msg.content,
            messageType: msg.messageType,
            metadata: msg.metadata,
            createdAt: msg.createdAt,
          }));

          console.log(`📝 Found ${chatHistory.length} widget chat messages`);
        } else {
          // Use regular chat history for Line OA and other channels
          chatHistory = await storage.getChatHistoryWithMemoryStrategy(
            userId,
            channelType,
            channelId,
            agentId,
            memoryLimit,
          );
          console.log(
            `📝 Found ${chatHistory.length} previous messages (all types included)`,
          );
        }
      } catch (error) {
        console.error("⚠️ Error fetching chat history:", error);
        if (channelType !== "chat_widget") {
          // Fallback to original method for non-widget channels
          try {
            chatHistory = await storage.getChatHistory(
              userId,
              channelType,
              channelId,
              agentId,
              memoryLimit,
            );
            console.log(
              `📝 Fallback: Found ${chatHistory.length} previous messages`,
            );
          } catch (fallbackError) {
            console.error("⚠️ Fallback error:", fallbackError);
          }
        }
      }
    }

    // Get agent's documents for context using vector search (only if search is not skipped)
    let contextPrompt = "";
    const documentContents: string[] = [];
    let agentDocIds: number[] = [];
    let agentDocs: any[] = [];

    if (!skipSearch) {
      // For widget contexts, use widget-specific methods that don't require user ownership
      if (channelType === 'web' || channelType === 'chat_widget') {
        agentDocs = await storage.getAgentChatbotDocumentsForWidget(agentId);
      } else {
        agentDocs = await storage.getAgentChatbotDocuments(agentId, userId);
      }

      if (agentDocs.length > 0) {
        console.log(`📚 Found ${agentDocs.length} documents for agent`);
        // FIXED: Use documentId from the relationship table, not the relationship ID
        agentDocIds = agentDocs.map((doc) => doc.documentId);
        console.log(`📚 Agent document IDs: [${agentDocIds.join(', ')}]`);
      } else {
        console.log(`⚠️ No documents found for agent`);
      }
    }

    // Step 1: AI Query Preprocessing
    console.log(
      `🧠 AgentBot: Starting AI query preprocessing for: "${userMessage}"`,
    );
    const { queryPreprocessor } = await import(
      "./services/queryPreprocessor"
    );

    // Get recent chat history if available (mock for now)
    const recentChatHistory = []; // TODO: Integrate with actual chat history

    // Build additional context including search configuration
    let additionalContext = `Document scope: ${agentDocIds.length > 0 ? agentDocIds.join(', ') : 'All documents'}`;

    // Add agent's search configuration if available
    let additionalSearchDetail = '';
    if (agentData.searchConfiguration?.enableCustomSearch && agentData.searchConfiguration?.additionalSearchDetail) {
      additionalSearchDetail = agentData.searchConfiguration.additionalSearchDetail;
      additionalContext += `\n\nSearch Configuration: ${additionalSearchDetail}`;
    }

    console.log(`🧠 AgentBot: Search configuration enabled: ${!!agentData.searchConfiguration?.enableCustomSearch}`);
    console.log(`🧠 AgentBot: Additional search detail: "${additionalSearchDetail}"`);

    const queryAnalysis = await queryPreprocessor.analyzeQuery(
      userMessage,
      recentChatHistory,
      additionalContext,
      additionalSearchDetail  // Pass as separate parameter
    );

    console.log(`🧠 AgentBot: Query analysis result:`, {
      needsSearch: queryAnalysis.needsSearch,
      enhancedQuery: queryAnalysis.enhancedQuery,
      keywordWeight: queryAnalysis.keywordWeight.toFixed(2),
      vectorWeight: queryAnalysis.vectorWeight.toFixed(2),
      reasoning: queryAnalysis.reasoning,
    });

    let aiResponse = "";
    let databaseQueryResult: string | null = null; // Variable to store database query results

    // Check if agent has database connections and try database search first
    let databaseResults: any = null;
    let hasDatabaseConnections = false;

    if (queryAnalysis.needsSearch) {
      console.log(`🗄️ AgentBot: Query needs search - checking for database connections first`);

      try {
        // Get agent's database connections
        const agentDatabases = await storage.getAgentDatabaseConnections(agentId, userId);
        hasDatabaseConnections = agentDatabases && agentDatabases.length > 0;

        console.log(`🗄️ AgentBot: Agent has ${agentDatabases?.length || 0} database connections`);

        if (hasDatabaseConnections) {
          console.log(`🗄️ AgentBot: Attempting database search for query: "${queryAnalysis.enhancedQuery}"`);
          console.log(`🗄️ AgentBot: Available databases:`, agentDatabases.map(db => ({
            connectionId: db.connectionId,
            name: db.name || 'Unnamed'
          })));

          // Import and use the AI database agent
          const { aiDatabaseAgent } = await import("./services/aiDatabaseAgent");

          // Try each database connection until we get results
          for (const dbConnection of agentDatabases) {
            try {
              console.log(`🗄️ AgentBot: Trying database connection ${dbConnection.connectionId} (${dbConnection.name || 'Unnamed'})`);

              const dbResult = await aiDatabaseAgent.generateSQL(
                queryAnalysis.enhancedQuery,
                dbConnection.connectionId,
                userId,
                50 // maxRows
              );

              if (dbResult.success && dbResult.data && dbResult.data.length > 0) {
                console.log(`✅ AgentBot: Database query successful - found ${dbResult.data.length} rows`);
                databaseResults = dbResult;
                break; // Found results, stop trying other connections
              } else if (dbResult.success && (!dbResult.data || dbResult.data.length === 0)) {
                console.log(`⚠️ AgentBot: Database query successful but returned no rows`);
                databaseResults = dbResult; // Keep for explanation even if no data
              } else {
                console.log(`❌ AgentBot: Database query failed: ${dbResult.error}`);
              }
            } catch (dbError) {
              console.error(`❌ AgentBot: Error querying database ${dbConnection.connectionId}:`, dbError);
              console.error(`Full error details:`, dbError);
            }
          }
        }
      } catch (error) {
        console.error(`❌ AgentBot: Error checking database connections:`, error);
      }
    }


    if (!queryAnalysis.needsSearch) {
      console.log(
        `⏭️ AgentBot: Query doesn't need search, using agent conversation without documents`,
      );

      // Build system prompt without document context
      let systemPrompt = `${agentData.systemPrompt}

สำคัญ: เมื่อผู้ใช้ถามเกี่ยวกับรูปภาพหรือภาพที่ส่งมา และมีข้อมูลการวิเคราะห์รูปภาพในข้อความของผู้ใช้ ให้ใช้ข้อมูลนั้นในการตอบคำถาม อย่าบอกว่า "ไม่สามารถดูรูปภาพได้" หากมีข้อมูลการวิเคราะห์รูปภาพให้แล้ว

ตอบเป็นภาษาไทยเสมอ เว้นแต่ผู้ใช้จะสื่อสารเป็นภาษาอื่น
ตอบอย่างเป็นมิตรและช่วยเหลือ`;

      // Add HR employee context if available
      if (hrEmployeeData) {
        console.log(`👤 AgentBot: Adding HR employee context for ${hrEmployeeData.firstName || hrEmployeeData.first_name} ${hrEmployeeData.lastName || hrEmployeeData.last_name} (${hrEmployeeData.employeeId})`);
        systemPrompt += `

🏢 ข้อมูลพนักงาน: คุณกำลังสนทนากับ ${hrEmployeeData.firstName || hrEmployeeData.first_name} ${hrEmployeeData.lastName || hrEmployeeData.last_name}
- รหัสพนักงาน: ${hrEmployeeData.employeeId || hrEmployeeData.employee_id}
- แผนก: ${hrEmployeeData.department}
- ตำแหน่ง: ${hrEmployeeData.position}
- อีเมล: ${hrEmployeeData.email}
- วันที่เริ่มงาน: ${hrEmployeeData.startDate || hrEmployeeData.hire_date}
- สถานะ: ${hrEmployeeData.isActive ? 'Active' : 'Inactive'}

กรุณาให้คำตอบที่เป็นส่วนตัวและเหมาะสมกับตำแหน่งและแผนกของพนักงาน`;
      } else {
        console.log(`👤 AgentBot: No HR employee context available for personalization`);
      }

      systemPrompt += `

⚠️ สำคัญมาก: ไม่มีเอกสารอ้างอิงสำหรับคำถามนี้
- ห้ามให้ข้อมูลเฉพาะเจาะจง เช่น ที่อยู่ เบอร์โทร ราคา ชั้น หรือรายละเอียดใดๆ ที่ต้องอาศัยข้อมูลจากเอกสาร
- ให้ตอบเพียงว่าไม่สามารถให้ข้อมูลเฉพาะเจาะจงได้เนื่องจากไม่มีเอกสารอ้างอิง
- แนะนำให้ติดต่อแหล่งข้อมูลที่เชื่อถือได้แทน`;

      const messages: any[] = [
        {
          role: "system",
          content: systemPrompt,
        },
      ];

      // Add chat history (exclude system messages from conversation flow)
      const userBotMessages = chatHistory.filter(
        (msg) => msg.messageType === "user" || msg.messageType === "assistant",
      );

      userBotMessages.forEach((msg) => {
        messages.push({
          role: msg.messageType === "user" ? "user" : "assistant",
          content: msg.content,
        });
      });

      // Add current user message
      messages.push({
        role: "user",
        content: userMessage,
      });

      console.log(
        `🤖 AgentBot: Sending ${messages.length} messages to OpenAI (no document search)`,
      );

      // Initialize guardrails service if configured
      let guardrailsService: GuardrailsService | null = null;
      if (agentData.guardrailsConfig) {
        guardrailsService = new GuardrailsService(agentData.guardrailsConfig);
        console.log(
          `🛡️ AgentBot: Guardrails enabled for conversation without documents`,
        );
      }

      // Validate input
      if (guardrailsService) {
        const inputValidation = await guardrailsService.evaluateInput(
          userMessage,
          {
            documents: [],
            agent: agentData,
          },
        );

        if (!inputValidation.allowed) {
          console.log(
            `🚫 AgentBot: Input blocked by guardrails - ${inputValidation.reason}`,
          );
          const suggestions = inputValidation.suggestions?.join(" ") || "";
          aiResponse = `ขออภัย ไม่สามารถประมวลผลคำถามนี้ได้ ${inputValidation.reason ? `(${inputValidation.reason})` : ""} ${suggestions}`;

          return aiResponse; // Exit function early
        }

        // Use modified content if privacy protection applied
        if (inputValidation.modifiedContent) {
          messages[messages.length - 1].content = inputValidation.modifiedContent;
        }
      }

      // Generate AI response
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
      });

      aiResponse =
        completion.choices[0].message.content || "ขออภัย ไม่สามารถประมวลผลคำถามได้ในขณะนี้";

      // Validate AI output with guardrails
      if (guardrailsService) {
        const outputValidation = await guardrailsService.evaluateOutput(
          aiResponse,
          {
            documents: [],
            agent: agentData,
            userQuery: userMessage,
          },
        );

        if (!outputValidation.allowed) {
          console.log(
            `🚫 AgentBot: Output blocked by guardrails - ${outputValidation.reason}`,
          );
          const suggestions = outputValidation.suggestions?.join(" ") || "";
          aiResponse = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ ${outputValidation.reason ? `(${outputValidation.reason})` : ""} ${suggestions}`;
        } else if (outputValidation.modifiedContent) {
          console.log(`🔒 AgentBot: AI output modified for compliance`);
          aiResponse = outputValidation.modifiedContent;
        }
      }

      console.log(
        `✅ AgentBot: Generated response without document search (${aiResponse.length} chars)`,
      );
    } else {
      console.log(
        `🔍 AgentBot: Query needs search - checking database results first`,
      );

      // If we have database results, use them
      if (databaseResults && databaseResults.success) {
        if (databaseResults.data && databaseResults.data.length > 0) {
          console.log(`🗄️ AgentBot: Using database results (${databaseResults.data.length} rows) for response`);

          // Format database results for AI response
          const dbResultsText = `Database Query Results:
SQL: ${databaseResults.sql}
Rows returned: ${databaseResults.data.length}
Execution time: ${databaseResults.executionTime}ms

Data:
${JSON.stringify(databaseResults.data, null, 2)}

${databaseResults.explanation || ''}`;

          // Build system prompt with database results
          let systemPrompt = `${agentData.systemPrompt}

Database Query Results:
${dbResultsText}

Based on the database query results above, provide a helpful response to the user's question.
Answer in Thai unless the user communicates in another language.
Be friendly and helpful.`;

          // Add HR employee context if available
          if (hrEmployeeData) {
            console.log(`👤 AgentBot: Adding HR employee context with database results`);
            systemPrompt += `

🏢 ข้อมูลพนักงาน: คุณกำลังสนทนากับ ${hrEmployeeData.firstName || hrEmployeeData.first_name} ${hrEmployeeData.lastName || hrEmployeeData.last_name}
- รหัสพนักงาน: ${hrEmployeeData.employeeId || hrEmployeeData.employee_id}
- แผนก: ${hrEmployeeData.department}
- ตำแหน่ง: ${hrEmployeeData.position}
- อีเมล: ${hrEmployeeData.email}
- วันที่เริ่มงาน: ${hrEmployeeData.startDate || hrEmployeeData.hire_date}
- สถานะ: ${hrEmployeeData.isActive ? 'Active' : 'Inactive'}

กรุณาให้คำตอบที่เป็นส่วนตัวและเหมาะสมกับตำแหน่งและแผนกของพนักงาน`;
          }

          const messages: any[] = [
            {
              role: "system",
              content: systemPrompt,
            },
          ];

          // Add chat history
          const userBotMessages = chatHistory.filter(
            (msg) => msg.messageType === "user" || msg.messageType === "assistant",
          );

          userBotMessages.forEach((msg) => {
            messages.push({
              role: msg.messageType === "user" ? "user" : "assistant",
              content: msg.content,
            });
          });

          // Add current user message
          messages.push({
            role: "user",
            content: userMessage,
          });

          console.log(`🤖 AgentBot: Generating response with database results`);

          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            max_tokens: 1000,
            temperature: 0.7,
          });

          aiResponse = completion.choices[0].message.content || "ขออภัย ไม่สามารถประมวลผลผลลัพธ์จากฐานข้อมูลได้";

          console.log(`✅ AgentBot: Generated response with database results (${aiResponse.length} chars)`);
          return aiResponse;

        } else if (databaseResults.data && databaseResults.data.length === 0) {
          console.log(`🗄️ AgentBot: Database query returned no results - falling back to document search`);
        }
      } else if (hasDatabaseConnections && !databaseResults) {
        console.log(`❌ AgentBot: Database connections exist but query failed - falling back to document search`);
      }

      console.log(
        `🔍 AgentBot: Proceeding with document search (database search ${hasDatabaseConnections ? 'attempted but' : 'not attempted -'} ${databaseResults ? 'returned no results' : 'no database connections'})`,
      );

      // Use agent's search configuration if available
      const searchConfig = agentData.searchConfiguration || {};
      const chunkMaxType = searchConfig.chunkMaxType || 'number';
      const chunkMaxValue = searchConfig.chunkMaxValue || 8;
      const documentMass = searchConfig.documentMass || 0.3;
      const tokenLimitEnabled = searchConfig.tokenLimitEnabled || false;
      const tokenLimitType = searchConfig.tokenLimitType || 'document';
      const documentTokenLimit = searchConfig.documentTokenLimit || 12000;
      const finalTokenLimit = searchConfig.finalTokenLimit || 4000;

      console.log(`🔧 AgentBot: Using agent's search config - ${chunkMaxType}=${chunkMaxValue}, mass=${Math.round(documentMass * 100)}%${tokenLimitEnabled ? `, token limit: ${tokenLimitType}=${tokenLimitType === 'document' ? documentTokenLimit : finalTokenLimit}` : ''}`);

      let documentContext = ''; // Initialize documentContext here
      const availableDocumentNames: string[] = []; // To store document names

      // Check if web search should be triggered
      const webSearchConfig: WebSearchToolConfig = agentData.webSearchConfig || {
        enabled: false,
        triggerKeywords: [],
        maxResults: 5,
        requireWhitelist: true
      };

      let webSearchResults = '';

      console.log(`🔍 Web search config for agent ${agentId}:`, {
        enabled: webSearchConfig.enabled,
        triggerKeywords: webSearchConfig.triggerKeywords,
        maxResults: webSearchConfig.maxResults,
        requireWhitelist: webSearchConfig.requireWhitelist
      });

      if (await webSearchTool.shouldTriggerWebSearch(userMessage, webSearchConfig)) {
        console.log(`🌐 Web search triggered for agent ${agentId}`);

        try {
          const searchResult = await webSearchTool.performWebSearch(
            queryAnalysis.enhancedQuery || userMessage,
            agentId,
            userId,
            webSearchConfig
          );

          if (searchResult.results.length > 0) {
            webSearchResults = webSearchTool.formatWebSearchResults(
              searchResult.results,
              searchResult.source
            );
            console.log(`✅ Web search completed: ${searchResult.results.length} results from ${searchResult.source}`);
          } else {
            console.log(`📭 No web search results found`);
          }
        } catch (error) {
          console.error(`❌ Web search failed:`, error);
          webSearchResults = '⚠️ Web search temporarily unavailable.';
        }
      } else {
        console.log(`⏭️ Web search not triggered for query: "${userMessage}"`);
      }

      // If no documents are attached to the agent, skip search entirely and handle as no-document query
      if (agentDocIds.length === 0) {
        console.log(`📄 AgentBot: No documents attached to agent - treating as conversation without documents`);
        documentContext = '';

        // Redirect to no-document conversation logic
        console.log(
          `⏭️ AgentBot: No documents available, using agent conversation without document search`,
        );

        // Build system prompt without document context (same as non-search path)
        let systemPrompt = `${agentData.systemPrompt}

สำคัญ: เมื่อผู้ใช้ถามเกี่ยวกับรูปภาพหรือภาพที่ส่งมา และมีข้อมูลการวิเคราะห์รูปภาพในข้อความของผู้ใช้ ให้ใช้ข้อมูลนั้นในการตอบคำถาม อย่าบอกว่า "ไม่สามารถดูรูปภาพได้" หากมีข้อมูลการวิเคราะห์รูปภาพให้แล้ว

ตอบเป็นภาษาไทยเสมอ เว้นแต่ผู้ใช้จะสื่อสารเป็นภาษาอื่น
ตอบอย่างเป็นมิตรและช่วยเหลือ`;

        // Add HR employee context if available
        if (hrEmployeeData) {
          console.log(`👤 AgentBot: Adding HR employee context (no docs) for ${hrEmployeeData.firstName || hrEmployeeData.first_name} ${hrEmployeeData.lastName || hrEmployeeData.last_name} (${hrEmployeeData.employeeId})`);
          systemPrompt += `

🏢 ข้อมูลพนักงาน: คุณกำลังสนทนากับ ${hrEmployeeData.firstName || hrEmployeeData.first_name} ${hrEmployeeData.lastName || hrEmployeeData.last_name}
- รหัสพนักงาน: ${hrEmployeeData.employeeId || hrEmployeeData.employee_id}
- แผนก: ${hrEmployeeData.department}
- ตำแหน่ง: ${hrEmployeeData.position}
- อีเมล: ${hrEmployeeData.email}
- วันที่เริ่มงาน: ${hrEmployeeData.startDate || hrEmployeeData.hire_date}
- สถานะ: ${hrEmployeeData.isActive ? 'Active' : 'Inactive'}

กรุณาให้คำตอบที่เป็นส่วนตัวและเหมาะสมกับตำแหน่งและแผนกของพนักงาน`;
        } else {
          console.log(`👤 AgentBot: No HR employee context available for no-document conversation`);
        }

        systemPrompt += `

⚠️ สำคัญมาก: ไม่มีเอกสารอ้างอิงสำหรับคำถามนี้
- ห้ามให้ข้อมูลเฉพาะเจาะจง เช่น ที่อยู่ เบอร์โทร ราคา ชั้น หรือรายละเอียดใดๆ ที่ต้องอาศัยข้อมูลจากเอกสาร
- ให้ตอบเพียงว่าไม่สามารถให้ข้อมูลเฉพาะเจาะจงได้เนื่องจากไม่มีเอกสารอ้างอิง
- แนะนำให้ติดต่อแหล่งข้อมูลที่เชื่อถือได้แทน`;

        const messages: any[] = [
          {
            role: "system",
            content: systemPrompt,
          },
        ];

        // Add chat history (exclude system messages from conversation flow)
        const userBotMessages = chatHistory.filter(
          (msg) => msg.messageType === "user" || msg.messageType === "assistant",
        );

        userBotMessages.forEach((msg) => {
          messages.push({
            role: msg.messageType === "user" ? "user" : "assistant",
            content: msg.content,
          });
        });

        // Add current user message
        messages.push({
          role: "user",
          content: userMessage,
        });

        console.log(
          `🤖 AgentBot: Sending ${messages.length} messages to OpenAI (no documents available)`,
        );

        // Initialize guardrails service if configured
        let guardrailsService: GuardrailsService | null = null;
        if (agentData.guardrailsConfig) {
          guardrailsService = new GuardrailsService(agentData.guardrailsConfig);
          console.log(
            `🛡️ AgentBot: Guardrails enabled for no-document conversation`,
          );
        }

        // Validate input
        if (guardrailsService) {
          const inputValidation = await guardrailsService.evaluateInput(
            userMessage,
            {
              documents: [],
              agent: agentData,
            },
          );

          if (!inputValidation.allowed) {
            console.log(
              `🚫 AgentBot: Input blocked by guardrails - ${inputValidation.reason}`,
            );
            const suggestions = inputValidation.suggestions?.join(" ") || "";
            aiResponse = `ขออภัย ไม่สามารถประมวลผลคำถามนี้ได้ ${inputValidation.reason ? `(${inputValidation.reason})` : ""} ${suggestions}`;

            return aiResponse; // Exit function early
          }

          // Use modified content if privacy protection applied
          if (inputValidation.modifiedContent) {
            messages[messages.length - 1].content = inputValidation.modifiedContent;
          }
        }

        // Generate AI response
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: messages,
          max_tokens: 1000,
          temperature: 0.7,
        });

        aiResponse =
          completion.choices[0].message.content || "ขออภัย ไม่สามารถประมวลผลคำถามได้ในขณะนี้";

        // Validate AI output with guardrails
        if (guardrailsService) {
          const outputValidation = await guardrailsService.evaluateOutput(
            aiResponse,
            {
              documents: [],
              agent: agentData,
              userQuery: userMessage,
            },
          );

          if (!outputValidation.allowed) {
            console.log(
              `🚫 AgentBot: Output blocked by guardrails - ${outputValidation.reason}`,
            );
            const suggestions = outputValidation.suggestions?.join(" ") || "";
            aiResponse = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ ${outputValidation.reason ? `(${outputValidation.reason})` : ""} ${suggestions}`;
          } else if (outputValidation.modifiedContent) {
            console.log(`🔒 AgentBot: AI output modified for compliance`);
            aiResponse = outputValidation.modifiedContent;
          }
        }

        console.log(
          `✅ AgentBot: Generated response without documents (${aiResponse.length} chars)`,
        );

        return aiResponse; // Return early since no documents are available
      } else {
        // Perform smart hybrid search if needed and agent has documents
        if (queryAnalysis.needsSearch && agentDocIds.length > 0) {
          console.log(
            `🔍 Agent performing smart hybrid search with enhanced query: "${queryAnalysis.enhancedQuery}"`,
          );

          const { searchSmartHybridDebug } = await import("./services/newSearch");
          const searchResults = await searchSmartHybridDebug(
            queryAnalysis.enhancedQuery,
            userId,
            {
              keywordWeight: queryAnalysis.keywordWeight || 0.5,
              vectorWeight: queryAnalysis.vectorWeight || 0.5,
              specificDocumentIds: agentDocIds,
              massSelectionPercentage: agentData.searchConfiguration?.documentMass || 0.3,
              limit: agentData.searchConfiguration?.chunkMaxType === 'number'
                ? agentData.searchConfiguration?.chunkMaxValue || 8
                : undefined
            },
          );

          console.log(
            `📊 Smart search returned ${searchResults?.length || 0} results`,
          );

          // Apply chunk maximum if using percentage - handle both array and object with results property
          let finalResults = Array.isArray(searchResults) ? searchResults : (searchResults?.results || []);
          if (agentData.searchConfiguration?.chunkMaxType === 'percentage' && agentData.searchConfiguration?.chunkMaxValue > 0 && finalResults.length > 0) {
            const maxChunks = Math.max(1, Math.ceil(finalResults.length * (agentData.searchConfiguration.chunkMaxValue / 100)));
            finalResults = finalResults.slice(0, maxChunks);
            console.log(`Applied ${agentData.searchConfiguration.chunkMaxValue}% limit: ${finalResults.length} → ${maxChunks} chunks`);
          }

          // Build document context from search results
          if (finalResults && finalResults.length > 0) {
            const contextChunks = finalResults.map((result, index) => {
              return `Document ${result.documentId} (Chunk ${result.chunkIndex}):\n${result.content}`;
            });

            documentContents.push(...contextChunks);
            contextPrompt = documentContents.join("\n\n---\n\n");
            console.log(
              `📄 Built context with ${contextChunks.length} chunks (${contextPrompt.length} chars)`,
            );
          } else {
            console.log(`📄 No search results to build context from`);
          }
        } else if (queryAnalysis.needsSearch) {
          console.log(
            `⚠️ Query needs search but agent has no documents configured`,
          );
        }
      } // End of else block for document search

      // Apply final token limit if enabled
      if (tokenLimitEnabled && tokenLimitType === 'final') {
        const finalTokenLimit = searchConfig.finalTokenLimit;
        const finalCharLimit = finalTokenLimit * 4; // Convert tokens to characters
        if (documentContext.length > finalCharLimit) {
          console.log(`📄 AgentBot: Final context exceeds ${finalTokenLimit} tokens (${finalCharLimit} chars), current: ${documentContext.length} chars (~${Math.round(documentContext.length/4)} tokens), truncating...`);
          // Truncate the document context while preserving system prompt and user message
          const maxDocumentChars = finalCharLimit - agentData.systemPrompt.length - userMessage.length - 200; // Buffer for formatting
          if (maxDocumentChars > 0) {
            documentContext = documentContext.substring(0, maxDocumentChars) + "\n[Content truncated due to token limit]";
          } else {
            // If even system prompt + user message exceeds final limit, truncate document context to minimum
            documentContext = "[Content truncated due to token limit]";
          }
        }
        console.log(`📄 AgentBot: Final context: ${documentContext.length} chars (~${Math.round(documentContext.length/4)} tokens, limit: ${finalTokenLimit} tokens/${finalCharLimit} chars)`);
      }

      if (documentContext || queryAnalysis.needsSearch) { // Only proceed if there's document context or if search was intended
        const now = new Date();
        now.setHours(now.getHours() + 7)
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

        // Define hrPersonalizedPrompt outside of conditional blocks
        let hrPersonalizedPrompt = "";
        if (hrEmployeeData) {
          hrPersonalizedPrompt = `🏢 ข้อมูลพนักงาน: คุณกำลังสนทนากับ ${hrEmployeeData.firstName || hrEmployeeData.first_name} ${hrEmployeeData.lastName || hrEmployeeData.last_name}
- รหัสพนักงาน: ${hrEmployeeData.employeeId || hrEmployeeData.employee_id}
- แผนก: ${hrEmployeeData.department}
- ตำแหน่ง: ${hrEmployeeData.position}
- อีเมล: ${hrEmployeeData.email}
- วันที่เริ่มงาน: ${hrEmployeeData.startDate || hrEmployeeData.hire_date}
-สถานะ: ${hrEmployeeData.isActive ? 'Active' : 'Inactive'}

กรุณาให้คำตอบที่เป็นส่วนตัวและเหมาะสมกับตำแหน่งและแผนกของพนักงาน`;
        }

        // Build system prompt with document context
        const systemPrompt = `${agentData.systemPrompt}

${agentData.personality ? `Personality: ${agentData.personality}` : ''}
${agentData.profession ? `Professional Role: ${agentData.profession}` : ''}
${agentData.responseStyle ? `Response Style: ${agentData.responseStyle}` : ''}
${agentData.responseLanguage ? `Primary Language: ${agentData.responseLanguage}` : ''}

${hrEmployeeData ? hrPersonalizedPrompt : ''}

${availableDocumentNames.length > 0 ? `AVAILABLE DOCUMENTS: I have access to the following documents: ${availableDocumentNames.join(', ')}. I can answer questions about topics covered in these documents.` : ''}

IMPORTANT: Use the following document content to answer questions. Only provide information that can be found in the documents. If information is not available in the documents, clearly state that you don't have that information.

${documentContext}`;

        if (hrEmployeeData) {
          console.log(`🏢 Added HR personalization for employee: ${hrEmployeeData.fullName || hrEmployeeData.first_name} ${hrEmployeeData.last_name || ''} (${hrEmployeeData.department})`);
        }

        // Build conversation messages including chat history
        const messages: any[] = [
          {
            role: "system",
            content: systemPrompt,
          },
        ];

        // Add chat history (exclude system messages from conversation flow)
        const userBotMessages = chatHistory.filter(
          (msg) =>
            msg.messageType === "user" ||
            msg.messageType === "assistant",
        );

        userBotMessages.forEach((msg) => {
          messages.push({
            role: msg.messageType === "user" ? "user" : "assistant",
            content: msg.content,
          });
        });

        // Add current user message
        messages.push({
          role: "user",
          content: userMessage,
        });

        // Truncate to 30k characters
        let totalLength = messages.reduce(
          (sum, msg) => sum + msg.content.length,
          0,
        );
        console.log(
          `📊 AgentBot: Total prompt length before truncation: ${totalLength} characters`,
        );

        if (totalLength > 30000) {
          console.log(`✂️ AgentBot: Truncating prompt from ${totalLength} to 30,000 characters`);

          const maxPromptLength = 30000;
          const systemMessageLength = messages[0].content.length;
          const currentUserMessageLength =
            messages[messages.length - 1].content.length;
          const availableForHistory =
            maxPromptLength -
            systemMessageLength -
            currentUserMessageLength -
            200; // 200 chars buffer

          if (availableForHistory > 0) {
            // Keep recent conversation history within available space
            let historyLength = 0;
            const truncatedMessages = [messages[0]]; // Keep system message

            // Add messages from most recent backward until we hit the limit
            for (let i = messages.length - 2; i >= 1; i--) {
              const msgLength = messages[i].content.length;
              if (historyLength + msgLength <= availableForHistory) {
                truncatedMessages.splice(1, 0, messages[i]); // Insert at beginning of history
                historyLength += msgLength;
              } else {
                break;
              }
            }

            // Add current user message
            truncatedMessages.push(messages[messages.length - 1]);
            messages.length = 0;
            messages.push(...truncatedMessages);

            const newTotalLength = messages.reduce(
              (sum, msg) => sum + msg.content.length,
              0,
            );
            console.log(
              `✅ AgentBot: Truncated prompt to ${newTotalLength} characters (${messages.length - 2} history messages kept)`,
            );
          } else {
            // If even system + user message exceeds 30k, truncate system message
            console.log(
              `⚠️ AgentBot: System + user message too long, truncating system message`,
            );
            const maxSystemLength =
              maxPromptLength - currentUserMessageLength - 100;
            if (maxSystemLength > 0) {
              messages[0].content =
                messages[0].content.substring(0, maxSystemLength) +
                "...[truncated]";
              // Keep only system and current user message
              messages.splice(1, messages.length - 2);
            }
          }
        }

        const finalLength = messages.reduce(
          (sum, msg) => sum + msg.content.length,
          0,
        );
        console.log(
          `🤖 AgentBot: Sending ${messages.length} messages to OpenAI (final length: ${finalLength} chars)`,
        );

        // Initialize guardrails service if configured
        let guardrailsService: GuardrailsService | null = null;
        if (agentData.guardrailsConfig) {
          guardrailsService = new GuardrailsService(agentData.guardrailsConfig);
          console.log(
            `🛡️ AgentBot: Guardrails enabled for agent ${agentData.name}`,
          );
        }

        // Apply guardrails if configured
        if (guardrailsService) {
          const inputValidation = await guardrailsService.evaluateInput(
            userMessage,
            {
              documents: documentContext ? [documentContext] : [],
              agent: agentData,
            },
          );

          if (!inputValidation.allowed) {
            console.log(
              `🚫 AgentBot: Input blocked by guardrails - ${inputValidation.reason}`,
            );
            const suggestions = inputValidation.suggestions?.join(" ") || "";
            aiResponse = `ขออภัย ไม่สามารถประมวลผลคำถามนี้ได้ ${inputValidation.reason ? `(${inputValidation.reason})` : ""} ${suggestions}`;

            return aiResponse; // Exit function early
          }

          // Use modified content if privacy protection applied
          if (inputValidation.modifiedContent) {
            messages[messages.length - 1].content = inputValidation.modifiedContent;
          }
        }

        // Generate AI response
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: messages,
          max_tokens: 1000,
          temperature: 0.7,
        });

        aiResponse =
          completion.choices[0].message.content || "ขออภัย ไม่สามารถประมวลผลคำถามได้ในขณะนี้";

        // Validate AI output with guardrails
        if (guardrailsService) {
          const outputValidation = await guardrailsService.evaluateOutput(
            aiResponse,
            {
              documents: documentContext ? [documentContext] : [],
              agent: agentData,
              userQuery: userMessage,
            },
          );

          if (!outputValidation.allowed) {
            console.log(
              `🚫 AgentBot: Output blocked by guardrails - ${outputValidation.reason}`,
            );
            const suggestions = outputValidation.suggestions?.join(" ") || "";
            aiResponse = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ ${outputValidation.reason ? `(${outputValidation.reason})` : ""} ${suggestions}`;
          } else if (outputValidation.modifiedContent) {
            console.log(`🔒 AgentBot: AI output modified for compliance`);
            aiResponse = outputValidation.modifiedContent;
          }
        }

        console.log(
          `✅ AgentBot: Generated response with document search (${aiResponse.length} chars)`,
        );
      } else {
        console.log(`❌ AgentBot: No relevant documents found for query and no search was performed.`);

        if (hasDatabaseConnections && (!databaseResults || (databaseResults.data && databaseResults.data.length === 0))) {
          aiResponse = "ขออภัย ไม่พบข้อมูลที่เกี่ยวข้องในฐานข้อมูล และไม่มีเอกสารอ้างอิงที่เกี่ยวข้อง กรุณาลองถามในรูปแบบอื่นหรือตรวจสอบข้อมูลในฐานข้อมูล";
        } else {
          aiResponse = "ขออภัย ไม่พบข้อมูลที่เกี่ยวข้องกับคำถามของคุณ กรุณาลองถามในรูปแบบอื่น";
        }
      }

      // If we have web search results, incorporate them into the response
      if (webSearchResults) {
        console.log(`🌐 Incorporating web search results into AI response`);
        
        // Create a new system prompt that includes web search context
        let webSearchSystemPrompt = `${agentData.systemPrompt}

สำคัญ: ใช้ข้อมูลจากการค้นหาเว็บไซต์ด้านล่างเพื่อตอบคำถามของผู้ใช้:

${webSearchResults}

ตอบเป็นภาษาไทยเสมอ เว้นแต่ผู้ใช้จะสื่อสารเป็นภาษาอื่น
ตอบอย่างเป็นมิตรและช่วยเหลือ โดยอ้างอิงข้อมูลจากเว็บไซต์ที่เชื่อถือได้`;

        // Add HR employee context if available
        if (hrEmployeeData) {
          console.log(`👤 AgentBot: Adding HR employee context with web search results`);
          webSearchSystemPrompt += `

🏢 ข้อมูลพนักงาน: คุณกำลังสนทนากับ ${hrEmployeeData.firstName || hrEmployeeData.first_name} ${hrEmployeeData.lastName || hrEmployeeData.last_name}
- รหัสพนักงาน: ${hrEmployeeData.employeeId || hrEmployeeData.employee_id}
- แผนก: ${hrEmployeeData.department}
- ตำแหน่ง: ${hrEmployeeData.position}
- อีเมล: ${hrEmployeeData.email}
- วันที่เริ่มงาน: ${hrEmployeeData.startDate || hrEmployeeData.hire_date}
- สถานะ: ${hrEmployeeData.isActive ? 'Active' : 'Inactive'}

กรุณาให้คำตอบที่เป็นส่วนตัวและเหมาะสมกับตำแหน่งและแผนกของพนักงาน`;
        }

        const webSearchMessages: any[] = [
          {
            role: "system",
            content: webSearchSystemPrompt,
          },
        ];

        // Add chat history
        const userBotMessages = chatHistory.filter(
          (msg) => msg.messageType === "user" || msg.messageType === "assistant",
        );

        userBotMessages.forEach((msg) => {
          webSearchMessages.push({
            role: msg.messageType === "user" ? "user" : "assistant",
            content: msg.content,
          });
        });

        // Add current user message
        webSearchMessages.push({
          role: "user",
          content: userMessage,
        });

        console.log(`🤖 AgentBot: Generating response with web search results`);

        const webSearchCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: webSearchMessages,
          max_tokens: 1000,
          temperature: 0.7,
        });

        aiResponse = webSearchCompletion.choices[0].message.content || "ขออภัย ไม่สามารถประมวลผลผลลัพธ์จากการค้นหาเว็บได้";

        console.log(`✅ AgentBot: Generated response with web search results (${aiResponse.length} chars)`);
        
        // Apply guardrails if configured
        if (guardrailsService) {
          const outputValidation = await guardrailsService.evaluateOutput(
            aiResponse,
            {
              documents: webSearchResults ? [webSearchResults] : [],
              agent: agentData,
              userQuery: userMessage,
            },
          );

          if (!outputValidation.allowed) {
            console.log(
              `🚫 AgentBot: Web search output blocked by guardrails - ${outputValidation.reason}`,
            );
            const suggestions = outputValidation.suggestions?.join(" ") || "";
            aiResponse = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ ${outputValidation.reason ? `(${outputValidation.reason})` : ""} ${suggestions}`;
          } else if (outputValidation.modifiedContent) {
            console.log(`🔒 AgentBot: Web search AI output modified for compliance`);
            aiResponse = outputValidation.modifiedContent;
          }
        }
        
        return aiResponse; // Return early with web search results
      }
    }

    return aiResponse;
  } catch (error) {
    console.error("💥 AgentBot Error generating AI response:", error);
    return "ขออภัย เกิดข้อผิดพลาดในการประมวลผลคำถาม กรุณาลองใหม่อีกครั้ง";
  }
}

/**
 * Process image message with analysis
 */
async function processImageMessage(
  messageId: string,
  channelAccessToken: string,
  context: BotContext,
  chatHistoryId: number,
): Promise<string> {
  console.log("🖼️ AgentBot: Starting image processing...");
  const imageService = LineImageService.getInstance();

  try {
    // Wait for image processing to complete
    await imageService.processImageMessage(
      messageId,
      channelAccessToken,
      context.userId,
      context.channelType,
      context.channelId,
      context.agentId,
      chatHistoryId,
    );
    console.log("✅ AgentBot: Image processing completed successfully");

    // Get the SPECIFIC image analysis for THIS message
    const updatedChatHistory = await storage.getChatHistory(
      context.userId,
      context.channelType,
      context.channelId,
      context.agentId,
      10, // Get more messages to find the right analysis
    );

    // Find the image analysis that corresponds to THIS specific message
    const imageAnalysisMessage = updatedChatHistory.find(
      (msg) =>
        msg.messageType === "system" &&
        msg.metadata &&
        (msg.metadata as any).messageType === "image_analysis" &&
        (msg.metadata as any).relatedImageMessageId === messageId,
    );

    if (imageAnalysisMessage) {
      const imageAnalysisResult = imageAnalysisMessage.content.replace(
        "[การวิเคราะห์รูปภาพ] ",
        "",
      );
      console.log(
        `🔍 AgentBot: Found specific image analysis for message ${messageId}: ${imageAnalysisResult.substring(0, 100)}...`,
      );

      // Generate AI response with image analysis
      const contextMessage = `ผู้ใช้ส่งรูปภาพมา นี่คือผลการวิเคราะห์รูปภาพ:

${imageAnalysisResult}

กรุณาให้ข้อมูลเกี่ยวกับสิ่งที่เห็นในรูป พร้อมถามว่ามีอะไรให้ช่วยเหลือ`;

      const aiResponse = await getAiResponseDirectly(
        contextMessage,
        context.agentId,
        context.userId,
        context.channelType,
        context.channelId,
      );

      console.log("✅ AgentBot: Image analysis response generated successfully");
      return aiResponse;
    } else {
      console.log("⚠️ AgentBot: No specific image analysis found for this message");
      return "ขออภัย ไม่สามารถวิเคราะห์รูปภาพได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";
    }
  } catch (error) {
    console.error("⚠️ AgentBot: Error processing image message:", error);
    return "ขออภัย เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองใหม่อีกครั้ง";
  }
}

/**
 * Main bot function to process a message and return a response
 */
export async function processMessage(
  message: BotMessage,
  context: BotContext,
): Promise<BotResponse> {
  try {
    console.log(`🤖 AgentBot: Processing ${message.type} message from ${context.channelType}:${context.channelId}`);

    // Handle different message types
    if (message.type === "image") {
      console.log("🖼️ AgentBot: Image message detected - processing image analysis");

      // Return immediate acknowledgment and set up image processing
      return {
        success: true,
        response: "ได้รับรูปภาพแล้ว ขอเวลาตรวจสอบสักครู่นะคะ",
        needsImageProcessing: true,
        imageProcessingPromise: (async () => {
          // Process image in background and return the AI response
          const chatHistoryId = await saveChatHistory(message, context, "user");
          return await processImageMessage(
            context.messageId,
            context.lineIntegration.channelAccessToken,
            context,
            chatHistoryId,
          );
        })(),
      };
    }

    // Handle text and other message types
    let contextMessage = message.content;
    if (message.type === "sticker") {
      contextMessage = "ผู้ใช้ส่งสติ๊กเกอร์มา กรุณาตอบอย่างเป็นมิตรและถามว่ามีอะไรให้ช่วย";
    }

    // Get AI response with HR employee context
    const aiResponse = await getAiResponseDirectly(
      contextMessage,
      context.agentId,
      context.userId,
      context.channelType,
      context.channelId,
      false, // skipSearch
      context.hrEmployeeData // Pass HR employee data
    );

    console.log(`✅ AgentBot: Generated response for ${message.type} message (${aiResponse.length} chars)`);

    return {
      success: true,
      response: aiResponse,
    };
  } catch (error) {
    console.error("💥 AgentBot: Error processing message:", error);
    return {
      success: false,
      error: "เกิดข้อผิดพลาดในการประมวลผลข้อความ กรุณาลองใหม่อีกครั้ง",
    };
  }
}

/**
 * Save chat history entry
 */
async function saveChatHistory(
  message: BotMessage,
  context: BotContext,
  messageType: "user" | "assistant" | "system",
): Promise<number> {
  try {
    const savedChatHistory = await storage.createChatHistory({
      userId: context.userId,
      channelType: context.channelType,
      channelId: context.channelId,
      agentId: context.agentId,
      messageType: messageType,
      content: message.content,
      metadata: message.metadata || {},
    });
    console.log(`💾 AgentBot: Saved ${messageType} message, ID: ${savedChatHistory.id}`);
    return savedChatHistory.id;
  } catch (error) {
    console.error(`⚠️ AgentBot: Error saving ${messageType} message:`, error);
    throw error;
  }
}

/**
 * Save assistant response to chat history
 */
export async function saveAssistantResponse(
  response: string,
  context: BotContext,
  metadata: MessageMetadata = {},
): Promise<void> {
  try {
    await storage.createChatHistory({
      userId: context.userId,
      channelType: context.channelType,
      channelId: context.channelId,
      agentId: context.agentId,
      messageType: "assistant",
      content: response,
      metadata: metadata,
    });
    console.log("💾 AgentBot: Saved assistant response to chat history");
  } catch (error) {
    console.error("⚠️ AgentBot: Error saving assistant response:", error);
    throw error;
  }
}



/**
 * Check carousel intents using the carousel service
 */
export async function checkCarouselIntents(
  userMessage: string,
  integrationId: number,
  userId: string,
): Promise<{ matched: boolean; template?: any; similarity?: number }> {
  try {
    console.log(`🎠 AgentBot: Checking carousel intents for: "${userMessage}"`);

    // Use the carousel service
    const { checkCarouselIntents: carouselServiceCheck } = await import("./services/carouselService");

    // Call the carousel service function
    const result = await carouselServiceCheck(userMessage, integrationId, userId);

    console.log(`🎠 AgentBot: Carousel intent check result: ${result.matched}`);
    return {
      matched: result.matched,
      template: result.template,
      similarity: result.similarity,
    };
  } catch (error) {
    console.error("⚠️ AgentBot: Error checking carousel intents:", error);
    return { matched: false };
  }
}