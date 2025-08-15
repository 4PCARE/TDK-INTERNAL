/**
 * Provider-agnostic interface for Large Language Model clients
 * Supports OpenAI, Anthropic, Vertex AI, Cohere, Ollama, vLLM
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  content: string;
  metadata?: {
    model?: string;
    usage?: any;
    finishReason?: string;
    [key: string]: any;
  };
}

/**
 * Provider-agnostic LLM client interface
 */
export interface LLMClient {
  chat(messages: ChatMessage[], options?: any): Promise<ChatResponse>;
  completion(prompt: string, options?: any): Promise<ChatResponse>;
}