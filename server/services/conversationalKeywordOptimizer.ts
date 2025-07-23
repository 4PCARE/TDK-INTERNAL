
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface KeywordOptimizationResult {
  optimizedKeywords: string[];
  searchQuery: string;
  confidence: number;
  reasoning: string;
}

export class ConversationalKeywordOptimizer {
  
  /**
   * Analyze conversation context and optimize keywords for database search
   */
  async optimizeKeywords(
    currentQuery: string,
    recentMessages: ConversationMessage[],
    maxMessages: number = 10
  ): Promise<KeywordOptimizationResult> {
    try {
      // Take only the most recent messages for context
      const contextMessages = recentMessages.slice(-maxMessages);
      
      // Build conversation context
      const conversationContext = contextMessages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const optimizationPrompt = `คุณเป็น AI ที่ช่วยปรับปรุงคำค้นหาเพื่อค้นหาข้อมูลในฐานข้อมูล

บริบทการสนทนา:
${conversationContext}

คำค้นหาปัจจุบัน: "${currentQuery}"

ภารกิจของคุณ:
1. วิเคราะห์บริบทการสนทนาทั้งหมด
2. รวมข้อมูลจากข้อความก่อนหน้าที่เกี่ยวข้อง
3. สร้างคำค้นหาที่ปรับปรุงแล้วสำหรับค้นหาในฐานข้อมูล

ตัวอย่าง:
- ถ้าผู้ใช้ถามเรื่อง "XOLO" แล้วต่อด้วย "บางกะปิ" ควรรวมเป็น "XOLO บางกะปิ"
- ถ้าผู้ใช้ถามเรื่อง "ร้านอาหาร" แล้วต่อด้วย "ชั้น 3" ควรรวมเป็น "ร้านอาหาร ชั้น 3"
- ถ้าผู้ใช้ถามเรื่อง "เวลาเปิด-ปิด" แล้วมีการพูดถึงร้านไว้ก่อนหน้า ควรรวมชื่อร้านด้วย

กรุณาตอบในรูปแบบ JSON:
{
  "optimizedKeywords": ["คำสำคัญ1", "คำสำคัญ2", "คำสำคัญ3"],
  "searchQuery": "คำค้นหาที่ปรับปรุงแล้ว",
  "confidence": 0.95,
  "reasoning": "เหตุผลในการปรับปรุงคำค้นหา"
}`;

      console.log('🔍 Optimizing keywords for query:', currentQuery);
      console.log('📝 Using conversation context with', contextMessages.length, 'messages');

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "คุณเป็นผู้เชี่ยวชาญในการวิเคราะห์บริบทการสนทนาและปรับปรุงคำค้นหา ตอบเป็น JSON เสมอ"
          },
          {
            role: "user",
            content: optimizationPrompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3 // Lower temperature for more consistent results
      });

      const aiResponse = response.choices[0].message.content;
      
      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      // Parse JSON response
      let optimizationResult: KeywordOptimizationResult;
      try {
        optimizationResult = JSON.parse(aiResponse);
      } catch (parseError) {
        console.error('Failed to parse AI response as JSON:', aiResponse);
        // Fallback to basic optimization
        optimizationResult = this.createFallbackOptimization(currentQuery, contextMessages);
      }

      // Validate and ensure all required fields exist
      optimizationResult = {
        optimizedKeywords: optimizationResult.optimizedKeywords || [currentQuery],
        searchQuery: optimizationResult.searchQuery || currentQuery,
        confidence: Math.min(Math.max(optimizationResult.confidence || 0.5, 0), 1),
        reasoning: optimizationResult.reasoning || "ใช้คำค้นหาต้นฉบับ"
      };

      console.log('✅ Keyword optimization result:', {
        original: currentQuery,
        optimized: optimizationResult.searchQuery,
        keywords: optimizationResult.optimizedKeywords,
        confidence: optimizationResult.confidence
      });

      return optimizationResult;

    } catch (error) {
      console.error('Error optimizing keywords:', error);
      
      // Return fallback optimization
      return this.createFallbackOptimization(currentQuery, recentMessages);
    }
  }

  /**
   * Create a simple fallback optimization when AI fails
   */
  private createFallbackOptimization(
    currentQuery: string,
    recentMessages: ConversationMessage[]
  ): KeywordOptimizationResult {
    
    // Extract potential keywords from recent user messages
    const userMessages = recentMessages
      .filter(msg => msg.role === 'user')
      .slice(-3) // Last 3 user messages
      .map(msg => msg.content);

    // Common entities that should be combined
    const locationKeywords = ['บางกะปิ', 'bangkapi', 'ลาดพร้าว', 'ladprao', 'ชั้น', 'floor'];
    const storeKeywords = ['xolo', 'kamu', 'ร้าน', 'shop', 'store'];
    
    let combinedKeywords = [currentQuery];
    let searchQuery = currentQuery;

    // Look for related terms in previous messages
    for (const prevMessage of userMessages) {
      const prevLower = prevMessage.toLowerCase();
      const currentLower = currentQuery.toLowerCase();
      
      // If current query mentions location, check for store names in previous messages
      if (locationKeywords.some(keyword => currentLower.includes(keyword.toLowerCase()))) {
        for (const storeKeyword of storeKeywords) {
          if (prevLower.includes(storeKeyword)) {
            searchQuery = `${storeKeyword} ${currentQuery}`;
            combinedKeywords = [storeKeyword, currentQuery];
            break;
          }
        }
      }
      
      // If current query mentions store, check for locations in previous messages
      if (storeKeywords.some(keyword => currentLower.includes(keyword.toLowerCase()))) {
        for (const locationKeyword of locationKeywords) {
          if (prevLower.includes(locationKeyword)) {
            searchQuery = `${currentQuery} ${locationKeyword}`;
            combinedKeywords = [currentQuery, locationKeyword];
            break;
          }
        }
      }
    }

    return {
      optimizedKeywords: combinedKeywords,
      searchQuery: searchQuery,
      confidence: 0.7,
      reasoning: "ใช้การวิเคราะห์พื้นฐานเนื่องจาก AI ไม่สามารถประมวลผลได้"
    };
  }

  /**
   * Extract conversation context from chat history
   */
  extractConversationContext(chatHistory: any[]): ConversationMessage[] {
    return chatHistory
      .filter(msg => msg.messageType === 'user' || msg.messageType === 'assistant')
      .map(msg => ({
        role: msg.messageType === 'user' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: msg.createdAt
      }))
      .sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
  }
}

export const conversationalKeywordOptimizer = new ConversationalKeywordOptimizer();
