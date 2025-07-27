
import { openai } from './openai';

export interface QueryAnalysis {
  needsSearch: boolean;
  enhancedQuery: string;
  keywordWeight: number;
  vectorWeight: number;
  reasoning: string;
}

export interface ChatMessage {
  messageType: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export class QueryPreprocessorService {
  async analyzeQuery(
    userQuery: string,
    chatHistory: ChatMessage[] = [],
    context?: string
  ): Promise<QueryAnalysis> {
    try {
      console.log(`🧠 PRE-FEED: Analyzing query "${userQuery}"`);
      
      const systemPrompt = `You are a query analysis AI for a Thai shopping mall information system. Your job is to:

1. Determine if the user's question requires a document search
2. If yes, enhance the search query with context from chat history
3. Set optimal hybrid search weights (keyword vs semantic)

Guidelines:
- Questions about specific store locations, floor numbers, or contact details → High keyword weight (0.7-0.8)
- General questions about services, recommendations, or explanations → High semantic weight (0.6-0.8)
- Questions asking "where is this store" when mentioned earlier → Include store name in enhanced query
- Questions in Thai about locations often use "อยู่ไหน", "ชั้นไหน", "ที่ไหน"
- Store names like OPPO, XOLO, etc. should be preserved exactly
- Mall names like "เดอะมอลล์งามวงศ์วาน", "บางกะปิ" should be included when relevant

Respond in JSON format:
{
  "needsSearch": boolean,
  "enhancedQuery": "improved search phrase in Thai/English",
  "keywordWeight": 0.0-1.0,
  "vectorWeight": 0.0-1.0,
  "reasoning": "explanation of your decision"
}`;

      const chatHistoryText = chatHistory
        .slice(-5) // Last 5 messages for context
        .map(msg => `${msg.messageType}: ${msg.content}`)
        .join('\n');

      const userPrompt = `User Query: "${userQuery}"

Recent Chat History:
${chatHistoryText}

${context ? `Additional Context: ${context}` : ''}

Analyze this query and provide your response.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 300
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      let analysis: QueryAnalysis;
      try {
        analysis = JSON.parse(content);
      } catch (parseError) {
        console.warn('Failed to parse AI response, using fallback analysis');
        analysis = this.getFallbackAnalysis(userQuery);
      }

      // Normalize weights to sum to 1
      const totalWeight = analysis.keywordWeight + analysis.vectorWeight;
      if (totalWeight > 0) {
        analysis.keywordWeight = analysis.keywordWeight / totalWeight;
        analysis.vectorWeight = analysis.vectorWeight / totalWeight;
      } else {
        analysis.keywordWeight = 0.5;
        analysis.vectorWeight = 0.5;
      }

      console.log(`🧠 PRE-FEED RESULT:`, {
        needsSearch: analysis.needsSearch,
        original: userQuery,
        enhanced: analysis.enhancedQuery,
        weights: `K:${analysis.keywordWeight.toFixed(2)} V:${analysis.vectorWeight.toFixed(2)}`,
        reasoning: analysis.reasoning
      });

      return analysis;

    } catch (error) {
      console.error('Query preprocessing failed:', error);
      return this.getFallbackAnalysis(userQuery);
    }
  }

  private getFallbackAnalysis(userQuery: string): QueryAnalysis {
    // Simple fallback logic
    const lowerQuery = userQuery.toLowerCase();
    
    // Check if it's a location question
    const isLocationQuery = /อยู่ไหน|ชั้นไหน|ที่ไหน|where|location|floor/.test(lowerQuery);
    
    // Check for store names
    const hasStoreName = /oppo|xolo|kfc|starbucks|uniqlo|ทำเล|ร้าน/.test(lowerQuery);
    
    const needsSearch = isLocationQuery || hasStoreName || lowerQuery.length > 3;
    
    return {
      needsSearch,
      enhancedQuery: userQuery,
      keywordWeight: isLocationQuery || hasStoreName ? 0.7 : 0.3,
      vectorWeight: isLocationQuery || hasStoreName ? 0.3 : 0.7,
      reasoning: 'Fallback analysis due to AI preprocessing error'
    };
  }
}

export const queryPreprocessor = new QueryPreprocessorService();
