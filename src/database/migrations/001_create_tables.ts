import { db } from '../connection.js';

export async function up(): Promise<void> {
  console.log('Running migration: 001_create_tables');

  // Table: users
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) UNIQUE,
      telegram_id VARCHAR(50) UNIQUE,
      role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'user')),
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Table: conversations
  await db.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      channel VARCHAR(50) NOT NULL,
      messages JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Table: memories
  await db.query(`
    CREATE TABLE IF NOT EXISTS memories (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      embedding_text TEXT NOT NULL,
      category VARCHAR(100),
      source VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Create index for faster text search
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_memories_embedding_text
    ON memories USING GIN(to_tsvector('english', embedding_text));
  `);

  // Table: training_data
  await db.query(`
    CREATE TABLE IF NOT EXISTS training_data (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      input TEXT NOT NULL,
      context TEXT,
      output TEXT NOT NULL,
      quality_score DECIMAL(3, 2),
      source VARCHAR(50) NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Table: personality
  await db.query(`
    CREATE TABLE IF NOT EXISTS personality (
      id SERIAL PRIMARY KEY,
      trait VARCHAR(100) NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Table: tweets
  await db.query(`
    CREATE TABLE IF NOT EXISTS tweets (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      type VARCHAR(20) NOT NULL CHECK (type IN ('post', 'reply', 'quote')),
      engagement JSONB DEFAULT '{"likes": 0, "retweets": 0, "replies": 0}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Table: study_sessions
  await db.query(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id SERIAL PRIMARY KEY,
      topic VARCHAR(255) NOT NULL,
      findings TEXT NOT NULL,
      source_urls TEXT[],
      training_data_generated INTEGER DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Table: code_improvements
  await db.query(`
    CREATE TABLE IF NOT EXISTS code_improvements (
      id SERIAL PRIMARY KEY,
      file VARCHAR(500) NOT NULL,
      description TEXT NOT NULL,
      diff TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  console.log('Migration 001_create_tables completed successfully');
}

export async function down(): Promise<void> {
  console.log('Rolling back migration: 001_create_tables');

  await db.query('DROP TABLE IF EXISTS code_improvements CASCADE;');
  await db.query('DROP TABLE IF EXISTS study_sessions CASCADE;');
  await db.query('DROP TABLE IF EXISTS tweets CASCADE;');
  await db.query('DROP TABLE IF EXISTS personality CASCADE;');
  await db.query('DROP TABLE IF EXISTS training_data CASCADE;');
  await db.query('DROP TABLE IF EXISTS memories CASCADE;');
  await db.query('DROP TABLE IF EXISTS conversations CASCADE;');
  await db.query('DROP TABLE IF EXISTS users CASCADE;');

  console.log('Migration 001_create_tables rolled back successfully');
}
