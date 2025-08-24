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
    context?: string,
    additionalSearchDetail?: string
  ): Promise<QueryAnalysis> {
    try {
      console.log(`🧠 PRE-FEED: Analyzing query "${userQuery}"`);

      let systemPrompt = `You are a query analysis AI for a knowledge management system. ${additionalSearchDetail ? `Additional Context: ${additionalSearchDetail}` : ''} Your job is to:

1. **CRITICAL: Inject Historical Context**
   - ALWAYS examine the chat history for relevant context, especially:
     - Recent image analysis mentions (look for system messages containing entity names, topics, or subjects)
     - Previous topic or entity discussions
     - Specific names, terms, or concepts mentioned in recent conversation
   - If the user's query is vague (e.g., "อยู่ที่ไหน", "ราคาเท่าไหร่", "มีส่วนลดมั้ย", "ทำยังไง", "กี่วัน") but chat history contains specific context, YOU MUST inject that context into the enhanced query
   - Example: User says "อยู่ชั้นไหน" and history mentions "OPPO" → Enhanced query should be "OPPO อยู่ ชั้น"

2. Preprocess the user's query:
   - If the query is in Thai:
     - **PRIORITY** ALWAYS segment Thai text using PythaiNLP for proper word boundaries
     - Remove Thai stopwords such as: "ครับ", "ค่ะ", "เหรอ", "ไหน", "ยังไง", "ไหม", "อ่ะ", "ละ", etc.
     - Correct minor typos when possible (e.g., "บางกะปี" → "บางกะปิ")
     - Mark as vague any query that is too short UNLESS you can inject historical context
     - For specific names, add English name to it when relevant. For example "แมค โดนัลด์" add "McDonald's" to the prompt.
   - The returned query should be optimized for both keyword and semantic search. To optimize keyword search, ensure stopwords are removed and the query is segmented properly using PythaiNLP. For example,
     - Original: "ซื้อของ 6,000 ใช้บัตรเครดิตใบไหนดี"
     - After segmentation: "ซื้อ ของ 6,000 ใช้ บัตรเครดิต ใบ ไหน ดี"
     - Preferred: "ซื้อ ของ 6,000 บัตรเครดิต"
     - Not preferred: "บัตรเครดิตใบไหนดี สำหรับซื้อของ 6,000"
  - Increase the formality of the query because documents are typically written in formal language. For example, "ร้านหมอฟัน" should be "คลินิก ทันตกรรม"
  - **PRIORITY** If the query has English terms, keep it as is. For example, don't translate "Provident fund" to "กองทุนสำรองเลี้ยงชีพ"

3. Determine if the user's query requires a document search:
   - Mark \`needsSearch: false\` if the query is vague, purely conversational, AND lacks historical context. For example, common short words like "แก", "นาย", "เธอ", "ครับ", "ค่ะ", or openers like "สวัสดี", "ว่าไง", "คุณชื่ออะไร", "คุณทำอะไรได้บ้าง", or rhetorical/sarcastic lines like "แกไม่มีสิทธิ์มาเรียกฉันว่าพ่อ"
   - Mark \`needsSearch: true\` if:
     • The query contains specific nouns or named entities (e.g., names, places, concepts, technical terms, policies, procedures)
     • The query follows an information-seeking pattern (e.g., "มีไหม", "เปิดกี่โมง", "ต้องใช้เอกสารอะไรบ้าง", "ได้กี่วัน", "ทำยังไง", "ขั้นตอนคืออะไร", "วิธีการ", "กฎระเบียบ")
     • The query can be made meaningful using recent chat history (e.g., pronouns like "ที่นั่น", "ตรงนั้น", "อันนั้น", "มัน", "นี่" after a previous topic)
     • The query asks about facts, processes, policies, or any information that might be documented
     • **CRITICAL** even though the information is already provided, the user might want to confirm the result or the results could be updated. Mark needSearch as true anyway!!!.

4. If a search is needed:
   - **PRIORITY 1**: Inject specific context from chat history (names, entities, topics, locations)
   - **PRIORITY 2**: Enhance with relevant terms and category context based on the domain:
     - For HR/policies: add relevant terms like "นโยบาย", "ระเบียบ", "procedure"
     - For locations/services: add relevant location or service terms
     - For technical topics: add relevant technical terminology
   - Search anyway even though agent have answered in the history. The user might want to confirm the result.
     - For example, don't return false with this reason "Since the assistant has already provided a response indicating that information, the query does not require a new search", instead, return true because there might be an update in the data.

5. Set hybrid search weights:
   - Questions about **specific names, exact locations, contact details, or precise facts** → High keyword weight (0.85–0.95)
   - **General recommendations, conceptual questions, or abstract needs** → Higher semantic weight (0.8–0.9)
   - For example
     - "OPPO เดอะมอลล์ ท่าพระ" → Keyword: 0.95, Semantic: 0.05"
     - "วิธี การ ลา ที่ ดี ที่สุด" → Keyword: 0.1, Semantic: 0.9"`;

      // Inject search configuration into system prompt if available
        if (additionalSearchDetail) {
          // Handle both direct search detail and context string formats
          let searchConfig = additionalSearchDetail;
          if (additionalSearchDetail.includes('Search Configuration:')) {
            const searchConfigMatch = additionalSearchDetail.match(/Search Configuration: (.+)/);
            if (searchConfigMatch) {
              searchConfig = searchConfigMatch[1];
            }
          }

          if (searchConfig && searchConfig.trim()) {
            systemPrompt += `

**SEARCH CONFIGURATION ENHANCEMENT:**
Additional search context: "${searchConfig}"
- CRITICAL: Incorporate this context when enhancing queries
- Use this to better understand the domain and purpose of the search
- Apply this context to make queries more specific and relevant
- When the user query is vague, use this context to provide better search terms`;
            console.log(`🧠 PRE-FEED: Applied search configuration: "${searchConfig}"`);
          }
        }

      const chatHistoryText = chatHistory
        .slice(-5) // Last 5 messages for context
        .map(msg => `${msg.messageType}: ${msg.content}`)
        .join('\n');

      const userPrompt = `User Query: "${userQuery}"

Recent Chat History (EXAMINE CAREFULLY for context clues):
${chatHistoryText}

${context ? `Additional Context: ${context}` : ''}

**INSTRUCTIONS:**
1. Look for entity names, topics, or concepts mentioned in the chat history. Make sure you use correct terminology.
2. If the user query is vague but history contains specific context, inject that context
3. Pay special attention to image analysis results that mention specific entities or topics
4. Examples of context injection:
   - Query: "อยู่ชั้นไหน" + History mentions "OPPO", "เดอะมอลล์ ท่าพระ" → Enhanced: "OPPO เดอะมอลล์ ท่าพระ"
   - Query: "ราคาเท่าไหร่" + History mentions "iPhone 15" → Enhanced: "iPhone 15 ราคา"

Analyze this query and provide your response.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
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

    // Check if it's a location or factual question
    const isFactualQuery = /อยู่ที่ไหน|ชั้นไหน|ที่ไหน|where|location|floor|ราคา|เท่าไหร่|ส่วนลด|discount|ขั้นตอน|process|วิธี|how|อะไร|what|ใคร|who|ทำไม|why|เมื่อไหร่|when|กี่|how many|กี่วัน|how many days/.test(lowerQuery);

    // Check for specific entities or concepts (can be expanded)
    const hasSpecificEntity = /oppo|xolo|kfc|starbucks|uniqlo|provident fund|กองทุนสำรองเลี้ยงชีพ|ลาหยุด|สวัสดิการ|เบิกเงิน|นโยบาย|ระเบียบ/.test(lowerQuery);

    // A query needs search if it's factual, has specific entities, or is not a short, purely conversational phrase.
    const needsSearch = isFactualQuery || hasSpecificEntity || lowerQuery.length > 5; // Heuristic for short, conversational phrases

    return {
      needsSearch,
      enhancedQuery: userQuery,
      keywordWeight: isFactualQuery || hasSpecificEntity ? 0.7 : 0.3,
      vectorWeight: isFactualQuery || hasSpecificEntity ? 0.3 : 0.7,
      reasoning: 'Fallback analysis due to AI preprocessing error or generic query detection'
    };
  }
}

export const queryPreprocessor = new QueryPreprocessorService();