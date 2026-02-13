import { db } from '../connection.js';

/**
 * Migration 002 — Fix memories full-text search index
 *
 * The original index used 'english' tsvector which does English-specific stemming.
 * Replaced with 'simple' (no stemming, language-agnostic) so the index works
 * correctly for Portuguese and any other language the agent operates in.
 */
export async function up(): Promise<void> {
  console.log('Running migration: 002_fix_memory_index');

  await db.query(`DROP INDEX IF EXISTS idx_memories_embedding_text;`);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_memories_embedding_text_simple
    ON memories USING GIN(to_tsvector('simple', embedding_text));
  `);

  console.log('Migration 002_fix_memory_index completed successfully');
}

export async function down(): Promise<void> {
  console.log('Rolling back migration: 002_fix_memory_index');

  await db.query(`DROP INDEX IF EXISTS idx_memories_embedding_text_simple;`);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_memories_embedding_text
    ON memories USING GIN(to_tsvector('english', embedding_text));
  `);

  console.log('Migration 002_fix_memory_index rolled back successfully');
}
