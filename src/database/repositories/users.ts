import { db } from '../connection.js';

export type UserRole = 'owner' | 'user';

export interface UserRecord {
  id: number;
  phone: string | null;
  telegramId: string | null;
  role: UserRole;
  name: string;
  createdAt: Date;
}

interface UserRow {
  id: number;
  phone: string | null;
  telegram_id: string | null;
  role: UserRole;
  name: string;
  created_at: Date;
}

const toUserRecord = (row: UserRow): UserRecord => ({
  id: row.id,
  phone: row.phone,
  telegramId: row.telegram_id,
  role: row.role,
  name: row.name,
  createdAt: row.created_at
});

export class UsersRepository {
  async findByPhone(phone: string): Promise<UserRecord | null> {
    const result = await db.query<UserRow>(
      'SELECT * FROM users WHERE phone = $1 LIMIT 1',
      [phone]
    );

    const row = result.rows[0];
    return row ? toUserRecord(row) : null;
  }

  async create(input: { phone: string; role: UserRole; name: string }): Promise<UserRecord> {
    const result = await db.query<UserRow>(
      `INSERT INTO users (phone, role, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.phone, input.role, input.name]
    );

    return toUserRecord(result.rows[0]);
  }

  async findByTelegramId(telegramId: string): Promise<UserRecord | null> {
    const result = await db.query<UserRow>(
      'SELECT * FROM users WHERE telegram_id = $1 LIMIT 1',
      [telegramId]
    );

    const row = result.rows[0];
    return row ? toUserRecord(row) : null;
  }

  async createFromTelegram(input: { telegramId: string; role: UserRole; name: string }): Promise<UserRecord> {
    const result = await db.query<UserRow>(
      `INSERT INTO users (telegram_id, role, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.telegramId, input.role, input.name]
    );

    return toUserRecord(result.rows[0]);
  }

  async getOrCreateByPhone(input: { phone: string; ownerPhone?: string; name?: string }): Promise<UserRecord> {
    const existing = await this.findByPhone(input.phone);
    if (existing) return existing;

    const isOwner = input.ownerPhone && input.phone === input.ownerPhone;
    return this.create({
      phone: input.phone,
      role: isOwner ? 'owner' : 'user',
      name: input.name ?? `WhatsApp ${input.phone}`
    });
  }

  async getOrCreateByTelegramId(input: {
    telegramId: string;
    ownerTelegramId?: string;
    name?: string;
  }): Promise<UserRecord> {
    const existing = await this.findByTelegramId(input.telegramId);
    if (existing) return existing;

    const isOwner = input.ownerTelegramId && input.telegramId === input.ownerTelegramId;
    return this.createFromTelegram({
      telegramId: input.telegramId,
      role: isOwner ? 'owner' : 'user',
      name: input.name ?? `Telegram ${input.telegramId}`
    });
  }
}
