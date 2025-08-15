
import { LLMClient, ChatMessage, ChatResponse } from '../../../../packages/contracts/ai/LLMClient.js';

export class OpenAIClient implements LLMClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    
    if (!this.apiKey) {
      console.warn('OpenAI API key not configured');
    }
  }

  async chat(messages: ChatMessage[], options?: any): Promise<ChatResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options?.model || 'gpt-3.5-turbo',
        messages,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 1500
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error('No response from OpenAI');
    }

    return {
      content: choice.message.content,
      metadata: {
        model: data.model,
        usage: data.usage,
        finishReason: choice.finish_reason
      }
    };
  }

  async completion(prompt: string, options?: any): Promise<ChatResponse> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }
}
