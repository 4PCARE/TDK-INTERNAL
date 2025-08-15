
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ChatSession {
  id: string;
  userId: string;
  messages: Message[];
  context?: {
    documentIds?: string[];
    systemPrompt?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class ChatSessionEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly messages: Message[] = [],
    public readonly context?: ChatSession['context'],
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date()
  ) {}

  addMessage(message: Omit<Message, 'id' | 'timestamp'>): ChatSessionEntity {
    const newMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date()
    };

    return new ChatSessionEntity(
      this.id,
      this.userId,
      [...this.messages, newMessage],
      this.context,
      this.createdAt,
      new Date()
    );
  }
}
