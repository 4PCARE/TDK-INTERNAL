
export class ChatController {
  async processMessage(req: any, res: any) {
    try {
      const { message, sessionId, agentId, channelType = 'web' } = req.body;
      const userId = req.headers['x-user-id'] || 'anonymous';

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      console.log(`🤖 Processing message for user ${userId}, agent ${agentId}: ${message}`);

      // Mock AI response generation
      const response = await this.generateResponse(message, userId, sessionId, agentId);

      // Mock conversation history storage
      const conversationEntry = {
        id: Date.now().toString(),
        sessionId,
        userId,
        agentId,
        userMessage: message,
        botResponse: response,
        timestamp: new Date().toISOString(),
        channelType
      };

      console.log(`✅ Generated response: ${response}`);

      res.json({
        response,
        conversationId: conversationEntry.id,
        timestamp: conversationEntry.timestamp
      });

    } catch (error) {
      console.error('Chat processing error:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  }

  private async generateResponse(message: string, userId: string, sessionId: string, agentId: string): Promise<string> {
    // Mock AI response generation logic
    const responses = [
      "ขอบคุณสำหรับคำถามของคุณ ฉันกำลังประมวลผลข้อมูลเพื่อให้คำตอบที่ดีที่สุด",
      "นั่นเป็นคำถามที่น่าสนใจ ให้ฉันค้นหาข้อมูลที่เกี่ยวข้องให้คุณ",
      "ฉันเข้าใจสิ่งที่คุณถาม มีข้อมูลเพิ่มเติมที่อาจจะช่วยได้",
      "ขอบคุณที่ใช้บริการ หากมีคำถามเพิ่มเติมสามารถสอบถามได้เสมอ"
    ];

    // Simple response selection based on message content
    if (message.includes('สวัสดี') || message.includes('hello')) {
      return "สวัสดีครับ! ยินดีให้บริการ มีอะไรให้ช่วยไหมครับ?";
    }
    
    if (message.includes('ขอบคุณ') || message.includes('thank')) {
      return "ยินดีครับ! หากมีคำถามอื่นๆ สามารถสอบถามได้เสมอนะครับ";
    }

    // Return random response for other messages
    const randomIndex = Math.floor(Math.random() * responses.length);
    return responses[randomIndex];
  }

  async getConversationHistory(req: any, res: any) {
    try {
      const { sessionId } = req.params;
      const userId = req.headers['x-user-id'] || 'anonymous';

      console.log(`📜 Fetching conversation history for session ${sessionId}, user ${userId}`);

      // Mock conversation history
      const mockHistory = [
        {
          id: '1',
          userMessage: 'สวัสดีครับ',
          botResponse: 'สวัสดีครับ! ยินดีให้บริการ มีอะไรให้ช่วยไหมครับ?',
          timestamp: new Date(Date.now() - 300000).toISOString()
        },
        {
          id: '2',
          userMessage: 'ช่วยหาข้อมูลเกี่ยวกับการใช้งานระบบหน่อย',
          botResponse: 'ขอบคุณสำหรับคำถามของคุณ ฉันกำลังประมวลผลข้อมูลเพื่อให้คำตอบที่ดีที่สุด',
          timestamp: new Date(Date.now() - 240000).toISOString()
        }
      ];

      res.json({
        sessionId,
        history: mockHistory,
        total: mockHistory.length
      });

    } catch (error) {
      console.error('History fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch conversation history' });
    }
  }
}
