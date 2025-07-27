
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
  private thaiStopwords = new Set([
    'ครับ', 'ค่ะ', 'เหรอ', 'ไหน', 'นะ', 'หรือ', 'เอ็ง', 'กู', 'มัง', 'วะ', 
    'หว่า', 'เฮ้ย', 'เอา', 'ได้', 'แล้ว', 'จะ', 'ไป', 'มา', 'อยู่', 'เป็น',
    'ที่', 'ใน', 'กับ', 'และ', 'หรือ', 'แต่', 'เพราะ', 'ถ้า', 'เมื่อ'
  ]);

  private commonTypos = new Map([
    ['อปป์', 'OPPO'],
    ['โอปโป', 'OPPO'],
    ['โอปป์', 'OPPO'],
    ['งามวงวาน', 'งามวงศ์วาน'],
    ['งามวองวาน', 'งามวงศ์วาน'],
    ['บางกะปิ', 'บางกะปิ'], // Already correct but common
    ['บางแก', 'บางแค'],
    ['ทาพระ', 'ท่าพระ'],
    ['ท่าพรา', 'ท่าพระ'],
    ['เดอะมอล', 'เดอะมอลล์'],
    ['เดอะมอลล์', 'เดอะมอลล์'], // Already correct
    ['ไลฟสโตร์', 'ไลฟ์สโตร์'],
    ['ไลฟ์สตอร์', 'ไลฟ์สโตร์']
  ]);

  private preprocessThaiText(text: string): string {
    console.log(`🧠 PRE-PROCESSING: Original text "${text}"`);
    
    // Step 1: Basic whitespace normalization
    let processed = text.trim().replace(/\s+/g, ' ');
    
    // Step 2: Add whitespace between Thai and English words
    processed = processed.replace(/([ก-๙])([A-Za-z])/g, '$1 $2');
    processed = processed.replace(/([A-Za-z])([ก-๙])/g, '$1 $2');
    
    // Step 3: Add whitespace between Thai words (basic segmentation)
    // This is a simple approach - for better results, you'd use a proper Thai word segmentation library
    processed = processed.replace(/([ก-๙]{2,})([ก-๙]{2,})/g, (match, p1, p2) => {
      // Simple heuristic: if we have compound words, try to separate them
      if (match.length > 6) {
        const mid = Math.floor(match.length / 2);
        return match.slice(0, mid) + ' ' + match.slice(mid);
      }
      return match;
    });
    
    // Step 4: Correct common typos
    this.commonTypos.forEach((correct, typo) => {
      const regex = new RegExp(typo, 'gi');
      processed = processed.replace(regex, correct);
    });
    
    // Step 5: Remove stopwords
    const words = processed.split(/\s+/);
    const filteredWords = words.filter(word => {
      const cleanWord = word.toLowerCase().trim();
      return cleanWord.length > 0 && !this.thaiStopwords.has(cleanWord);
    });
    
    processed = filteredWords.join(' ');
    
    console.log(`🧠 PRE-PROCESSING: Processed text "${processed}"`);
    return processed;
  }

  async analyzeQuery(
    userQuery: string,
    chatHistory: ChatMessage[] = [],
    context?: string
  ): Promise<QueryAnalysis> {
    try {
      console.log(`🧠 PRE-FEED: Analyzing query "${userQuery}"`);
      
      // Preprocess Thai text
      const preprocessedQuery = this.preprocessThaiText(userQuery);
      console.log(`🧠 PRE-FEED: Preprocessed query "${preprocessedQuery}"`);
      
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

      const userPrompt = `Original User Query: "${userQuery}"
Preprocessed Query: "${preprocessedQuery}"

Recent Chat History:
${chatHistoryText}

${context ? `Additional Context: ${context}` : ''}

Use the preprocessed query for analysis, but consider both versions for context. Analyze this query and provide your response.`;

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

      // If AI didn't enhance the query much, use our preprocessed version
      if (analysis.enhancedQuery === userQuery || analysis.enhancedQuery.length < preprocessedQuery.length) {
        analysis.enhancedQuery = preprocessedQuery;
      }

      console.log(`🧠 PRE-FEED RESULT:`, {
        needsSearch: analysis.needsSearch,
        original: userQuery,
        preprocessed: preprocessedQuery,
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
    // Use preprocessed text for fallback analysis
    const preprocessedQuery = this.preprocessThaiText(userQuery);
    const lowerQuery = preprocessedQuery.toLowerCase();
    
    // Check if it's a location question
    const isLocationQuery = /อยู่|ชั้น|ที่|where|location|floor/.test(lowerQuery);
    
    // Check for store names
    const hasStoreName = /oppo|xolo|kfc|starbucks|uniqlo|ทำเล|ร้าน/.test(lowerQuery);
    
    const needsSearch = isLocationQuery || hasStoreName || lowerQuery.length > 3;
    
    return {
      needsSearch,
      enhancedQuery: preprocessedQuery,
      keywordWeight: isLocationQuery || hasStoreName ? 0.7 : 0.3,
      vectorWeight: isLocationQuery || hasStoreName ? 0.3 : 0.7,
      reasoning: 'Fallback analysis with Thai text preprocessing'
    };
  }
}

export const queryPreprocessor = new QueryPreprocessorService();
