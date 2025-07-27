
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

1. **CRITICAL: Inject Historical Context**
   - ALWAYS examine the chat history for relevant context, especially:
     - Recent image analysis mentions (look for system messages containing store names, brands, products)
     - Previous store or location discussions
     - Brand names or product mentions in recent conversation
   - If the user's query is vague (e.g., "อยู่ชั้นไหน", "ราคาเท่าไหร่", "มีส่วนลดมั้ย") but chat history contains specific context (store names, brands, products), YOU MUST inject that context into the enhanced query
   - Example: User says "อยู่ชั้นไหน" and history mentions "OPPO" → Enhanced query should be "OPPO อยู่ชั้นไหน"

2. Preprocess the user's query:
   - If the query is in Thai:
     - Insert whitespace between Thai words if not already segmented
     - Remove Thai stopwords such as: "ครับ", "ค่ะ", "เหรอ", "ไหน", "ยังไง", "ไหม", "อ่ะ", "ละ", etc.
     - Correct minor typos when possible (e.g., "บางกะปี" → "บางกะปิ")
     - Mark as vague any query that is too short UNLESS you can inject historical context

3. Determine if the user's query requires a document search:
   - Mark \`needsSearch: false\` if the query is vague, purely conversational, AND lacks historical context
   - Mark \`needsSearch: true\` if the query includes location, product, service, store-related keywords, OR if you can inject relevant context from history

4. If a search is needed:
   - **PRIORITY 1**: Inject specific context from chat history (store names, brands, locations)
   - **PRIORITY 2**: Enhance with relevant terms and category context:
     - For food or drink: \`"อาหาร"\`, \`"ร้านอาหาร"\`, \`"dining"\`
     - For clothing or fashion: \`"แฟชั่น"\`, \`"เสื้อผ้า"\`, \`"fashion"\`
     - For banking, salons, services: \`"บริการ"\`, \`"service"\`

5. Set hybrid search weights:
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

Recent Chat History (EXAMINE CAREFULLY for context clues):
${chatHistoryText}

${context ? `Additional Context: ${context}` : ''}

**INSTRUCTIONS:**
1. Look for store names, brands, or products mentioned in the chat history
2. If the user query is vague but history contains specific context, inject that context
3. Pay special attention to image analysis results that mention specific stores or brands
4. Examples of context injection:
   - Query: "อยู่ชั้นไหน" + History mentions "OPPO" → Enhanced: "OPPO อยู่ชั้นไหน"
   - Query: "ราคาเท่าไหร่" + History mentions "iPhone 15" → Enhanced: "iPhone 15 ราคาเท่าไหร่"

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
