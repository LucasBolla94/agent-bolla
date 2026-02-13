export type ConversationRole = 'user' | 'assistant';

export interface ShortTermMessage {
  role: ConversationRole;
  content: string;
  createdAt: Date;
}

/**
 * In-memory short-term memory for active conversations.
 * Keeps only the last N messages for each conversation.
 */
export class ShortTermMemory {
  private readonly conversations = new Map<string, ShortTermMessage[]>();

  constructor(private readonly maxMessages = 10) {}

  addMessage(conversationId: string, message: Omit<ShortTermMessage, 'createdAt'>): void {
    const messages = this.conversations.get(conversationId) ?? [];
    messages.push({ ...message, createdAt: new Date() });

    if (messages.length > this.maxMessages) {
      messages.splice(0, messages.length - this.maxMessages);
    }

    this.conversations.set(conversationId, messages);
  }

  getMessages(conversationId: string): ShortTermMessage[] {
    return [...(this.conversations.get(conversationId) ?? [])];
  }

  count(conversationId: string): number {
    return this.conversations.get(conversationId)?.length ?? 0;
  }

  clear(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  formatContext(conversationId: string): string {
    const messages = this.getMessages(conversationId);

    if (messages.length === 0) return '';

    const lines = messages.map((message) => {
      const speaker = message.role === 'user' ? 'User' : 'Agent';
      return `- ${speaker}: ${message.content}`;
    });

    return `Short-term conversation context (latest ${messages.length} messages):\n${lines.join('\n')}`;
  }
}
