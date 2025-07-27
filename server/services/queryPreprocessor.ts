
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

1. Preprocess the user's query:
   - If the query is in Thai:
     - Insert whitespace between Thai words if not already segmented
     - Remove Thai stopwords such as: "ครับ", "ค่ะ", "เหรอ", "ไหน", "ยังไง", "ไหม", "อ่ะ", "ละ", etc.
     - Correct minor typos when possible (e.g., "บางกะปี" → "บางกะปิ")
     - Discard or mark as vague any query that is too short (e.g., single Thai words like "แก", "มัน", "ที่", "เขา", "เรา") unless there is strong surrounding context

2. Determine if the user's query requires a document search:
   - Mark \`needsSearch: false\` if the query is vague, purely conversational, or lacks actionable terms
   - If the query includes a location, product, service, or store-related keyword, mark \`needsSearch: true\`

3. If a search is needed:
   - Enhance the query using relevant terms from chat history (e.g., specific store names, areas, etc.)
   - Nourish the query by appending inferred category or context terms such as:
     - For food or drink: \`"อาหาร"\`, \`"ร้านอาหาร"\`, \`"dining"\`
     - For clothing or fashion: \`"แฟชั่น"\`, \`"เสื้อผ้า"\`, \`"fashion"\`
     - For banking, salons, services: \`"บริการ"\`, \`"service"\`
   - Only append categories that help anchor the search to known document fields

4. Set hybrid search weights:
   - Questions about **store names, specific locations, contact details, or floor info** → High keyword weight (0.7–0.8)
   - **General recommendations, service comparisons, or abstract needs** → Higher semantic weight (0.6–0.8)

---

Respond in JSON format:
{
  "needsSearch": boolean,
  "enhancedQuery": "enhanced search phrase in Thai/English",
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
