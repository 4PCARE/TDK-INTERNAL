
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

    // Try OpenAI analysis first, fallback to basic analysis
    try {
      const aiResult = await this.analyzeWithOpenAI(request.messages);
      if (aiResult) {
        return aiResult;
      }
    } catch (error) {
      console.warn('OpenAI CSAT analysis failed, falling back to basic analysis:', error);
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

  private async analyzeWithOpenAI(messages: Array<{content: string; messageType: string}>): Promise<CSATResult | null> {
    if (!process.env.OPENAI_API_KEY) {
      return null;
    }

    const conversationText = messages
      .filter(msg => msg.messageType === 'user' || msg.messageType === 'agent' || msg.messageType === 'assistant')
      .map(msg => {
        const role = msg.messageType === 'user' ? 'Customer' :
                     msg.messageType === 'agent' ? 'Human Agent' : 'AI Agent';
        return `${role}: ${msg.content}`;
      }).join('\n\n');

    const prompt = `
      Analyze the customer satisfaction from this conversation and return a JSON response:

      ${conversationText}

      Analyze the customer's satisfaction level based on:
      1. Politeness and friendliness
      2. Expressed satisfaction or dissatisfaction
      3. Responsiveness to service
      4. Willingness to continue using the service
      5. Overall tone and sentiment

      Return JSON with:
      - score: number (0-100)
      - sentiment: "positive" | "neutral" | "negative"
      - confidence: number (0-1)
      - factors: array of strings explaining the score

      Only return valid JSON, no additional text.
    `;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        return null;
      }

      const result = JSON.parse(content);
      return {
        score: Math.max(0, Math.min(100, result.score || 50)),
        sentiment: ['positive', 'neutral', 'negative'].includes(result.sentiment) ? result.sentiment : 'neutral',
        confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
        factors: Array.isArray(result.factors) ? result.factors : ['ai_analysis'],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('OpenAI CSAT analysis error:', error);
      return null;
    }
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
