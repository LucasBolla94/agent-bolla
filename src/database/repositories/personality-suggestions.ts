import { db } from '../connection.js';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected';

interface PersonalitySuggestionRow {
  id: number;
  trait: string;
  suggested_value: string;
  reason: string;
  status: SuggestionStatus;
  metadata: Record<string, unknown>;
  created_at: Date;
  reviewed_at: Date | null;
}

export interface PersonalitySuggestion {
  id: number;
  trait: string;
  suggestedValue: string;
  reason: string;
  status: SuggestionStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  reviewedAt: Date | null;
}

const toSuggestion = (row: PersonalitySuggestionRow): PersonalitySuggestion => ({
  id: row.id,
  trait: row.trait,
  suggestedValue: row.suggested_value,
  reason: row.reason,
  status: row.status,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  reviewedAt: row.reviewed_at
});

export class PersonalitySuggestionsRepository {
  async create(input: {
    trait: string;
    suggestedValue: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }): Promise<PersonalitySuggestion> {
    const result = await db.query<PersonalitySuggestionRow>(
      `INSERT INTO personality_suggestions (trait, suggested_value, reason, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.trait,
        input.suggestedValue,
        input.reason,
        JSON.stringify(input.metadata ?? {})
      ]
    );

    return toSuggestion(result.rows[0]);
  }

  async listPending(limit = 10): Promise<PersonalitySuggestion[]> {
    const result = await db.query<PersonalitySuggestionRow>(
      `SELECT * FROM personality_suggestions
       WHERE status = 'pending'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(toSuggestion);
  }

  async findById(id: number): Promise<PersonalitySuggestion | null> {
    const result = await db.query<PersonalitySuggestionRow>(
      'SELECT * FROM personality_suggestions WHERE id = $1 LIMIT 1',
      [id]
    );

    const row = result.rows[0];
    return row ? toSuggestion(row) : null;
  }

  async setStatus(id: number, status: SuggestionStatus): Promise<PersonalitySuggestion | null> {
    const result = await db.query<PersonalitySuggestionRow>(
      `UPDATE personality_suggestions
       SET status = $1, reviewed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    const row = result.rows[0];
    return row ? toSuggestion(row) : null;
  }
}
