import { db } from '../connection.js';

export async function up(): Promise<void> {
  console.log('Running migration: 003_analytics_extensions');

  await db.query(`
    ALTER TABLE memories
    ADD COLUMN IF NOT EXISTS access_count INTEGER NOT NULL DEFAULT 0;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS personality_suggestions (
      id SERIAL PRIMARY KEY,
      trait VARCHAR(100) NOT NULL,
      suggested_value TEXT NOT NULL,
      reason TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMP
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_personality_suggestions_status
    ON personality_suggestions(status, created_at DESC);
  `);

  console.log('Migration 003_analytics_extensions completed successfully');
}

export async function down(): Promise<void> {
  console.log('Rolling back migration: 003_analytics_extensions');

  await db.query('DROP INDEX IF EXISTS idx_personality_suggestions_status;');
  await db.query('DROP TABLE IF EXISTS personality_suggestions;');

  await db.query(`
    ALTER TABLE memories
    DROP COLUMN IF EXISTS access_count;
  `);

  console.log('Migration 003_analytics_extensions rolled back successfully');
}
