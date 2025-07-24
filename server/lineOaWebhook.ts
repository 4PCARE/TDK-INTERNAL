import { Request, Response } from "express";
import OpenAI from "openai";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import { LineImageService } from "./lineImageService";
import { GuardrailsService, GuardrailConfig } from "./services/guardrails";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface LineMessage {
  type: string;
  id: string;
  text?: string;
  // Image message
  contentProvider?: {
    type: string;
  };
  // Sticker message
  packageId?: string;
  stickerId?: string;
}

interface LineEvent {
  type: string;
  message?: LineMessage;
  replyToken?: string;
  source: {
    userId: string;
    type: string;
  };
}

interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

// Verify Line signature
function verifyLineSignature(
  body: string,
  signature: string,
  channelSecret: string,
): boolean {
  const hash = crypto
    .createHmac("sha256", channelSecret)
    .update(body)
    .digest("base64");

  return hash === signature;
}

// Send reply message to Line
async function sendLineReply(
  replyToken: string,
  message: string,
  channelAccessToken: string,
) {
  try {
    const response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("❌ Line API Error:", await response.text());
      return false;
    }

    console.log("✅ Line reply sent successfully");
    return true;
  } catch (error) {
    console.error("💥 Error sending Line reply:", error);
    return false;
  }
}

// Send push message to Line user (for Human Agent messages)
export async function sendLinePushMessage(
  userId: string,
  message: string,
  channelAccessToken: string,
) {
  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Line Push API Error:", errorText);
      return false;
    }

    console.log("✅ Line push message sent successfully to:", userId);
    return true;
  } catch (error) {
    console.error("💥 Error sending Line push message:", error);
    return false;
  }
}

// Send image message to Line user (for Human Agent images)
export async function sendLineImageMessage(
  userId: string,
  imageUrl: string,
  channelAccessToken: string,
  captionText?: string,
) {
  try {
    // Convert relative URL to absolute URL for Line API
    const protocol = "https:";
    const host = process.env.REPLIT_DOMAINS || "localhost:5000";
    const absoluteImageUrl = `${protocol}//${host}${imageUrl}`;

    console.log("📸 Sending Line image message:", {
      userId,
      absoluteImageUrl,
      captionText,
    });

    const messages: any[] = [
      {
        type: "image",
        originalContentUrl: absoluteImageUrl,
        previewImageUrl: absoluteImageUrl,
      },
    ];

    // Add caption text as separate message if provided
    if (captionText && captionText.trim()) {
      messages.push({
        type: "text",
        text: captionText,
      });
    }

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Line Push Image API Error:", errorText);
      return false;
    }

    console.log("✅ Line image message sent successfully to:", userId);
    return true;
  } catch (error) {
    console.error("💥 Error sending Line image message:", error);
    return false;
  }
}

// Get AI response using OpenAI with chat history
/**
 * Detect if user message is asking about image content
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

// New function to get AI response without saving chat history (to prevent duplicates)
async function getAiResponseDirectly(
  userMessage: string,
  agentId: number,
  userId: string,
  channelType: string,
  channelId: string,
): Promise<string> {
  try {
    console.log(`🔍 Debug: Getting agent ${agentId} for user ${userId}`);

    // Get agent configuration
    const agent = await storage.getAgentChatbot(agentId, userId);
    if (!agent) {
      console.log(`❌ Agent ${agentId} not found for user ${userId}`);
      return "ขออภัย ไม่สามารถเชื่อมต่อกับระบบได้ในขณะนี้";
    }

    console.log(`✅ Found agent: ${agent.name}`);

    // Check if this is an image-related query
    const isImageRelatedQuery = (message: string): boolean => {
      const imageKeywords = [
        "รูป",
        "รูปภาพ",
        "ภาพ",
        "ภาพถ่าย",
        "ภาพในรูป",
        "รูปภาพที่ส่งมา",
        "รูปภาพล่าสุด",
        "image",
        "picture",
        "photo",
      ];

      const lowerMessage = message.toLowerCase();
      return imageKeywords.some((keyword) => lowerMessage.includes(keyword));
    };
    const isImageQuery = isImageRelatedQuery(userMessage);
    console.log(`🖼️ Image-related query detected: ${isImageQuery}`);
    console.log(`🔍 User message for analysis: "${userMessage}"`);

    // Get chat history if memory is enabled
    let chatHistory: any[] = [];
    if (agent.memoryEnabled) {
      const memoryLimit = agent.memoryLimit || 10;
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
            messageType: msg.role,
            content: msg.content,
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

    // Get agent's documents for context using vector search
    const agentDocs = await storage.getAgentChatbotDocuments(agentId, userId);
    let contextPrompt = "";

    // Initialize documentContents in the correct scope
    const documentContents: string[] = [];

    if (agentDocs.length > 0) {
      console.log(`📚 Found ${agentDocs.length} documents for agent`);

      // Use unified search service for consistent behavior across all platforms
      try {
        const { unifiedSearchService } = await import(
          "./services/unifiedSearchService"
        );

        // Search for relevant chunks ONLY from agent's documents using unified search
        const agentDocIds = agentDocs.map((d) => d.documentId);
        console.log(
          `LINE OA: Using unified search with agent's ${agentDocIds.length} documents: [${agentDocIds.join(", ")}]`,
        );

        console.log(`🔍 LINE OA: About to call unifiedSearchService.searchAgentDocuments with:`);
        console.log(`   📋 Agent Document IDs: [${agentDocIds.join(', ')}]`);
        console.log(`   👤 User ID: ${userId}`);
        console.log(`   💬 Query: "${userMessage}"`);
        
        const hybridResults = await unifiedSearchService.searchAgentDocuments(
          userMessage,
          userId,
          agentDocIds,
          {
            searchType: "hybrid",
            limit: 2, // Only get top 2 chunks globally as requested
            keywordWeight: 0.4,
            vectorWeight: 0.6,
            enableQueryAugmentation: true,
            chatType: "lineoa",
            contextId: channelId,
            agentId: agentId // Pass agent ID for chat history retrieval
          },
        );

        console.log(`✅ LINE OA: unifiedSearchService returned ${hybridResults.length} results`);
        if (hybridResults.length > 0) {
          console.log(`🔍 LINE OA: First result document ID: ${hybridResults[0].id}`);
          console.log(`🔍 LINE OA: All result document IDs: [${hybridResults.map(r => r.id).join(', ')}]`);
        }

        console.log(
          `🔍 Line OA: Found ${hybridResults.length} relevant chunks using hybrid search`,
        );

        if (hybridResults.length > 0) {
          // Use only the content from the top 2 chunks - ensure we're getting the actual content
          hybridResults.forEach((result, index) => {
            console.log(`📋 LINE OA: Processing chunk ${index + 1} from ${result.name}, similarity: ${result.similarity.toFixed(3)}`);
            console.log(`📄 LINE OA: Chunk content preview: ${result.content.substring(0, 200)}...`);
            
            documentContents.push(
              `=== เอกสาร: ${result.name} (Chunk ${index + 1}, คล้ายคลึง: ${result.similarity.toFixed(2)}) ===\n${result.content}\n`,
            );
          });

          console.log(
            `📄 Line OA: Using hybrid search with ${hybridResults.length} top chunks globally (Total chars: ${documentContents.join("").length})`,
          );
          
          // Debug: Log the full context being sent to AI
          console.log(`🔍 LINE OA: Context preview being sent to AI:`);
          console.log(documentContents.join("\n").substring(0, 500) + "...");
        } else {
          console.log(
            `📄 Line OA: No relevant chunks found via unified search`,
          );
        }
      } catch (vectorError) {
        console.error(
          `❌ Line OA: Unified search failed:`,
          vectorError,
        );
        // No fallback - rely solely on unified search service
      }

      if (documentContents.length > 0) {
        contextPrompt = `

=== เอกสารที่เกี่ยวข้องกับคำถาม ===
${documentContents.join("\n")}

=== คำสั่งสำคัญ ===
1. ใช้ข้อมูลจากเอกสารข้างต้นเป็นหลักในการตอบคำถาม
2. ห้ามบอกว่า "ไม่ทราบ" หรือ "ไม่มีข้อมูล" ถ้ามีข้อมูลในเอกสาร
3. ตอบคำถามให้ตรงประเด็นและครบถ้วนจากข้อมูลที่มี
4. ถ้าผู้ใช้ถามเกี่ยวกับร้าน ชั้น ตำแหน่ง ให้ตรวจสอบข้อมูลในเอกสารและตอบให้ชัดเจน
5. ระบุแหล่งที่มาของข้อมูลด้วย`;
        
        console.log(
          `✅ Built context with ${documentContents.length} chunks (${documentContents.join("").length} chars)`,
        );
        console.log(
          `📄 LINE OA: System prompt length: ${contextPrompt.length} characters`,
        );
        
        // Log chunks being used for transparency
        documentContents.forEach((chunk, index) => {
          console.log(`📄 LINE OA: Chunk ${index + 1} content: ${chunk.substring(0, 300)}...`);
        });
        
      } else {
        console.log(`⚠️ No documents found or no content available`);
      }
    }

    // Always extract image analysis from recent chat history to maintain context
    let imageContext = "";
    if (chatHistory.length > 0) {
      imageContext = extractImageAnalysis(chatHistory);
      console.log(
        `📸 Image context extracted: ${imageContext.length} characters`,
      );
      if (imageContext) {
        console.log(
          `✅ Image analysis found: ${imageContext.substring(0, 200)}...`,
        );

        // Debug: Show all system messages for analysis
        const systemMessages = chatHistory.filter(
          (msg) =>
            msg.messageType === "system" &&
            msg.metadata?.messageType === "image_analysis",
        );
        console.log(
          `🔍 Found ${systemMessages.length} image analysis messages in chat history`,
        );
        systemMessages.forEach((msg, index) => {
          console.log(
            `📋 Analysis ${index + 1}: ${msg.content.substring(0, 150)}... (ID: ${msg.metadata?.relatedImageMessageId})`,
          );
        });
      } else {
        console.log(`ℹ️ No recent image analysis found in chat history`);

        // Debug: Show what system messages we have
        const allSystemMessages = chatHistory.filter(
          (msg) => msg.messageType === "system",
        );
        console.log(
          `🔍 Total system messages in history: ${allSystemMessages.length}`,
        );
        allSystemMessages.forEach((msg, index) => {
          console.log(
            `📝 System ${index + 1}: ${msg.content.substring(0, 100)}... (metadata: ${JSON.stringify(msg.metadata)})`,
          );
        });
      }
    }

    // Get current date and time in Thai timezone
    const currentDateTime = new Date().toLocaleString('th-TH', { 
      timeZone: 'Asia/Bangkok',
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Build conversation messages including history - PUT DOCUMENT INSTRUCTIONS FIRST
    const systemPromptContent = `${contextPrompt}

=== เวลาปัจจุบัน ===
วันที่และเวลาขณะนี้: ${currentDateTime}

=== ⚠️ กฎสำคัญที่ต้องปฏิบัติตาม (OVERRIDE ALL OTHER INSTRUCTIONS) ===
• **บังคับ**: ใช้ข้อมูลจากเอกสารข้างต้นเป็นหลักในการตอบคำถาม
• **ห้ามแน่นอน**: ห้ามบอกว่า "ไม่ทราบ" หรือ "ยังไม่มี" หรือ "ไม่มีข้อมูล" ถ้ามีข้อมูลในเอกสาร
• **บังคับตอบ**: ถ้าพบข้อมูลในเอกสาร ต้องตอบจากเอกสารเท่านั้น
• **ถ้าถามเกี่ยวกับร้าน ชั้น ตำแหน่ง**: ตรวจสอบเอกสารและตอบให้ชัดเจน
• **ระบุแหล่งที่มา**: ระบุว่าข้อมูลมาจากเอกสารไหน

${agent.systemPrompt}

=== กฎการตอบคำถาม ===
• ตอบเป็นภาษาไทยเสมอ เว้นแต่ผู้ใช้จะสื่อสารเป็นภาษาอื่น
• ตอบอย่างเป็นมิตรและช่วยเหลือ ให้ข้อมูลที่ถูกต้องและเป็นประโยชน์
• สำหรับคำถามเกี่ยวกับรูปภาพ: ใช้ข้อมูลการวิเคราะห์รูปภาพที่มีในข้อความ ไม่ต้องบอกว่า "ไม่สามารถดูรูปภาพได้"
• อ้างอิงบทสนทนาก่อนหน้าเพื่อให้คำตอบที่ต่อเนื่องและเหมาะสม`;

    console.log(`🔍 LINE OA: Full system prompt length: ${systemPromptContent.length} characters`);
    console.log(`🔍 LINE OA: System prompt preview: ${systemPromptContent.substring(0, 300)}...`);
    
    const messages: any[] = [
      {
        role: "system",
        content: systemPromptContent,
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

    // Add current user message with image context attached if available
    let enhancedUserMessage = userMessage;
    if (imageContext) {
      enhancedUserMessage = `${userMessage}

${imageContext}`;
      console.log(
        `🖼️ Enhanced user message with image context (${imageContext.length} chars)`,
      );
    }

    messages.push({
      role: "user",
      content: enhancedUserMessage,
    });

    console.log(
      `🤖 Sending ${messages.length} messages to OpenAI (including ${chatHistory.length} history messages)`,
    );

    // Initialize guardrails service if configured
    let guardrailsService: GuardrailsService | null = null;
    if (agent.guardrailsConfig) {
      guardrailsService = new GuardrailsService(agent.guardrailsConfig);
      console.log(`🛡️ === GUARDRAILS SYSTEM ENABLED ===`);
      console.log(`🛡️ Agent ID: ${agentId}, Agent Name: ${agent.name}`);
      console.log(
        `🛡️ Guardrails Configuration:`,
        JSON.stringify(agent.guardrailsConfig, null, 2),
      );

      // Show which guardrails features are enabled/disabled
      const features = [];
      if (agent.guardrailsConfig.contentFiltering?.enabled) {
        const contentSettings = [];
        if (agent.guardrailsConfig.contentFiltering.blockProfanity)
          contentSettings.push("Profanity");
        if (agent.guardrailsConfig.contentFiltering.blockHateSpeech)
          contentSettings.push("Hate Speech");
        if (agent.guardrailsConfig.contentFiltering.blockSexualContent)
          contentSettings.push("Sexual Content");
        if (agent.guardrailsConfig.contentFiltering.blockViolence)
          contentSettings.push("Violence");
        features.push(`Content Filtering: ${contentSettings.join(", ")}`);
      }
      if (agent.guardrailsConfig.privacyProtection?.enabled) {
        const privacySettings = [];
        if (agent.guardrailsConfig.privacyProtection.blockPersonalInfo)
          privacySettings.push("Personal Info");
        if (agent.guardrailsConfig.privacyProtection.blockFinancialInfo)
          privacySettings.push("Financial Info");
        if (agent.guardrailsConfig.privacyProtection.blockHealthInfo)
          privacySettings.push("Health Info");
        if (agent.guardrailsConfig.privacyProtection.maskPhoneNumbers)
          privacySettings.push("Phone Masking");
        if (agent.guardrailsConfig.privacyProtection.maskEmails)
          privacySettings.push("Email Masking");
        features.push(`Privacy Protection: ${privacySettings.join(", ")}`);
      }
      if (agent.guardrailsConfig.toxicityPrevention?.enabled) {
        features.push(
          `Toxicity Prevention: Threshold ${agent.guardrailsConfig.toxicityPrevention.toxicityThreshold}`,
        );
      }
      if (agent.guardrailsConfig.responseQuality?.enabled) {
        features.push(
          `Response Quality: ${agent.guardrailsConfig.responseQuality.minResponseLength}-${agent.guardrailsConfig.responseQuality.maxResponseLength} chars`,
        );
      }
      if (agent.guardrailsConfig.topicControl?.enabled) {
        features.push(
          `Topic Control: ${agent.guardrailsConfig.topicControl.strictMode ? "Strict" : "Lenient"} mode`,
        );
      }
      if (agent.guardrailsConfig.businessContext?.enabled) {
        features.push(`Business Context: Professional tone required`);
      }

      console.log(`🛡️ Active Features: ${features.join(" | ")}`);
      console.log(`🛡️ === END GUARDRAILS INITIALIZATION ===`);
    } else {
      console.log(`🛡️ Guardrails: DISABLED (no configuration found)`);
    }

    // Validate user input with guardrails
    if (guardrailsService) {
      console.log(`🔍 === STARTING INPUT VALIDATION ===`);
      console.log(`📝 Original User Message: "${enhancedUserMessage}"`);

      const inputValidation = await guardrailsService.evaluateInput(
        enhancedUserMessage,
        {
          documents: documentContents,
          agent: agent,
        },
      );

      console.log(`📊 Input Validation Summary:`);
      console.log(`   ✓ Allowed: ${inputValidation.allowed}`);
      console.log(`   ✓ Confidence: ${inputValidation.confidence}`);
      console.log(
        `   ✓ Triggered Rules: ${inputValidation.triggeredRules.join(", ") || "None"}`,
      );
      console.log(
        `   ✓ Reason: ${inputValidation.reason || "No issues found"}`,
      );

      if (!inputValidation.allowed) {
        console.log(`🚫 === INPUT BLOCKED BY GUARDRAILS ===`);
        console.log(`🚫 Blocking Reason: ${inputValidation.reason}`);
        console.log(
          `🚫 Triggered Rules: ${inputValidation.triggeredRules.join(", ")}`,
        );
        const suggestions = inputValidation.suggestions?.join(" ") || "";
        const blockedMessage = `ขออภัย ไม่สามารถประมวลผลคำถามนี้ได้ ${inputValidation.reason ? `(${inputValidation.reason})` : ""} ${suggestions}`;
        console.log(`🚫 Returning blocked message: "${blockedMessage}"`);
        return blockedMessage;
      }

      // Use modified content if privacy protection applied masking
      if (inputValidation.modifiedContent) {
        console.log(`🔒 User input modified for privacy protection`);
        console.log(`🔒 Original: "${enhancedUserMessage}"`);
        console.log(`🔒 Modified: "${inputValidation.modifiedContent}"`);
        enhancedUserMessage = inputValidation.modifiedContent;
      }

      console.log(`✅ INPUT VALIDATION PASSED - Proceeding to OpenAI`);
    } else {
      console.log(`⏭️ Skipping input validation - Guardrails disabled`);
    }

    // Debug: Log the complete system prompt for verification
    console.log("\n=== 🔍 DEBUG: Complete System Prompt ===");
    console.log(messages[0].content);
    console.log("=== End System Prompt ===\n");

    // Debug: Log user message
    console.log(`📝 User Message: "${userMessage}"`);

    // Debug: Log total prompt length
    const totalTokens = messages.reduce(
      (sum, msg) => sum + msg.content.length,
      0,
    );
    console.log(`📊 Total prompt length: ${totalTokens} characters`);

    // Use generateChatResponse from openai.ts for consistent AI logic
    const { generateChatResponse } = await import("./services/openai");
    
    let aiResponse = await generateChatResponse(
      enhancedUserMessage,
      agentDocs,
      [], // relevantChunks - handled by unified search inside the function
      userBotMessages.map(msg => ({
        role: msg.messageType === "user" ? "user" as const : "assistant" as const,
        content: msg.content
      }))
    );

    // Validate AI output with guardrails
    if (guardrailsService) {
      console.log(`🔍 === STARTING OUTPUT VALIDATION ===`);
      console.log(`🤖 Original AI Response: "${aiResponse}"`);

      const outputValidation = await guardrailsService.evaluateOutput(
        aiResponse,
        {
          documents: documentContents,
          agent: agent,
          userQuery: userMessage,
        },
      );

      console.log(`📊 Output Validation Summary:`);
      console.log(`   ✓ Allowed: ${outputValidation.allowed}`);
      console.log(`   ✓ Confidence: ${outputValidation.confidence}`);
      console.log(
        `   ✓ Triggered Rules: ${outputValidation.triggeredRules.join(", ") || "None"}`,
      );
      console.log(
        `   ✓ Reason: ${outputValidation.reason || "No issues found"}`,
      );

      if (!outputValidation.allowed) {
        console.log(`🚫 === OUTPUT BLOCKED BY GUARDRAILS ===`);
        console.log(`🚫 Blocking Reason: ${outputValidation.reason}`);
        console.log(
          `🚫 Triggered Rules: ${outputValidation.triggeredRules.join(", ")}`,
        );
        const suggestions = outputValidation.suggestions?.join(" ") || "";
        const blockedMessage = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ ${outputValidation.reason ? `(${outputValidation.reason})` : ""} ${suggestions}`;
        console.log(`🚫 Original blocked response: "${aiResponse}"`);
        console.log(`🚫 Returning blocked message: "${blockedMessage}"`);
        aiResponse = blockedMessage;
      } else if (outputValidation.modifiedContent) {
        console.log(`🔒 AI output modified for compliance`);
        console.log(`🔒 Original: "${aiResponse}"`);
        console.log(`🔒 Modified: "${outputValidation.modifiedContent}"`);
        aiResponse = outputValidation.modifiedContent;
      }

      console.log(`✅ OUTPUT VALIDATION PASSED - Final response ready`);
      console.log(`📝 Final AI Response: "${aiResponse}"`);
    } else {
      console.log(`⏭️ Skipping output validation - Guardrails disabled`);
    }

    // NOTE: Chat history saving is now handled by the calling function to prevent duplicates
    console.log(
      `🤖 Generated AI response for user ${userId} (${aiResponse.length} characters)`,
    );

    return aiResponse;
  } catch (error) {
    console.error("💥 Error getting AI response:", error);
    return "ขออภัย เกิดข้อผิดพลาดในการประมวลผลคำถาม กรุณาลองใหม่อีกครั้ง";
  }
}

// Store processed message IDs to prevent duplicates with timestamp for cleanup
const processedMessageIds = new Map<string, number>();

// Clean up old processed message IDs (older than 1 hour)
const cleanupProcessedMessages = () => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [messageId, timestamp] of processedMessageIds.entries()) {
    if (timestamp < oneHourAgo) {
      processedMessageIds.delete(messageId);
    }
  }
};

// Schedule cleanup every 30 minutes
setInterval(cleanupProcessedMessages, 30 * 60 * 1000);

// Main webhook handler
export async function handleLineWebhook(req: Request, res: Response) {
  try {
    const signature = req.headers["x-line-signature"] as string;
    const webhookBody: LineWebhookBody = req.body;
    const body = JSON.stringify(webhookBody);

    console.log("🔔 Line webhook received");
    console.log("📝 Body:", body);

    let lineIntegration: any;

    // Check if integration is provided by dynamic webhook endpoint
    if ((req as any).lineIntegration) {
      lineIntegration = (req as any).lineIntegration;
      console.log(
        `✅ Using provided integration: ${lineIntegration.name} (ID: ${lineIntegration.id})`,
      );
    } else {
      // Legacy webhook handling - find integration by destination
      const destination = webhookBody.destination;
      console.log(
        "🔍 Debug: Looking for integration with destination:",
        destination,
      );

      // Get all Line OA integrations to find the matching one
      const allIntegrations = await storage.getAllSocialIntegrations();
      console.log(
        "✅ Found",
        allIntegrations.length,
        "total social integrations",
      );

      // In Line webhooks, the destination is the Bot's User ID, not Channel ID
      // First try to match by Bot User ID, then fall back to any active integration
      lineIntegration = allIntegrations.find(
        (integration) =>
          integration.type === "lineoa" &&
          integration.isActive &&
          integration.botUserId === destination,
      );

      // If no exact match found by Bot User ID, try fallback to any active Line OA integration
      if (!lineIntegration) {
        lineIntegration = allIntegrations.find(
          (integration) =>
            integration.type === "lineoa" && integration.isActive,
        );
        if (lineIntegration) {
          console.log(
            "🔧 Using fallback matching - found active Line OA integration",
          );
          // Update the Bot User ID for future webhook calls using raw SQL
          try {
            await db.execute(sql`
              UPDATE social_integrations 
              SET bot_user_id = ${destination}, updated_at = NOW() 
              WHERE id = ${lineIntegration.id}
            `);
            console.log("✅ Updated Bot User ID for future webhook calls");
          } catch (error) {
            console.log("⚠️ Could not update Bot User ID:", error);
          }
        }
      }

      if (!lineIntegration) {
        console.log(
          "❌ No active Line OA integration found for destination:",
          destination,
        );
        return res
          .status(404)
          .json({ error: "No active Line OA integration found" });
      }
    }

    console.log(
      "✅ Found matching Line OA integration for user:",
      lineIntegration.userId,
    );
    console.log(
      "🔑 Debug: Channel Access Token available:",
      !!lineIntegration.channelAccessToken,
    );
    console.log(
      "🔍 Debug: Integration object keys:",
      Object.keys(lineIntegration),
    );

    // Verify signature with debug logging
    console.log("🔐 Debug: Signature verification details:");
    console.log("📝 Raw body length:", body.length);
    console.log(
      "🔑 Channel Secret available:",
      !!lineIntegration.channelSecret,
    );
    console.log(
      "🔏 Channel Secret length:",
      lineIntegration.channelSecret?.length || 0,
    );
    console.log("📋 X-Line-Signature header:", signature);
    console.log("🔗 Integration ID:", lineIntegration.id);
    console.log("🏷️ Integration name:", lineIntegration.name);

    // Generate expected hash for comparison
    const expectedHash = crypto
      .createHmac("sha256", lineIntegration.channelSecret!)
      .update(body)
      .digest("base64");
    console.log("🎯 Expected hash:", expectedHash);
    console.log("📩 Received signature:", signature);
    console.log("✅ Hash match:", expectedHash === signature);

    if (!verifyLineSignature(body, signature, lineIntegration.channelSecret!)) {
      console.log("❌ Invalid Line signature");
      console.log("🔍 Debug: Possible issues:");
      console.log(
        "  - Channel Secret mismatch between Line Developer Console and database",
      );
      console.log("  - Webhook URL configured for wrong integration");
      console.log("  - Request body modified by middleware");
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Process each event
    for (const event of webhookBody.events) {
      if (event.type === "message" && event.message) {
        const message = event.message;
        const replyToken = event.replyToken!;
        let userMessage = "";
        let messageMetadata: any = {};

        console.log("📱 Message type:", message.type);
        console.log("👤 User ID:", event.source.userId);

        // Handle different message types
        if (message.type === "text") {
          userMessage = message.text!;
          console.log("💬 Text message:", userMessage);
        } else if (message.type === "image") {
          userMessage = "[รูปภาพ]";

          // For Line images, construct content URLs using messageId and Channel Access Token
          const originalContentUrl = `https://api-data.line.me/v2/bot/message/${message.id}/content`;
          const previewImageUrl = `https://api-data.line.me/v2/bot/message/${message.id}/content/preview`;

          messageMetadata = {
            messageType: "image",
            messageId: message.id,
            contentProvider: message.contentProvider,
            originalContentUrl,
            previewImageUrl,
          };
          console.log("🖼️ Image message received, ID:", message.id);
          console.log("🔗 Image URLs:", {
            originalContentUrl,
            previewImageUrl,
          });
        } else if (message.type === "sticker") {
          userMessage = "[สติ๊กเกอร์]";
          messageMetadata = {
            messageType: message.packageId,
            packageId: message.packageId,
            stickerId: message.stickerId,
          };
          console.log(
            "😀 Sticker message received, Package:",
            message.packageId,
            "Sticker:",
            message.stickerId,
          );
        } else {
          // Handle other message types (video, audio, location, etc.)
          userMessage = `[${message.type}]`;
          messageMetadata = {
            messageType: message.type,
            messageId: message.id,
          };
          console.log("📎 Other message type:", message.type);
        }

        // Check if this message has already been processed
        const messageId = message.id;
        if (processedMessageIds.has(messageId)) {
          console.log(`⚠️ Message ${messageId} already processed, skipping...`);
          continue;
        }

        // Mark message as processed with timestamp
        processedMessageIds.set(messageId, Date.now());
        console.log(`✅ Processing new message ${messageId}`);

        // Save user message with metadata
        let chatHistoryId: number | null = null;
        try {
          const savedChatHistory = await storage.createChatHistory({
            userId: lineIntegration.userId,
            channelType: "lineoa",
            channelId: event.source.userId,
            agentId: lineIntegration.agentId!,
            messageType: "user",
            content: userMessage,
            metadata: messageMetadata,
          });
          chatHistoryId = savedChatHistory.id;
          console.log(
            "💾 Saved user message with metadata, ID:",
            chatHistoryId,
          );
        } catch (error) {
          console.error("⚠️ Error saving user message:", error);
        }

        // Handle image messages with immediate acknowledgment
        if (message.type === "image" && lineIntegration.channelAccessToken) {
          console.log(
            "🖼️ Image message detected - sending immediate acknowledgment",
          );

          // 1. Send immediate acknowledgment
          await sendLineReply(
            replyToken,
            "ได้รับรูปภาพแล้ว ขอเวลาตรวจสอบสักครู่นะคะ",
            lineIntegration.channelAccessToken,
          );

          // 2. Process image and get analysis
          if (chatHistoryId && lineIntegration.agentId) {
            console.log("🖼️ Starting image processing...");
            const imageService = LineImageService.getInstance();

            try {
              // Wait for image processing to complete
              await imageService.processImageMessage(
                message.id,
                lineIntegration.channelAccessToken,
                lineIntegration.userId,
                "lineoa",
                event.source.userId,
                lineIntegration.agentId!,
                chatHistoryId,
              );
              console.log("✅ Image processing completed successfully");

              // Get the SPECIFIC image analysis for THIS message
              const updatedChatHistory = await storage.getChatHistory(
                lineIntegration.userId,
                "lineoa",
                event.source.userId,
                lineIntegration.agentId!,
                10, // Get more messages to find the right analysis
              );

              // Find the image analysis that corresponds to THIS specific message
              const imageAnalysisMessage = updatedChatHistory.find(
                (msg) =>
                  msg.messageType === "system" &&
                  msg.metadata?.messageType === "image_analysis" &&
                  msg.metadata?.relatedImageMessageId === message.id,
              );

              if (imageAnalysisMessage) {
                const imageAnalysisResult =
                  imageAnalysisMessage.content.replace(
                    "[การวิเคราะห์รูปภาพ] ",
                    "",
                  );
                console.log(
                  `🔍 Found specific image analysis for message ${message.id}: ${imageAnalysisResult.substring(0, 100)}...`,
                );

                // 3. Generate AI response with image analysis
                const contextMessage = `ผู้ใช้ส่งรูปภาพมา นี่คือผลการวิเคราะห์รูปภาพ:

${imageAnalysisResult}

กรุณาให้ข้อมูลเกี่ยวกับสิ่งที่เห็นในรูป พร้อมถามว่ามีอะไรให้ช่วยเหลือ`;

                const aiResponse = await getAiResponseDirectly(
                  contextMessage,
                  lineIntegration.agentId,
                  lineIntegration.userId,
                  "lineoa",
                  event.source.userId,
                );

                // 4. Send follow-up message with AI analysis
                await sendLinePushMessage(
                  event.source.userId,
                  aiResponse,
                  lineIntegration.channelAccessToken,
                );

                // Save the assistant response
                await storage.createChatHistory({
                  userId: lineIntegration.userId,
                  channelType: "lineoa",
                  channelId: event.source.userId,
                  agentId: lineIntegration.agentId,
                  messageType: "assistant",
                  content: aiResponse,
                  metadata: { relatedImageMessageId: message.id },
                });

                console.log("✅ Image analysis response sent successfully");
              } else {
                console.log(
                  "⚠️ No specific image analysis found for this message",
                );
                await sendLinePushMessage(
                  event.source.userId,
                  "ขออภัย ไม่สามารถวิเคราะห์รูปภาพได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
                  lineIntegration.channelAccessToken,
                );
              }
            } catch (error) {
              console.error("⚠️ Error processing image message:", error);
              await sendLinePushMessage(
                event.source.userId,
                "ขออภัย เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองใหม่อีกครั้ง",
                lineIntegration.channelAccessToken,
              );
            }
          }

          // Broadcast to WebSocket for real-time updates
          if (typeof (global as any).broadcastToAgentConsole === "function") {
            (global as any).broadcastToAgentConsole({
              type: "new_message",
              data: {
                userId: lineIntegration.userId,
                channelType: "lineoa",
                channelId: event.source.userId,
                agentId: lineIntegration.agentId,
                userMessage: userMessage,
                aiResponse: "ได้รับรูปภาพแล้ว ขอเวลาตรวจสอบสักครู่นะคะ",
                timestamp: new Date().toISOString(),
              },
            });
          }

          // Skip normal AI response processing for images
          continue;
        }

        // Get AI response with chat history (only for text messages or provide context for multimedia)
        if (lineIntegration.agentId) {
          let contextMessage = userMessage;

          if (message.type === "sticker") {
            contextMessage =
              "ผู้ใช้ส่งสติ๊กเกอร์มา กรุณาตอบอย่างเป็นมิตรและถามว่ามีอะไรให้ช่วย";
          }

        // Get agent's documents for proper scope restriction
        const agentDocs = await storage.getAgentChatbotDocuments(
          lineIntegration.agentId,
          lineIntegration.userId,
        );
        console.log(
          `LINE OA: Found ${agentDocs.length} assigned documents for agent ${lineIntegration.agentId}`,
        );

          // Use generateChatResponse from openai.ts for consistent behavior
        const { generateChatResponse } = await import("./services/openai");
        
        const aiResponse = await generateChatResponse(
          contextMessage,
          agentDocs,
          [], // relevantChunks - will be handled by unified search inside the function
          [], // chatHistory - will be fetched inside the function
          lineIntegration.agentId // Pass agent ID for proper query augmentation
        );
          
          console.log("🤖 AI response:", aiResponse);

          // Save only the assistant response (user message already saved above)
          try {
            await storage.createChatHistory({
              userId: lineIntegration.userId,
              channelType: "lineoa",
              channelId: event.source.userId,
              agentId: lineIntegration.agentId,
              messageType: "assistant",
              content: aiResponse,
              metadata: {},
            });
            console.log("💾 Saved AI response to chat history");

            // Broadcast new message to Agent Console via WebSocket
            if (typeof (global as any).broadcastToAgentConsole === "function") {
              (global as any).broadcastToAgentConsole({
                type: "new_message",
                data: {
                  userId: lineIntegration.userId,
                  channelType: "lineoa",
                  channelId: event.source.userId,
                  agentId: lineIntegration.agentId,
                  userMessage: contextMessage,
                  aiResponse,
                  timestamp: new Date().toISOString(),
                },
              });
              console.log("📡 Broadcasted new message to Agent Console");
            }
          } catch (error) {
            console.error("⚠️ Error saving AI response:", error);
          }

          // Send reply to Line using stored access token
          if (lineIntegration.channelAccessToken) {
            await sendLineReply(
              replyToken,
              aiResponse,
              lineIntegration.channelAccessToken,
            );
            console.log("✅ LINE OA: Reply sent successfully");
          } else {
            console.error("❌ LINE OA: No access token found for this integration");
          }
        } else if (event.type === "image") {
          // Image acknowledgment - immediate response
          const immediateAck = "ได้รับรูปภาพแล้ว ขอเวลาตรวจสอบสักครู่นะคะ";
          
          console.log("🖼️ LINE OA: Processing image upload");
          
          // Send immediate acknowledgment
          if (lineIntegration.channelAccessToken) {
            await sendLineReply(
              replyToken,
              immediateAck,
              lineIntegration.channelAccessToken,
            );
            console.log("📤 Sent immediate image acknowledgment");
          }

          // Save user image message to chat history
          await storage.createChatHistory({
            userId: lineIntegration.userId,
            channelType: "lineoa",
            channelId: event.source.userId,
            agentId: lineIntegration.agentId,
            messageType: "user",
            content: "ส่งรูปภาพ",
            metadata: {
              messageId: message.id,
              imageUrl: `https://api-data.line.me/v2/bot/message/${message.id}/content`,
              messageType: "image",
            },
          });

          // Save acknowledgment message to chat history
          await storage.createChatHistory({
            userId: lineIntegration.userId,
            channelType: "lineoa", 
            channelId: event.source.userId,
            agentId: lineIntegration.agentId,
            messageType: "assistant",
            content: immediateAck,
            metadata: {},
          });

          // Process image analysis
          try {
            const imageService = new LineImageService();
            const imageAnalysis = await imageService.processImage(
              message.id,
              lineIntegration.channelAccessToken!,
            );

            console.log("🔍 Image analysis completed:", imageAnalysis?.substring(0, 100));

            if (imageAnalysis) {
              // Save image analysis as system message for AI context
              await storage.createChatHistory({
                userId: lineIntegration.userId,
                channelType: "lineoa",
                channelId: event.source.userId,
                agentId: lineIntegration.agentId,
                messageType: "system",
                content: `Image Analysis: ${imageAnalysis}`,
                metadata: {
                  relatedImageMessageId: message.id,
                  analysisType: "gpt4o-vision",
                },
              });

              // Send follow-up message with analysis using getAiResponseDirectly
              const analysisResponse = await getAiResponseDirectly(
                `รูปภาพที่ผู้ใช้ส่งมาได้รับการวิเคราะห์แล้ว: ${imageAnalysis}`,
                lineIntegration.agentId,
                lineIntegration.userId,
                "lineoa",
                event.source.userId,
              );

              // Send analysis response to Line
              if (lineIntegration.channelAccessToken) {
                await sendLineReply(
                  null, // No reply token for push message
                  analysisResponse,
                  lineIntegration.channelAccessToken,
                  event.source.userId,
                );
                console.log("📤 Sent image analysis response");
              }

              // Save analysis response to chat history
              await storage.createChatHistory({
                userId: lineIntegration.userId,
                channelType: "lineoa",
                channelId: event.source.userId,
                agentId: lineIntegration.agentId,
                messageType: "assistant",
                content: analysisResponse,
                metadata: {
                  relatedImageMessageId: message.id,
                },
              });

              // Broadcast to Agent Console
              if (typeof (global as any).broadcastToAgentConsole === "function") {
                (global as any).broadcastToAgentConsole({
                  type: "new_message",
                  data: {
                    userId: lineIntegration.userId,
                    channelType: "lineoa",
                    channelId: event.source.userId,
                    agentId: lineIntegration.agentId,
                    userMessage: "ส่งรูปภาพ",
                    aiResponse: analysisResponse,
                    timestamp: new Date().toISOString(),
                  },
                });
              }
            }
          } catch (error) {
            console.error("❌ Image processing error:", error);
            const errorMessage = "ขออภัย เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพ กรุณาลองใหม่อีกครั้ง";
            
            if (lineIntegration.channelAccessToken) {
              await sendLineReply(
                null,
                errorMessage,
                lineIntegration.channelAccessToken,
                event.source.userId,
              );
            }
          }
        } else {
          console.log("🤖 No Line integration found, using fallback response");
          await sendLineReply(
            replyToken,
            "ขออภัย ระบบยังไม่ได้เชื่อมต่อกับ AI Agent กรุณาติดต่อผู้ดูแลระบบ",
            "fallback",
          );
        }
      }
    }

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("💥 Line webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}