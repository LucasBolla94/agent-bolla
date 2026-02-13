import { db } from '../connection.js';

interface ConversationRow {
  id: number;
  user_id: number;
  channel: string;
  messages: unknown;
  created_at: Date;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationRecord {
  id: number;
  userId: number;
  channel: string;
  messages: ConversationMessage[];
  createdAt: Date;
}

const toConversation = (row: ConversationRow): ConversationRecord => ({
  id: row.id,
  userId: row.user_id,
  channel: row.channel,
  messages: Array.isArray(row.messages) ? (row.messages as ConversationMessage[]) : [],
  createdAt: row.created_at
});

export class ConversationsRepository {
  async getLatestByUserAndChannel(userId: number, channel: string): Promise<ConversationRecord | null> {
    const result = await db.query<ConversationRow>(
      `SELECT * FROM conversations
       WHERE user_id = $1 AND channel = $2
       ORDER BY id DESC
       LIMIT 1`,
      [userId, channel]
    );

    const row = result.rows[0];
    return row ? toConversation(row) : null;
  }

  async create(userId: number, channel: string): Promise<ConversationRecord> {
    const result = await db.query<ConversationRow>(
      `INSERT INTO conversations (user_id, channel, messages)
       VALUES ($1, $2, '[]'::jsonb)
       RETURNING *`,
      [userId, channel]
    );

    return toConversation(result.rows[0]);
  }

  async getOrCreate(userId: number, channel: string): Promise<ConversationRecord> {
    const existing = await this.getLatestByUserAndChannel(userId, channel);
    if (existing) return existing;
    return this.create(userId, channel);
  }

  async appendMessages(conversationId: number, messages: ConversationMessage[]): Promise<void> {
    if (messages.length === 0) return;

    await db.query(
      `UPDATE conversations
       SET messages = COALESCE(messages, '[]'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [conversationId, JSON.stringify(messages)]
    );
  }
}
