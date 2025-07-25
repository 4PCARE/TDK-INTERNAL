
import OpenAI from "openai";

interface KeywordExpansionResult {
  isRelatedToHistory: boolean;
  expandedKeywords: string[];
  confidence: number;
  reasoning: string;
  originalQuery: string;
}

interface ChatHistoryItem {
  messageType: string;
  content: string;
  createdAt: Date;
}

export class AIKeywordExpansionService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async expandKeywords(
    currentQuery: string,
    chatHistory: ChatHistoryItem[] = [],
    maxHistoryItems: number = 5
  ): Promise<KeywordExpansionResult> {
    try {
      // Filter recent chat history (exclude system messages)
      const recentHistory = chatHistory
        .filter(msg => msg.messageType === 'user' || msg.messageType === 'assistant')
        .slice(-maxHistoryItems)
        .map(msg => `${msg.messageType}: ${msg.content}`)
        .join('\n');

      const prompt = this.buildExpansionPrompt(currentQuery, recentHistory);

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an AI assistant specialized in keyword expansion for document search. Your task is to:
1. Analyze if the current query is related to previous conversation
2. Generate relevant keywords that would help find related documents
3. Consider synonyms, related terms, and context-specific vocabulary

Always respond in valid JSON format with the required fields.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const response = completion.choices[0].message.content;
      if (!response) {
        throw new Error("No response from OpenAI");
      }

      const result = JSON.parse(response) as KeywordExpansionResult;
      
      // Ensure we have the original query
      result.originalQuery = currentQuery;
      
      // Validate and sanitize the result
      return this.validateAndSanitizeResult(result, currentQuery);

    } catch (error) {
      console.error("Error in AI keyword expansion:", error);
      
      // Fallback: return basic keyword extraction
      return this.getFallbackExpansion(currentQuery);
    }
  }

  private buildExpansionPrompt(currentQuery: string, recentHistory: string): string {
    const hasHistory = recentHistory.trim().length > 0;

    return `Analyze the current user query and determine if it's related to the conversation history, then expand keywords for better document search.

Current Query: "${currentQuery}"

${hasHistory ? `Recent Conversation History:\n${recentHistory}` : 'No recent conversation history available.'}

Please provide a JSON response with the following structure:
{
  "isRelatedToHistory": boolean,
  "expandedKeywords": ["keyword1", "keyword2", "keyword3"],
  "confidence": 0.0-1.0,
  "reasoning": "explanation of your analysis",
  "originalQuery": "${currentQuery}"
}

Guidelines for keyword expansion:
1. If the query is related to history, include context from previous messages
2. Add synonyms and related terms that might appear in documents
3. Consider different languages (Thai/English) and transliterations
4. Include both specific and general terms
5. Limit to 5-8 most relevant keywords
6. Focus on terms that would help find relevant documents

For Thai queries, consider:
- Alternative spellings and transliterations
- English equivalents of Thai terms
- Category-related keywords
- Location-specific terms if mentioned

Examples:
- "โอโตยะ" → ["โอโตยะ", "OOTOYA", "อาหารญี่ปุ่น", "ร้านอาหาร", "Japanese food"]
- "ชั้นไหน" → ["ชั้น", "floor", "location", "ที่ตั้ง", "อยู่"]`;
  }

  private validateAndSanitizeResult(result: KeywordExpansionResult, originalQuery: string): KeywordExpansionResult {
    // Ensure required fields exist
    if (!result.isRelatedToHistory) result.isRelatedToHistory = false;
    if (!result.expandedKeywords) result.expandedKeywords = [];
    if (!result.confidence) result.confidence = 0.5;
    if (!result.reasoning) result.reasoning = "Analysis completed";
    
    // Sanitize keywords
    result.expandedKeywords = result.expandedKeywords
      .filter(keyword => keyword && typeof keyword === 'string')
      .map(keyword => keyword.trim())
      .filter(keyword => keyword.length > 0)
      .slice(0, 8); // Limit to 8 keywords max

    // Ensure confidence is within bounds
    result.confidence = Math.max(0, Math.min(1, result.confidence));

    // Add original query terms if not already included
    const queryTerms = this.extractBasicKeywords(originalQuery);
    const allKeywords = [...new Set([...result.expandedKeywords, ...queryTerms])];
    result.expandedKeywords = allKeywords.slice(0, 8);

    return result;
  }

  private getFallbackExpansion(query: string): KeywordExpansionResult {
    const basicKeywords = this.extractBasicKeywords(query);
    
    return {
      isRelatedToHistory: false,
      expandedKeywords: basicKeywords,
      confidence: 0.3,
      reasoning: "Fallback expansion using basic keyword extraction",
      originalQuery: query
    };
  }

  private extractBasicKeywords(query: string): string[] {
    // Basic keyword extraction as fallback
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'ที่', 'และ', 'หรือ', 'แต่', 'ใน', 'บน', 'เพื่อ', 'ของ', 'กับ', 'โดย', 'ได้', 
      'เป็น', 'มี', 'จาก', 'ไป', 'มา', 'ก็', 'จะ', 'ถึง', 'ให้', 'ยัง', 'คือ', 'ว่า'
    ]);

    return query
      .toLowerCase()
      .split(/[\s\-_,\.!?\(\)\[\]]+/)
      .filter(term => term.length > 1 && !stopWords.has(term))
      .map(term => term.trim())
      .filter(term => term.length > 0)
      .slice(0, 5);
  }

  // Method to get keyword expansion for use in existing search services
  async getExpandedSearchTerms(
    query: string, 
    chatHistory: ChatHistoryItem[] = []
  ): Promise<{
    original: string[];
    expanded: string[];
    isContextual: boolean;
    confidence: number;
  }> {
    const expansion = await this.expandKeywords(query, chatHistory);
    const originalTerms = this.extractBasicKeywords(query);

    return {
      original: originalTerms,
      expanded: expansion.expandedKeywords,
      isContextual: expansion.isRelatedToHistory,
      confidence: expansion.confidence
    };
  }
}

export const aiKeywordExpansionService = new AIKeywordExpansionService();
