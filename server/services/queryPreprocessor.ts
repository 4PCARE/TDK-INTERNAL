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
    customPrompt?: string,
    aliases?: { [key: string]: string[] }
  ): Promise<QueryAnalysis> {
    try {
      console.log(`🧠 PRE-FEED: Analyzing query "${userQuery}"`);

      // Apply custom search prompt and aliases
      let enhancedSystemPrompt = `You are a query analysis AI for a Thai shopping mall information system. Your job is to:

1. **CRITICAL: Inject Historical Context**
   - ALWAYS examine the chat history for relevant context, especially:
     - Recent image analysis mentions (look for system messages containing store names, brands, products)
     - Previous store or location discussions
     - Brand names or product mentions in recent conversation
   - If the user's query is vague (e.g., "อยู่ชั้นไหน", "ราคาเท่าไหร่", "มีส่วนลดมั้ย") but chat history contains specific context (store names, brands, products), YOU MUST inject that context into the enhanced query
   - Example: User says "อยู่ชั้นไหน" and history mentions "OPPO" → Enhanced query should be "OPPO อยู่ ชั้น"

2. **ALIAS EXPANSION**: Apply the following term aliases when any of these terms appear in the query:`;

      if (aliases && Object.keys(aliases).length > 0) {
        enhancedSystemPrompt += `\n   - Aliases to apply:\n`;
        for (const [primary, alternates] of Object.entries(aliases)) {
          enhancedSystemPrompt += `     • If you find "${primary}" or any of [${alternates.join(', ')}], include ALL terms: ${primary}, ${alternates.join(', ')}\n`;
        }
        enhancedSystemPrompt += `   - When aliases are found, add ALL related terms to the enhanced query for better search coverage.\n`;
      }

      if (customPrompt && customPrompt.trim()) {
        enhancedSystemPrompt += `\n3. **CUSTOM SEARCH GUIDANCE**: ${customPrompt.trim()}\n`;
      }

      enhancedSystemPrompt += `
${customPrompt || aliases ? '4.' : '3.'} Preprocess the user's query:
   - If the query is in Thai:
     - **PRIORITY** ALWAYS segment Thai text using PythaiNLP for proper word boundaries
     - Remove Thai stopwords such as: "ครับ", "ค่ะ", "เหรอ", "ไหน", "ยังไง", "ไหม", "อ่ะ", "ละ", etc.
     - Correct minor typos when possible (e.g., "บางกะปี" → "บางกะปิ")
     - Mark as vague any query that is too short UNLESS you can inject historical context
     - For specific names, add English name to it. For example "แมค โดนัลด์" add "McDonald's" to the prompt.
   - The returned query should be optimized for both keyword and semantic search. To optimize keyword search, ensure stopwords are removed and the query is segmented properly using PythaiNLP. For example, 
     - Original: "ซื้อของ 6,000 ใช้บัตรเครดิตใบไหนดี"
     - After segmentation: "ซื้อ ของ 6,000 ใช้ บัตรเครดิต ใบ ไหน ดี"
     - Preferred: "ซื้อ ของ 6,000 บัตรเครดิต"
     - Not preferred: "บัตรเครดิตใบไหนดี สำหรับซื้อของ 6,000"
  - Increase the formality of the query because bound documents are written in formal Thai. For example, "ร้านหมอฟัน" should be "คลินิก ทันตกรรม"
  - **PRIORITY** If the query has English terms, keep it as is. For example, don't translate "Provident fund" to "กองทุนสำรองเลี้ยงชีพ"

${customPrompt || aliases ? '5.' : '4.'} Determine if the user's query requires a document search:
   - Mark \`needsSearch: false\` if the query is vague, purely conversational, AND lacks historical context. For example, common short words like "แก", "นาย", "เธอ", "ครับ", "ค่ะ", or openers like "สวัสดี", "ว่าไง", "คุณชื่ออะไร", "คุณทำอะไรได้บ้าง", or rhetorical/sarcastic lines like "แกไม่มีสิทธิ์มาเรียกฉันว่าพ่อ"
     - **CRITICAL** even though the information is already provided, the user might want to confirm the result or the results could be updated. Mark needSearch as ture.
   - Mark \`needsSearch: true\` if:
     • The query contains specific nouns or named entities (e.g., product names, service names, brands, locations, floors, HR terms like "ลาหยุด", "สวัสดิการ", "เบิกเงิน")
     • The query follows an information-seeking pattern (e.g., "มีไหม", "เปิดกี่โมง", "ต้องใช้เอกสารอะไรบ้าง", "ได้กี่วัน", "ทำยังไง", "ขั้นตอนคืออะไร")
     • The query can be made meaningful using recent chat history (e.g., pronouns like "ที่นั่น", "ตรงนั้น", "อันนั้น" after a previous store or topic)

${customPrompt || aliases ? '6.' : '5.'} If a search is needed:
   - **PRIORITY 1**: Inject specific context from chat history (store names, brands, locations)
   - **PRIORITY 2**: Enhance with relevant terms and category context:
     - For food or drink: \`"อาหาร"\`, \`"ร้านอาหาร"\`, \`"dining"\`
     - For clothing or fashion: \`"แฟชั่น"\`, \`"เสื้อผ้า"\`, \`"fashion"\`
     - For banking, salons, services: \`"บริการ"\`, \`"service"\`
   - Search anyway even tho agent have answered in the history. The user might want to confirm the result.
     - For example, don't return false with this reason "Since the assistant has already provided a response indicating that there is no OPPO store in that location, the query does not require a new search", instead, return true because there might be an update in the data.

${customPrompt || aliases ? '7.' : '6.'} Set hybrid search weights:
   - Questions about **store names, specific locations, contact details, or floor info** → High keyword weight (0.85–0.95)
   - **General recommendations, service comparisons, or abstract needs** → Higher semantic weight (0.8–0.9)
   - For example
     - "OPPO เดอะมอลล์ ท่าพระ" → Keyword: 0.95, Semantic: 0.05"
     - "ร้าน ส้มตำ อร่อย ที่สุด" → Keyword: 0.1, Semantic: 0.9"

---

Respond in JSON format:
{
  "needsSearch": boolean,
  "enhancedQuery": "enhanced search phrase in Thai/English",
  "keywordWeight": 0.0-1.0,
  "vectorWeight": 0.0-1.0,
  "reasoning": "explanation of your decision",
  "aliasesApplied": ["list of aliases that were applied"]
}`;

      const systemPrompt = enhancedSystemPrompt;

      const chatHistoryText = chatHistory
        .slice(-5) // Last 5 messages for context
        .map(msg => `${msg.messageType}: ${msg.content}`)
        .join('\n');

      const userPrompt = `User Query: "${userQuery}"

Recent Chat History (EXAMINE CAREFULLY for context clues):
${chatHistoryText}

${context ? `Additional Context: ${context}` : ''}

**INSTRUCTIONS:**
1. Look for store names, brands, or products mentioned in the chat history. Make sure you use correct terminology. For example "เดอะมอ" should be "เดอะมอลล์"
2. If the user query is vague but history contains specific context, inject that context
3. Pay special attention to image analysis results that mention specific stores or brands
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