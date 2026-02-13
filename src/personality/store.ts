import { db } from '../database/connection.js';
import { PersonalityMap, PersonalityTrait } from './types.js';

interface PersonalityRow {
  id: number;
  trait: string;
  value: string;
  updated_at: Date;
}

const toTrait = (row: PersonalityRow): PersonalityTrait => ({
  id: row.id,
  trait: row.trait,
  value: row.value,
  updatedAt: row.updated_at,
});

export class PersonalityStore {
  /**
   * Load all traits from the database as a flat key→value map.
   */
  async getAll(): Promise<PersonalityMap> {
    const result = await db.query<PersonalityRow>(
      'SELECT * FROM personality ORDER BY trait ASC'
    );

    return Object.fromEntries(result.rows.map((row) => [row.trait, row.value]));
  }

  /**
   * Get a single trait value. Returns null if not found.
   */
  async get(trait: string): Promise<string | null> {
    const result = await db.query<PersonalityRow>(
      'SELECT * FROM personality WHERE trait = $1',
      [trait]
    );

    return result.rows[0]?.value ?? null;
  }

  /**
   * Upsert a trait value (insert or update on conflict).
   */
  async set(trait: string, value: string): Promise<PersonalityTrait> {
    const result = await db.query<PersonalityRow>(
      `INSERT INTO personality (trait, value)
       VALUES ($1, $2)
       ON CONFLICT (trait) DO UPDATE
         SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING *`,
      [trait, value]
    );

    return toTrait(result.rows[0]);
  }

  /**
   * Seed default traits — inserts only if the trait doesn't exist yet.
   * Safe to call on every startup.
   */
  async seed(defaults: PersonalityMap): Promise<void> {
    for (const [trait, value] of Object.entries(defaults)) {
      await db.query(
        `INSERT INTO personality (trait, value)
         VALUES ($1, $2)
         ON CONFLICT (trait) DO NOTHING`,
        [trait, value]
      );
    }
  }
}
