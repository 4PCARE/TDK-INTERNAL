
export interface CSATAnalysisRequest {
  conversationId: string;
  userId: string;
  messages: Array<{
    content: string;
    messageType: 'user' | 'agent' | 'assistant';
    timestamp: string;
  }>;
}

export interface CSATResult {
  score: number; // 0-100
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  factors: string[];
  timestamp: string;
}

export class CSATUseCase {
  async analyzeConversation(request: CSATAnalysisRequest): Promise<CSATResult> {
    // Basic sentiment analysis based on conversation patterns
    const userMessages = request.messages.filter(m => m.messageType === 'user');
    
    if (userMessages.length < 2) {
      return {
        score: 50,
        sentiment: 'neutral',
        confidence: 0.3,
        factors: ['insufficient_data'],
        timestamp: new Date().toISOString()
      };
    }

    // Analyze conversation flow and sentiment indicators
    const sentiment = this.analyzeSentiment(userMessages);
    const score = this.calculateScore(sentiment, userMessages);
    
    return {
      score,
      sentiment: sentiment.overall,
      confidence: sentiment.confidence,
      factors: sentiment.factors,
      timestamp: new Date().toISOString()
    };
  }

  private analyzeSentiment(messages: Array<{ content: string }>) {
    const positiveWords = ['thank', 'good', 'great', 'excellent', 'perfect', 'awesome', 'satisfied', 'helpful'];
    const negativeWords = ['bad', 'terrible', 'awful', 'disappointed', 'frustrated', 'angry', 'useless', 'hate'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    const factors: string[] = [];

    messages.forEach(msg => {
      const content = msg.content.toLowerCase();
      positiveWords.forEach(word => {
        if (content.includes(word)) {
          positiveCount++;
          factors.push(`positive_indicator: ${word}`);
        }
      });
      negativeWords.forEach(word => {
        if (content.includes(word)) {
          negativeCount++;
          factors.push(`negative_indicator: ${word}`);
        }
      });
    });

    const totalIndicators = positiveCount + negativeCount;
    const confidence = Math.min(totalIndicators / 5, 1); // Max confidence at 5+ indicators

    let overall: 'positive' | 'neutral' | 'negative';
    if (positiveCount > negativeCount) {
      overall = 'positive';
    } else if (negativeCount > positiveCount) {
      overall = 'negative';
    } else {
      overall = 'neutral';
    }

    return { overall, confidence, factors, positiveCount, negativeCount };
  }

  private calculateScore(sentiment: any, messages: Array<{ content: string }>): number {
    let baseScore = 50; // Neutral baseline

    // Adjust based on sentiment
    if (sentiment.overall === 'positive') {
      baseScore += 30;
    } else if (sentiment.overall === 'negative') {
      baseScore -= 30;
    }

    // Adjust based on conversation length (engagement indicator)
    const messageCount = messages.length;
    if (messageCount > 5) {
      baseScore += 10; // Good engagement
    } else if (messageCount < 3) {
      baseScore -= 10; // Poor engagement
    }

    // Ensure score is within bounds
    return Math.max(0, Math.min(100, baseScore));
  }
}
