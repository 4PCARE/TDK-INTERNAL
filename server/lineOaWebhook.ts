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

// Send push message to Line user (supports text and carousel templates)
export async function sendLinePushMessage(
  userId: string,
  messageOrTemplate: any,
  channelAccessToken: string,
  isCarousel: boolean = false,
) {
  try {
    let messagePayload: any;

    if (isCarousel && messageOrTemplate.template && messageOrTemplate.columns) {
      console.log(
        `🎠 Preparing carousel push message for template: ${messageOrTemplate.template.name}`,
      );

      // Build carousel message for push API
      const carouselColumns = messageOrTemplate.columns.map(
        (col: any, index: number) => {
          console.log(
            `🎠 Building push column ${index + 1}: ${col.column.title}`,
          );

          const actions = col.actions.map((action: any) => {
            const actionObj: any = {
              type: action.type,
              label: action.label,
            };

            if (action.type === "uri" && action.uri) {
              actionObj.uri = action.uri;
            } else if (action.type === "postback" && action.data) {
              actionObj.data = action.data;
            } else if (action.type === "message" && action.text) {
              actionObj.text = action.text;
            }

            return actionObj;
          });

          const columnObj: any = {
            title: col.column.title,
            text: col.column.text,
            actions: actions,
          };

          if (col.column.thumbnailImageUrl) {
            columnObj.thumbnailImageUrl = col.column.thumbnailImageUrl;
          }

          return columnObj;
        },
      );

      messagePayload = {
        to: userId,
        messages: [
          {
            type: "template",
            altText: `${messageOrTemplate.template.name} - Information carousel`,
            template: {
              type: "carousel",
              columns: carouselColumns,
            },
          },
        ],
      };

      console.log(
        `🎠 Carousel push message prepared with ${carouselColumns.length} columns`,
      );
    } else {
      // Regular text message
      messagePayload = {
        to: userId,
        messages: [
          {
            type: "text",
            text: messageOrTemplate,
          },
        ],
      };
    }

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify(messagePayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Line Push API Error:", errorText);
      return false;
    }

    if (isCarousel) {
      console.log(
        "✅ Line carousel push message sent successfully to:",
        userId,
      );
    } else {
      console.log("✅ Line text push message sent successfully to:", userId);
    }
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

// ===== CAROUSEL INTENT MATCHING SYSTEM =====

// Get Line templates associated with the integration
async function getIntegrationTemplates(
  integrationId: number,
  userId: string,
): Promise<any[]> {
  try {
    console.log(`🎠 === TEMPLATE RETRIEVAL START ===`);
    console.log(`🎠 Integration ID: ${integrationId}, User ID: ${userId}`);

    // First get all message templates for the user and integration
    const messageTemplates = await storage.getLineMessageTemplates(
      userId,
      integrationId,
    );
    console.log(
      `🎠 Found ${messageTemplates.length} message templates for integration ${integrationId}`,
    );

    // Get complete template data with columns and actions
    const completeTemplates = await Promise.all(
      messageTemplates.map(async (template: any) => {
        const completeTemplate = await storage.getCompleteLineTemplate(
          template.id,
          userId,
        );
        return completeTemplate;
      }),
    );

    // Filter out undefined results
    const validTemplates = completeTemplates.filter(
      (template: any) => template !== undefined,
    );

    validTemplates.forEach((template: any, index: number) => {
      console.log(`🎠 Template ${index + 1}:`);
      console.log(`   - ID: ${template.template.id}`);
      console.log(`   - Name: ${template.template.name}`);
      console.log(
        `   - Description: ${template.template.description || "No description"}`,
      );
      console.log(`   - Type: ${template.template.type}`);
      console.log(`   - Columns: ${template.columns.length}`);
    });

    console.log(`🎠 === TEMPLATE RETRIEVAL END ===`);
    return validTemplates;
  } catch (error) {
    console.error(
      `❌ Error fetching templates for integration ${integrationId}:`,
      error,
    );
    return [];
  }
}

// Extract intent tags from user query using predefined categories
function extractIntentFromQuery(userQuery: string): string[] {
  const query = userQuery.toLowerCase();
  const intents: string[] = [];

  // Beauty & Cosmetics intents
  const beautyKeywords = [
    "ครีม",
    "เซรั่ม",
    "โลชั่น",
    "ผิว",
    "หน้า",
    "ตา",
    "ริมฝีปาก",
    "แก้ม",
    "เครื่องสำอาง",
    "แป้ง",
    "ลิปสติก",
    "อายแชโดว์",
    "มาสคาร่า",
    "ริ้วรอย",
    "ใส",
    "ขาว",
    "เด็ก",
    "สวย",
    "งาม",
    "beauty",
    "cosmetics",
    "skincare",
  ];

  const antiAgingKeywords = [
    "ริ้วรอย",
    "แก่",
    "ชรา",
    "เหี่ยว",
    "ตีนกา",
    "หย่อนคล้อย",
    "กระชับ",
    "ย้อนวัย",
    "เด็กลง",
    "ร่องแก้ม",
    "หน้าหมอง",
    "anti-aging",
    "wrinkle",
  ];

  const hairKeywords = [
    "ผม",
    "หัว",
    "แชมพู",
    "ครีมนวด",
    "โรคผม",
    "หัวล้าน",
    "ผมร่วง",
    "ผมหงอก",
    "hair",
    "shampoo",
  ];

  const healthKeywords = [
    "สุขภาพ",
    "วิตามิน",
    "อาหารเสริม",
    "ยา",
    "รักษา",
    "โรค",
    "ป่วย",
    "health",
    "vitamin",
    "supplement",
  ];

  const fashionKeywords = [
    "เสื้อผ้า",
    "แฟชั่น",
    "กระเป๋า",
    "รองเท้า",
    "เครื่องประดับ",
    "นาฬิกา",
    "fashion",
    "clothes",
    "bag",
    "shoes",
  ];

  const electronicKeywords = [
    "มือถือ",
    "โทรศัพท์",
    "คอมพิวเตอร์",
    "แท็บเล็ต",
    "หูฟัง",
    "ลำโพง",
    "โน้ตบุ๊ก",
    "electronics",
    "phone",
    "computer",
    "notebook",
  ];

  const krapraoKeywords = [
    "กระเพราไก่",

  ];

  // Check each category
  if (beautyKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("beauty", "cosmetics");
  }

  if (antiAgingKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("anti-aging", "skincare");
  }

  if (hairKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("hair", "beauty");
  }

  if (healthKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("health", "wellness");
  }

  if (fashionKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("fashion", "clothing");
  }

  if (electronicKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("electronics", "gadgets", "notebook", "computer");
  }

  if (krapraoKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("กระเพราไก่");
  }

  // Remove duplicates
  return [...new Set(intents)];
}

// Calculate vector similarity between user query and template description
async function calculateIntentSimilarity(
  userQuery: string,
  templateDescription: string,
): Promise<number> {
  try {
    console.log(`🔍 === INTENT SIMILARITY CALCULATION START ===`);
    console.log(`🔍 User Query: "${userQuery}"`);
    console.log(`🔍 Template Description: "${templateDescription}"`);

    // Generate embeddings for both texts
    const [queryEmbedding, descriptionEmbedding] = await Promise.all([
      openai.embeddings.create({
        model: "text-embedding-3-small",
        input: userQuery,
      }),
      openai.embeddings.create({
        model: "text-embedding-3-small",
        input: templateDescription,
      }),
    ]);

    console.log(
      `🔍 Query embedding dimensions: ${queryEmbedding.data[0].embedding.length}`,
    );
    console.log(
      `🔍 Description embedding dimensions: ${descriptionEmbedding.data[0].embedding.length}`,
    );

    // Calculate cosine similarity
    const query_vec = queryEmbedding.data[0].embedding;
    const desc_vec = descriptionEmbedding.data[0].embedding;

    let dot_product = 0;
    let query_norm = 0;
    let desc_norm = 0;

    for (let i = 0; i < query_vec.length; i++) {
      dot_product += query_vec[i] * desc_vec[i];
      query_norm += query_vec[i] * query_vec[i];
      desc_norm += desc_vec[i] * desc_vec[i];
    }

    const similarity =
      dot_product / (Math.sqrt(query_norm) * Math.sqrt(desc_norm));

    console.log(`🔍 Cosine Similarity: ${similarity.toFixed(4)}`);
    console.log(`🔍 === INTENT SIMILARITY CALCULATION END ===`);

    return similarity;
  } catch (error) {
    console.error(`❌ Error calculating intent similarity:`, error);
    return 0;
  }
}

// Check if user query matches any template intents using tag comparison
async function checkCarouselIntents(
  userQuery: string,
  integrationId: number,
  userId: string,
): Promise<{ matched: boolean; template: any | null; similarity: number }> {
  try {
    console.log(`🎯 === CAROUSEL INTENT MATCHING START (TAG-BASED) ===`);
    console.log(`🎯 User Query: "${userQuery}"`);
    console.log(`🎯 Integration ID: ${integrationId}`);

    // Extract intent from user query
    const userIntents = extractIntentFromQuery(userQuery);
    console.log(`🎯 Extracted User Intents: [${userIntents.join(", ")}]`);

    if (userIntents.length === 0) {
      console.log(
        `🎯 No intents extracted from user query - skipping intent matching`,
      );
      return { matched: false, template: null, similarity: 0 };
    }

    const templates = await getIntegrationTemplates(integrationId, userId);

    if (templates.length === 0) {
      console.log(`🎯 No templates found - skipping intent matching`);
      return { matched: false, template: null, similarity: 0 };
    }

    console.log(
      `🎯 Testing ${templates.length} templates for tag match (any overlap = match)`,
    );

    for (const template of templates) {
      const templateTags = template?.template?.tags || [];

      console.log(
        `🎯 Testing template: "${template?.template?.name || "Unknown"}"`,
      );
      console.log(`🎯 Template Tags: [${templateTags.join(", ")}]`);

      if (templateTags.length === 0) {
        console.log(
          `🎯 Skipping template "${template?.template?.name || "Unknown"}" - no tags for intent matching`,
        );
        continue;
      }

      // Check for ANY tag overlap (simple match approach)
      const commonTags = userIntents.filter((intent) =>
        templateTags.some(
          (tag: string) =>
            tag.toLowerCase().includes(intent.toLowerCase()) ||
            intent.toLowerCase().includes(tag.toLowerCase()),
        ),
      );

      const hasMatch = commonTags.length > 0;

      console.log(`🎯 Intent Match Result (Tag-based):`);
      console.log(`   - Template: ${template.template.name}`);
      console.log(`   - User Intents: [${userIntents.join(", ")}]`);
      console.log(`   - Template Tags: [${templateTags.join(", ")}]`);
      console.log(`   - Common Tags: [${commonTags.join(", ")}]`);
      console.log(`   - Match: ${hasMatch ? "YES" : "NO"}`);

      if (hasMatch) {
        // Found a match - return immediately (first match wins)
        console.log(`🎯 === FINAL INTENT MATCHING RESULT (TAG-BASED) ===`);
        console.log(`🎯 Matched Template: ${template.template.name}`);
        console.log(`🎯 Common Tags: [${commonTags.join(", ")}]`);
        console.log(`🎯 === CAROUSEL INTENT MATCHING END (TAG-BASED) ===`);

        return {
          matched: true,
          template: template,
          similarity: 1.0, // Set to 1.0 since any match is considered valid
        };
      }
    }

    // No match found
    console.log(`🎯 === FINAL INTENT MATCHING RESULT (TAG-BASED) ===`);
    console.log(`🎯 No templates matched any user intents`);
    console.log(`🎯 === CAROUSEL INTENT MATCHING END (TAG-BASED) ===`);

    return {
      matched: false,
      template: null,
      similarity: 0,
    };
  } catch (error) {
    console.error(`❌ Error in carousel intent matching:`, error);
    return { matched: false, template: null, similarity: 0 };
  }
}

// Send carousel message to Line
async function sendLineCarousel(
  replyToken: string,
  template: any,
  channelAccessToken: string,
): Promise<boolean> {
  try {
    console.log(`🎠 === SENDING CAROUSEL MESSAGE START ===`);
    console.log(`🎠 Template: ${template.template.name}`);
    console.log(`🎠 Columns: ${template.columns.length}`);

    // Build carousel columns
    const carouselColumns = template.columns.map((col: any, index: number) => {
      console.log(`🎠 Building column ${index + 1}:`);
      console.log(`   - Title: ${col.column.title}`);
      console.log(`   - Text: ${col.column.text}`);
      console.log(`   - Thumbnail: ${col.column.thumbnailImageUrl || "None"}`);
      console.log(`   - Actions: ${col.actions.length}`);

      // Build actions for this column
      const actions = col.actions.map((action: any, actionIndex: number) => {
        console.log(`🎠 Action ${actionIndex + 1}:`);
        console.log(`     - Type: ${action.type}`);
        console.log(`     - Label: ${action.label}`);

        const actionObj: any = {
          type: action.type,
          label: action.label,
        };

        if (action.type === "uri" && action.uri) {
          actionObj.uri = action.uri;
          console.log(`     - URI: ${action.uri}`);
        } else if (action.type === "postback" && action.data) {
          actionObj.data = action.data;
          console.log(`     - Data: ${action.data}`);
        } else if (action.type === "message" && action.text) {
          actionObj.text = action.text;
          console.log(`     - Text: ${action.text}`);
        }

        return actionObj;
      });

      const columnObj: any = {
        title: col.column.title,
        text: col.column.text,
        actions: actions,
      };

      if (col.column.thumbnailImageUrl) {
        columnObj.thumbnailImageUrl = col.column.thumbnailImageUrl;
      }

      return columnObj;
    });

    const carouselMessage = {
      type: "template",
      altText: `${template.template.name} - Information carousel`,
      template: {
        type: "carousel",
        columns: carouselColumns,
      },
    };

    console.log(
      `🎠 Carousel message structure:`,
      JSON.stringify(carouselMessage, null, 2),
    );

    const response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [carouselMessage],
      }),
    });

    console.log(`🎠 Line API Response Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Line Carousel API Error:", errorText);
      console.log(`🎠 === SENDING CAROUSEL MESSAGE FAILED ===`);
      return false;
    }

    console.log("✅ Line carousel message sent successfully");
    console.log(`🎠 === SENDING CAROUSEL MESSAGE SUCCESS ===`);
    return true;
  } catch (error) {
    console.error("💥 Error sending Line carousel message:", error);
    console.log(`🎠 === SENDING CAROUSEL MESSAGE ERROR ===`);
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
  skipSearch: boolean = false,
): Promise<string> {
  try {
    console.log(`🔍 Debug: Getting agent ${agentId} for user ${userId}`);

    // Get agent configuration with retry logic
    let agentData;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        agentData = await storage.getAgentChatbot(agentId, userId);
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
      console.log(`❌ Agent ${agentId} not found for user ${userId}`);
      return "ขออภัย ไม่สามารถเชื่อมต่อกับระบบได้ในขณะนี้";
    }

    console.log(`✅ Found agent: ${agentData.name}`);

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

    if (!skipSearch) {
      const agentDocs = await storage.getAgentChatbotDocuments(agentId, userId);

      if (agentDocs.length > 0) {
        console.log(`📚 Found ${agentDocs.length} documents for agent`);
        agentDocIds = agentDocs.map((doc) => doc.documentId);
      } else {
        console.log(`⚠️ No documents found for agent`);
      }
    }

    // Step 1: AI Query Preprocessing
    console.log(
      `🧠 LINE OA: Starting AI query preprocessing for: "${userMessage}"`,
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

    console.log(`🧠 LINE OA: Search configuration enabled: ${!!agentData.searchConfiguration?.enableCustomSearch}`);
    console.log(`🧠 LINE OA: Additional search detail: "${additionalSearchDetail}"`);

    const queryAnalysis = await queryPreprocessor.analyzeQuery(
      userMessage,
      recentChatHistory,
      additionalContext,
      additionalSearchDetail  // Pass as separate parameter
    );

    console.log(`🧠 LINE OA: Query analysis result:`, {
      needsSearch: queryAnalysis.needsSearch,
      enhancedQuery: queryAnalysis.enhancedQuery,
      keywordWeight: queryAnalysis.keywordWeight.toFixed(2),
      vectorWeight: queryAnalysis.vectorWeight.toFixed(2),
      reasoning: queryAnalysis.reasoning,
    });

    let aiResponse = "";

    if (!queryAnalysis.needsSearch) {
      console.log(
        `⏭️ LINE OA: Query doesn't need search, using agent conversation without documents`,
      );

      // Build system prompt without document context
      const systemPrompt = `${agentData.systemPrompt}

สำคัญ: เมื่อผู้ใช้ถามเกี่ยวกับรูปภาพหรือภาพที่ส่งมา และมีข้อมูลการวิเคราะห์รูปภาพในข้อความของผู้ใช้ ให้ใช้ข้อมูลนั้นในการตอบคำถาม อย่าบอกว่า "ไม่สามารถดูรูปภาพได้" หากมีข้อมูลการวิเคราะห์รูปภาพให้แล้ว

ตอบเป็นภาษาไทยเสมอ เว้นแต่ผู้ใช้จะสื่อสารเป็นภาษาอื่น
ตอบอย่างเป็นมิตรและช่วยเหลือ

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
        `🤖 LINE OA: Sending ${messages.length} messages to OpenAI (no document search)`,
      );

      // Initialize guardrails service if configured
      let guardrailsService: GuardrailsService | null = null;
      if (agentData.guardrailsConfig) {
        guardrailsService = new GuardrailsService(agentData.guardrailsConfig);
        console.log(
          `🛡️ LINE OA: Guardrails enabled for conversation without documents`,
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
            `🚫 LINE OA: Input blocked by guardrails - ${inputValidation.reason}`,
          );
          const suggestions = inputValidation.suggestions?.join(" ") || "";
          aiResponse = `ขออภัย ไม่สามารถประมวลผลคำถามนี้ได้ ${inputValidation.reason ? `(${inputValidation.reason})` : ""} ${suggestions}`;

          // Send blocked response and save to chat history
          // Note: Chat history saving is handled in the calling function (handleLineWebhook)
          // since this function doesn't have access to the lineIntegration object

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
        completion.choices[0].message.content ||
        "ขออภัย ไม่สามารถประมวลผลคำถามได้ในขณะนี้";

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
            `🚫 LINE OA: Output blocked by guardrails - ${outputValidation.reason}`,
          );
          const suggestions = outputValidation.suggestions?.join(" ") || "";
          aiResponse = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ ${outputValidation.reason ? `(${outputValidation.reason})` : ""} ${suggestions}`;
        } else if (outputValidation.modifiedContent) {
          console.log(`🔒 LINE OA: AI output modified for compliance`);
          aiResponse = outputValidation.modifiedContent;
        }
      }

      console.log(
        `✅ LINE OA: Generated response without document search (${aiResponse.length} chars)`,
      );
    } else {
      console.log(
        `🔍 LINE OA: Query needs search, performing smart hybrid search with enhanced query`,
      );

      // Step 2: Perform new search workflow with agent's bound documents (smart hybrid)
      const { searchSmartHybridDebug } = await import(
        "./services/newSearch"
      );

      const searchResults = await searchSmartHybridDebug(
        queryAnalysis.enhancedQuery,
        userId,
        {
          limit: 3, // Much stricter - only top 3 chunks maximum
          threshold: 0.3,
          keywordWeight: queryAnalysis.keywordWeight,
          vectorWeight: queryAnalysis.vectorWeight,
          specificDocumentIds: agentDocIds, // Restrict search to agent's bound documents
          massSelectionPercentage: 0.3, // Use 30% mass selection for Line OA
        },
      );

      console.log(
        `🔍 LINE OA: Smart hybrid search found ${searchResults.length} relevant chunks from agent's bound documents`,
      );

      if (searchResults.length > 0) {
        // Step 3: Build document context from search results
        let documentContext = "";
        const maxContextLength = 12000; // Leave room for system prompt and user message
        let chunksUsed = 0;

        console.log(
          `📄 LINE OA: Building document context from search results:`,
        );
        for (let i = 0; i < searchResults.length; i++) {
          const result = searchResults[i];
          const chunkText = `=== ข้อมูลที่ ${i + 1}: ${result.name} ===\nคะแนนความเกี่ยวข้อง: ${result.similarity.toFixed(3)}\nเนื้อหา: ${result.content}\n\n`;

          console.log(
            `  ${i + 1}. ${result.name} - Similarity: ${result.similarity.toFixed(4)}`,
          );
          console.log(
            `      Content preview: ${result.content.substring(0, 100)}...`,
          );

          if (
            documentContext.length + chunkText.length <=
            maxContextLength
          ) {
            documentContext += chunkText;
            chunksUsed++;
          } else {
            const remainingSpace =
              maxContextLength - documentContext.length;
            if (remainingSpace > 300) {
              const availableContentSpace = remainingSpace - 150;
              const truncatedContent =
                result.content.substring(0, availableContentSpace) +
                "...";
              documentContext += `=== ข้อมูลที่ ${i + 1}: ${result.name} ===\nคะแนนความเกี่ยวข้อง: ${result.similarity.toFixed(3)}\nเนื้อหา: ${truncatedContent}\n\n`;
              chunksUsed++;
            }
            break;
          }
        }

        console.log(
          `📄 LINE OA: Used ${chunksUsed}/${searchResults.length} chunks (${documentContext.length} chars)`,
        );

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

        // Step 4: Build system prompt with document context
        const baseSystemPrompt = `${agentData.systemPrompt}

เอกสารอ้างอิงสำหรับการตอบคำถาม (เรียงตามความเกี่ยวข้อง):
${documentContext}

สำคัญ: เมื่อผู้ใช้ถามเกี่ยวกับรูปภาพหรือภาพที่ส่งมา และมีข้อมูลการวิเคราะห์รูปภาพในข้อความของผู้ใช้ ให้ใช้ข้อมูลนั้นในการตอบคำถาม อย่าบอกว่า "ไม่สามารถดูรูปภาพได้" หากมีข้อมูลการวิเคราะห์รูปภาพให้แล้ว

กรุณาใช้ข้อมูลจากเอกสารข้างต้นเป็นหลักในการตอบคำถาม และตอบเป็นภาษาไทยเสมอ เว้นแต่ผู้ใช้จะสื่อสารเป็นภาษาอื่น
ตอบอย่างเป็นมิตรและช่วยเหลือ ให้ข้อมูลที่ถูกต้องและเป็นประโยชน์
คุณสามารถอ้างอิงบทสนทนาก่อนหน้านี้เพื่อให้คำตอบที่ต่อเนื่องและเหมาะสม

วันที่วันนี้: ${thaiDate}
ตอนนี้เวลา: ${thaiTime}`;

        // Step 5: Build conversation messages including chat history
        const messages: any[] = [
          {
            role: "system",
            content: baseSystemPrompt,
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

        // Step 6: Truncate to 15k characters
        let totalLength = messages.reduce(
          (sum, msg) => sum + msg.content.length,
          0,
        );
        console.log(
          `📊 LINE OA: Total prompt length before truncation: ${totalLength} characters`,
        );

        if (totalLength > 20000) {
          console.log(
            `✂️ LINE OA: Truncating prompt from ${totalLength} to 20,000 characters`,
          );

          // Keep system message intact, truncate from conversation history
          const systemMessageLength = messages[0].content.length;
          const currentUserMessageLength =
            messages[messages.length - 1].content.length;
          const availableForHistory =
            15000 -
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
              `✅ LINE OA: Truncated prompt to ${newTotalLength} characters (${messages.length - 2} history messages kept)`,
            );
          } else {
            // If even system + user message exceeds 15k, truncate system message
            console.log(
              `⚠️ LINE OA: System + user message too long, truncating system message`,
            );
            const maxSystemLength =
              15000 - currentUserMessageLength - 100;
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
          `🤖 LINE OA: Sending ${messages.length} messages to OpenAI (final length: ${finalLength} chars)`,
        );

        // Initialize guardrails service if configured
        let guardrailsService: GuardrailsService | null = null;
        if (agentData.guardrailsConfig) {
          guardrailsService = new GuardrailsService(agentData.guardrailsConfig);
          console.log(
            `🛡️ LINE OA: Guardrails enabled for agent ${agentData.name}`,
          );
        }

        // Step 6: Apply guardrails if configured
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
              `🚫 LINE OA: Input blocked by guardrails - ${inputValidation.reason}`,
            );
            const suggestions = inputValidation.suggestions?.join(" ") || "";
            aiResponse = `ขออภัย ไม่สามารถประมวลผลคำถามนี้ได้ ${inputValidation.reason ? `(${inputValidation.reason})` : ""} ${suggestions}`;

            // Send blocked response and save to chat history
            // Note: Chat history saving is handled in the calling function (handleLineWebhook)
            // since this function doesn't have access to the lineIntegration object

            return aiResponse; // Exit function early
          }

          // Use modified content if privacy protection applied
          if (inputValidation.modifiedContent) {
            messages[messages.length - 1].content = inputValidation.modifiedContent;
          }
        }

        // Step 7: Generate AI response
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: messages,
          max_tokens: 1000,
          temperature: 0.7,
        });

        aiResponse =
          completion.choices[0].message.content ||
          "ขออภัย ไม่สามารถประมวลผลคำถามได้ในขณะนี้";

        // Step 8: Validate AI output with guardrails
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
              `🚫 LINE OA: Output blocked by guardrails - ${outputValidation.reason}`,
            );
            const suggestions = outputValidation.suggestions?.join(" ") || "";
            aiResponse = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ ${outputValidation.reason ? `(${outputValidation.reason})` : ""} ${suggestions}`;
          } else if (outputValidation.modifiedContent) {
            console.log(
              `🔒 LINE OA: AI output modified for compliance`,
            );
            aiResponse = outputValidation.modifiedContent;
          }
        }

        console.log(
          `✅ LINE OA: Generated response using new search workflow (${aiResponse.length} chars)`,
        );
      } else {
        console.log(
          `⚠️ LINE OA: No relevant content found in agent's bound documents, falling back to agent conversation without documents`,
        );

        // Fallback to agent conversation without documents
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

        const fallbackSystemPrompt = `${agentData.systemPrompt}

📅 วันที่และเวลาปัจจุบัน: ${thaiDate} เวลา ${thaiTime} น.

ตอบเป็นภาษาไทยเสมอ เว้นแต่ผู้ใช้จะสื่อสารเป็นภาษาอื่น
ตอบอย่างเป็นมิตรและช่วยเหลือ

⚠️ สำคัญมาก: ไม่มีเอกสารที่เกี่ยวข้องในฐานข้อมูลสำหรับคำถามนี้
- ห้ามให้ข้อมูลเฉพาะเจาะจง เช่น ที่อยู่ เบอร์โทร ราคา ชั้น หรือรายละเอียดใดๆ ที่ต้องอาศัยข้อมูลจากเอกสาร  
- ให้ตอบเพียงว่าไม่สามารถให้ข้อมูลเฉพาะเจาะจงได้เนื่องจากไม่พบเอกสารที่เกี่ยวข้อง
- แนะนำให้ติดต่อแหล่งข้อมูลที่เชื่อถือได้แทน`;

        const fallbackMessages: any[] = [
          {
            role: "system",
            content: fallbackSystemPrompt,
          },
        ];

        // Add recent chat history for context
        const userBotMessages = chatHistory
          .filter(
            (msg) =>
              msg.messageType === "user" || msg.messageType === "assistant",
          )
          .slice(-5); // Only last 5 messages for fallback

        userBotMessages.forEach((msg) => {
          fallbackMessages.push({
            role: msg.messageType === "user" ? "user" : "assistant",
            content: msg.content,
          });
        });

        // Add current user message
        fallbackMessages.push({
          role: "user",
          content: userMessage,
        });

        // Initialize guardrails service if configured
        let fallbackGuardrailsService: GuardrailsService | null = null;
        if (agentData.guardrailsConfig) {
          fallbackGuardrailsService = new GuardrailsService(
            agentData.guardrailsConfig,
          );
          console.log(
            `🛡️ LINE OA: Guardrails enabled for fallback mode`,
          );
        }

        // Apply guardrails if configured
        if (fallbackGuardrailsService) {
          const inputValidation = await fallbackGuardrailsService.evaluateInput(
            userMessage,
            {
              documents: [],
              agent: agentData,
            },
          );

          if (!inputValidation.allowed) {
            console.log(
              `🚫 LINE OA: Input blocked by guardrails (fallback) - ${inputValidation.reason}`,
            );
            const suggestions = inputValidation.suggestions?.join(" ") || "";
            aiResponse = `ขออภัย ไม่สามารถประมวลผลคำถามนี้ได้ ${inputValidation.reason ? `(${inputValidation.reason})` : ""} ${suggestions}`;

            // Save blocked response and continue to reply
            // Note: Chat history saving is handled in the calling function (handleLineWebhook)
            // since this function doesn't have access to the lineIntegration object
          } else {
            // Use modified content if privacy protection applied
            if (inputValidation.modifiedContent) {
              fallbackMessages[fallbackMessages.length - 1].content =
                inputValidation.modifiedContent;
            }

            try {
              const fallbackCompletion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: fallbackMessages,
                max_tokens: 1000,
                temperature: 0.7,
              });

              aiResponse =
                fallbackCompletion.choices[0].message.content ||
                "ขออภัย เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง";

              // Validate AI output with guardrails
              const outputValidation = await fallbackGuardrailsService.evaluateOutput(
                aiResponse,
                {
                  documents: [],
                  agent: agentData,
                  userQuery: userMessage,
                },
              );

              if (!outputValidation.allowed) {
                console.log(
                  `🚫 LINE OA: Output blocked by guardrails (fallback) - ${outputValidation.reason}`,
                );
                const suggestions = outputValidation.suggestions?.join(" ") || "";
                aiResponse = `ขออภัย ไม่สามารถให้คำตอบนี้ได้ ${outputValidation.reason ? `(${outputValidation.reason})` : ""} ${suggestions}`;
              } else if (outputValidation.modifiedContent) {
                console.log(
                  `🔒 LINE OA: AI output modified for compliance (fallback)`,
                );
                aiResponse = outputValidation.modifiedContent;
              }

              console.log(
                `✅ LINE OA: Fallback response generated with guardrails (${aiResponse.length} chars)`,
              );
            } catch (fallbackError) {
              console.error(
                "💥 LINE OA: Fallback generation failed:",
                fallbackError,
              );
              aiResponse = "ขออภัย เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง";
            }
          }
        } else {
          // No guardrails - generate response directly
          try {
            const fallbackCompletion = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: fallbackMessages,
              max_tokens: 1000,
              temperature: 0.7,
            });

            aiResponse =
              fallbackCompletion.choices[0].message.content ||
              "ขออภัย เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง";
            console.log(
              `✅ LINE OA: Fallback response generated successfully (${aiResponse.length} chars)`,
            );
          } catch (fallbackError) {
            console.error(
              "💥 LINE OA: Fallback generation failed:",
              fallbackError,
            );
            aiResponse = "ขออภัย เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง";
          }
        }
      } // End of fallback logic
    } // End of search vs no-search logic

    console.log("🤖 AI response:", aiResponse);

    // Note: Chat history saving is handled in the calling function (handleLineWebhook)
    // since this function doesn't have access to the lineIntegration object

    // Note: Line reply and carousel handling is done in the calling function (handleLineWebhook)
    // since this function doesn't have access to the lineIntegration object

    return aiResponse; // Return the AI response for potential further processing
  } catch (error: any) {
    console.error("💥 Error getting AI response:", error);

    // Check if it's a database connection error
    if (error.code === '57P01' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
      console.log("🔄 Database connection issue detected, sending retry message");
      return "ขออภัย ระบบกำลังปรับปรุง กรุณาลองใหม่อีกครั้งใน 1-2 นาที 🔄";
    }

    return "ขออภัย เกิดข้อผิดพลาดในการประมวลผลคำถาม กรุณาลองใหม่อีกครั้ง";
  }
}

// Store processed message IDs to prevent duplicates with timestamp for cleanup
const processedMessageIds = new Map<string, number>();

// Clean up old processed message IDs (older than 1 hour)
const cleanupProcessedMessages = () => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  Array.from(processedMessageIds.entries()).forEach(
    ([messageId, timestamp]) => {
      if (timestamp < oneHourAgo) {
        processedMessageIds.delete(messageId);
      }
    },
  );
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

        // Handle image messages with immediate acknowledgment and processing
        if (message.type === "image" && lineIntegration.channelAccessToken) {
          console.log(
            "🖼️ Image message detected - sending immediate acknowledgment and starting processing",
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
                  msg.metadata &&
                  (msg.metadata as any).messageType === "image_analysis" &&
                  (msg.metadata as any).relatedImageMessageId === message.id,
              );

              let aiResponse = "";
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

                aiResponse = await getAiResponseDirectly(
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
                aiResponse = "ขออภัย ไม่สามารถวิเคราะห์รูปภาพได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";
                await sendLinePushMessage(
                  event.source.userId,
                  aiResponse,
                  lineIntegration.channelAccessToken,
                );
              }
            } catch (error) {
              console.error("⚠️ Error processing image message:", error);
              aiResponse = "ขออภัย เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองใหม่อีกครั้ง";
              await sendLinePushMessage(
                event.source.userId,
                aiResponse,
                lineIntegration.channelAccessToken,
              );
            }
          }

          // Broadcast to Agent Console for image messages
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

        // Get AI response using the getAiResponseDirectly function
        let contextMessage = userMessage;
        if (message.type === "sticker") {
          contextMessage =
            "ผู้ใช้ส่งสติ๊กเกอร์มา กรุณาตอบอย่างเป็นมิตรและถามว่ามีอะไรให้ช่วย";
        }

        // Call getAiResponseDirectly to handle the main logic
        const aiResponse = await getAiResponseDirectly(
          contextMessage,
          lineIntegration.agentId,
          lineIntegration.userId,
          "lineoa",
          event.source.userId,
        );

        // Save only the assistant response (user message already saved above)
        try {
          await storage.createChatHistory({
            userId: lineIntegration.userId,
            channelType: "lineoa",
            channelId: event.source.userId,
            agentId: lineIntegration.agentId,
            messageType: "assistant",
            content: aiResponse,
            metadata: queryAnalysis.needsSearch ? { documentSearch: true, searchReasoning: queryAnalysis.reasoning, enhancedQuery: queryAnalysis.enhancedQuery } : { documentSearch: false },
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
                userMessage: userMessage,
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

          console.log(`🎯 LINE OA: Checking carousel intent for response...`);

          // Check if user query matches any carousel templates
          const carouselIntent = await checkCarouselIntents(
            userMessage,
            lineIntegration.id,
            lineIntegration.userId,
          );

          if (carouselIntent.matched && carouselIntent.template) {
            console.log(
              `🎠 LINE OA: Intent matched! Sending carousel template: ${carouselIntent.template.template.name}`,
            );

            // Send carousel as a push message (since we already used the replyToken)
            const carouselSent = await sendLinePushMessage(
              event.source.userId,
              carouselIntent.template,
              lineIntegration.channelAccessToken,
              true, // This is a carousel template
            );

            if (carouselSent) {
              console.log(`✅ LINE OA: Carousel template sent successfully`);

              // Save carousel message to chat history
              await storage.createChatHistory({
                userId: lineIntegration.userId,
                channelType: "lineoa",
                channelId: event.source.userId,
                agentId: lineIntegration.agentId,
                messageType: "assistant",
                content: `[Carousel Template: ${carouselIntent.template.template.name}]`,
                metadata: {
                  templateId: carouselIntent.template.template.id,
                  templateName: carouselIntent.template.template.name,
                  intentSimilarity: carouselIntent.similarity,
                  messageType: "carousel",
                },
              });

              // Broadcast carousel message to Agent Console via WebSocket
              if (
                typeof (global as any).broadcastToAgentConsole === "function"
              ) {
                (global as any).broadcastToAgentConsole({
                  type: "new_message",
                  data: {
                    userId: lineIntegration.userId,
                    channelType: "lineoa",
                    channelId: event.source.userId,
                    agentId: lineIntegration.agentId,
                    userMessage: `[Carousel: ${carouselIntent.template.template.name}]`,
                    aiResponse: `Carousel template sent with ${carouselIntent.template.columns.length} columns`,
                    timestamp: new Date().toISOString(),
                  },
                });
                console.log(
                  "📡 Broadcasted carousel message to Agent Console",
                );
              }
            } else {
              console.log(`❌ LINE OA: Failed to send carousel template`);
            }
          } else {
            console.log(
              `🎯 LINE OA: No carousel intent match found (best similarity: ${carouselIntent.similarity.toFixed(4)})`,
            );
          }
        } else {
          console.log(
            "❌ No channel access token available for Line integration",
          );
          await sendLineReply(
            replyToken,
            "ขออภัย ระบบยังไม่ได้ตั้งค่า access token กรุณาติดต่อผู้ดูแลระบบ",
            lineIntegration.channelSecret!,
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