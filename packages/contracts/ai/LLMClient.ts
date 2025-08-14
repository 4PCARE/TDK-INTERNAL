/**
 * Provider-agnostic interface for Large Language Model clients
 * Supports OpenAI, Anthropic, Vertex AI, Cohere, Ollama, vLLM
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  stream?: boolean;
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: ChatMessage;
    finishReason: string;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface VisionOptions {
  image: string | Buffer;
  imageType?: string;
}

/**
 * Provider-agnostic LLM client interface
 */
export interface LLMClient {
  /**
   * Chat completion with message history and optional tool use
   */
  chat(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<ChatCompletionResponse>;
  
  /**
   * Simple text completion
   */
  completion(prompt: string, options?: ChatCompletionOptions): Promise<string>;
  
  /**
   * Vision capabilities (optional - not all providers support)
   */
  vision?(image: string | Buffer, prompt: string, options?: VisionOptions): Promise<string>;
}