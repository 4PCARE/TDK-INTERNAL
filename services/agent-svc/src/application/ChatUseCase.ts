
import { ChatSessionEntity, Message } from '../domain/ChatSession.js';
import { LLMClient } from '../../../packages/contracts/ai/LLMClient.js';

export interface ChatRequest {
  userId: string;
  message: string;
  sessionId?: string;
  documentContext?: string[];
}

export interface ChatResponse {
  sessionId: string;
  response: string;
  metadata?: Record<string, any>;
}

export class ChatUseCase {
  constructor(
    private llmClient: LLMClient,
    private sessionStore: Map<string, ChatSessionEntity> = new Map()
  ) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Get or create session
    let session = request.sessionId ? 
      this.sessionStore.get(request.sessionId) : 
      undefined;

    if (!session) {
      const sessionId = crypto.randomUUID();
      session = new ChatSessionEntity(sessionId, request.userId);
    }

    // Add user message
    session = session.addMessage({
      role: 'user',
      content: request.message
    });

    // Prepare messages for LLM
    const messages = this.prepareMessages(session, request.documentContext);

    try {
      // Get AI response
      const response = await this.llmClient.chat(messages);
      
      // Add assistant response
      session = session.addMessage({
        role: 'assistant',
        content: response.content
      });

      // Store updated session
      this.sessionStore.set(session.id, session);

      return {
        sessionId: session.id,
        response: response.content,
        metadata: response.metadata
      };
    } catch (error) {
      throw new Error(`Chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private prepareMessages(session: ChatSessionEntity, documentContext?: string[]): any[] {
    const messages: any[] = [];

    // Add system prompt if available
    if (session.context?.systemPrompt) {
      messages.push({
        role: 'system',
        content: session.context.systemPrompt
      });
    }

    // Add document context if provided
    if (documentContext && documentContext.length > 0) {
      const contextMessage = `Context from documents:\n${documentContext.join('\n\n')}`;
      messages.push({
        role: 'system',
        content: contextMessage
      });
    }

    // Add conversation history (last 10 messages to keep within token limits)
    const recentMessages = session.messages.slice(-10);
    messages.push(...recentMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    })));

    return messages;
  }

  getSession(sessionId: string): ChatSessionEntity | undefined {
    return this.sessionStore.get(sessionId);
  }
}
