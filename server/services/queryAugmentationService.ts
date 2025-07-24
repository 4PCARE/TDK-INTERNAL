import OpenAI from "openai";
import { storage } from "../storage";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface QueryAugmentationResult {
  originalQuery: string;
  augmentedQuery: string;
  extractedKeywords: string[];
  contextualInsights: string;
  confidence: number;
  shouldUseAugmented: boolean;
}

export class QueryAugmentationService {
  /**
   * Augment user query by analyzing chat history and reading between the lines
   * @param userQuery The original user query
   * @param userId User ID for chat history retrieval
   * @param chatType Type of chat (general, document, agent)
   * @param contextId Context ID (document ID, agent ID, etc.)
   * @param memoryLimit Number of recent messages to analyze
   */
  async augmentQuery(
    userQuery: string,
    userId: string,
    chatType: string = "general",
    contextId: string = "general",
    memoryLimit: number = 10
  ): Promise<QueryAugmentationResult> {
    try {
      console.log(`🔍 Query Augmentation: Starting for "${userQuery}"`);

      // Get recent chat history for context
      const chatHistory = await storage.getChatHistory(
        userId,
        chatType,
        contextId,
        null, // No specific agent filter
        memoryLimit
      );

      if (chatHistory.length === 0) {
        console.log(`ℹ️ Query Augmentation: No chat history available, using original query`);
        return {
          originalQuery: userQuery,
          augmentedQuery: userQuery,
          extractedKeywords: [],
          contextualInsights: "No previous conversation context available",
          confidence: 0.5,
          shouldUseAugmented: false
        };
      }

      // Build conversation context
      const conversationContext = this.buildConversationContext(chatHistory);
      
      // Use OpenAI to augment the query
      const augmentationResult = await this.performOpenAIAugmentation(
        userQuery,
        conversationContext
      );

      console.log(`✅ Query Augmentation: Completed with confidence ${augmentationResult.confidence}`);
      console.log(`   📝 Original: "${userQuery}"`);
      console.log(`   🎯 Augmented: "${augmentationResult.augmentedQuery}"`);
      console.log(`   🔑 Keywords: [${augmentationResult.extractedKeywords.join(', ')}]`);

      return augmentationResult;

    } catch (error) {
      console.error("❌ Query Augmentation: Failed", error);
      return {
        originalQuery: userQuery,
        augmentedQuery: userQuery,
        extractedKeywords: [],
        contextualInsights: "Query augmentation failed, using original query",
        confidence: 0.0,
        shouldUseAugmented: false
      };
    }
  }

  /**
   * Build conversation context from chat history
   */
  private buildConversationContext(chatHistory: any[]): string {
    const recentMessages = chatHistory
      .slice(-8) // Last 8 messages for context
      .map(msg => {
        const role = msg.message_type === 'user' ? 'User' : 'Assistant';
        const timestamp = new Date(msg.created_at).toLocaleString('th-TH');
        return `[${timestamp}] ${role}: ${msg.message}`;
      })
      .join('\n');

    return recentMessages;
  }

  /**
   * Use OpenAI to analyze conversation and augment the query
   */
  private async performOpenAIAugmentation(
    userQuery: string,
    conversationContext: string
  ): Promise<QueryAugmentationResult> {
    const systemPrompt = `You are an expert query augmentation assistant. Your task is to analyze a user's current query along with their conversation history to create an enhanced search query that captures both explicit and implicit intent.

ANALYSIS GOALS:
1. Understand what the user is really looking for (read between the lines)
2. Identify implicit context from conversation history
3. Extract key search terms that will improve search results
4. Maintain the user's original intent while expanding context

CONVERSATION CONTEXT:
${conversationContext}

CURRENT USER QUERY: "${userQuery}"

Please analyze the conversation and provide a JSON response with the following structure:
{
  "augmentedQuery": "Enhanced query that incorporates context and implicit meaning",
  "extractedKeywords": ["keyword1", "keyword2", "keyword3"],
  "contextualInsights": "Brief explanation of what insights were gathered from the conversation",
  "confidence": 0.85,
  "reasoning": "Explanation of why this augmentation was chosen"
}

GUIDELINES:
- If the query is very specific and complete, confidence should be lower (0.3-0.6)
- If conversation context adds valuable implicit meaning, confidence should be higher (0.7-0.9)
- Extract 3-8 relevant keywords that would improve search results
- Keep augmented query natural and searchable
- Focus on Thai language context if conversation is in Thai
- Consider location, product, service, or information type context from history

Respond only with valid JSON.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const responseContent = response.choices[0].message.content || "{}";
      const result = this.extractJsonFromResponse(responseContent);

      return {
        originalQuery: userQuery,
        augmentedQuery: result.augmentedQuery || userQuery,
        extractedKeywords: result.extractedKeywords || [],
        contextualInsights: result.contextualInsights || "No specific insights available",
        confidence: result.confidence || 0.5,
        shouldUseAugmented: (result.confidence || 0.5) >= 0.6
      };

    } catch (error) {
      console.error("❌ OpenAI Augmentation failed:", error);
      throw error;
    }
  }

  /**
   * Extract JSON from OpenAI response, handling markdown code blocks
   */
  private extractJsonFromResponse(response: string): any {
    try {
      // Remove markdown code blocks if present
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      // Try to find JSON object in the response
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: try parsing the entire cleaned response
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse JSON from augmentation response:', error);
      return {};
    }
  }
}

// Export singleton instance
export const queryAugmentationService = new QueryAugmentationService();