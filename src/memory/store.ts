import { db } from '../database/connection.js';
import { Memory, MemorySaveInput } from './types.js';

interface MemoryRow {
  id: number;
  content: string;
  embedding_text: string;
  category: string | null;
  source: string | null;
  created_at: Date;
}

const toMemory = (row: MemoryRow): Memory => ({
  id: row.id,
  content: row.content,
  embeddingText: row.embedding_text,
  category: row.category as Memory['category'],
  source: row.source as Memory['source'],
  createdAt: row.created_at,
});

export class MemoryStore {
  /**
   * Persist a memory to the database.
   */
  async save(input: MemorySaveInput): Promise<Memory> {
    const result = await db.query<MemoryRow>(
      `INSERT INTO memories (content, embedding_text, category, source)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.content, input.embeddingText, input.category ?? null, input.source ?? null]
    );

    return toMemory(result.rows[0]);
  }

  /**
   * Full-text search using PostgreSQL's 'simple' tsvector (language-agnostic).
   * Falls back to ILIKE when the query is too short for tsvector.
   * Returns top `limit` results ranked by relevance.
   */
  async search(query: string, limit = 10): Promise<Memory[]> {
    const trimmed = query.trim();

    if (trimmed.length === 0) return [];

    // For very short queries (1-2 words) tsvector works fine;
    // for longer queries plainto_tsquery is better than to_tsquery.
    const useFullText = trimmed.split(/\s+/).length >= 1;

    if (useFullText) {
      try {
        const result = await db.query<MemoryRow>(
          `SELECT *,
                  ts_rank(to_tsvector('simple', embedding_text), plainto_tsquery('simple', $1)) AS rank
           FROM memories
           WHERE to_tsvector('simple', embedding_text) @@ plainto_tsquery('simple', $1)
           ORDER BY rank DESC
           LIMIT $2`,
          [trimmed, limit]
        );

        if (result.rows.length > 0) {
          return result.rows.map(toMemory);
        }
      } catch {
        // Fall through to ILIKE
      }
    }

    // ILIKE fallback — slower but always works, even with single characters
    const result = await db.query<MemoryRow>(
      `SELECT * FROM memories
       WHERE embedding_text ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [`%${trimmed}%`, limit]
    );

    return result.rows.map(toMemory);
  }

  /**
   * Retrieve all memories for a given category.
   */
  async findByCategory(category: string, limit = 20): Promise<Memory[]> {
    const result = await db.query<MemoryRow>(
      `SELECT * FROM memories WHERE category = $1 ORDER BY created_at DESC LIMIT $2`,
      [category, limit]
    );

    return result.rows.map(toMemory);
  }

  /**
   * Count total stored memories.
   */
  async count(): Promise<number> {
    const result = await db.query<{ total: string }>('SELECT COUNT(*) as total FROM memories');
    return parseInt(result.rows[0].total, 10);
  }
}
