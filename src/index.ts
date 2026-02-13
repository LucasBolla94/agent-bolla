import { env } from './config/env.js';
import { db } from './database/connection.js';
import { runMigrations } from './database/migrate.js';

async function main(): Promise<void> {
  console.log('🤖 Agent Bolla - Starting...');
  console.log(`Environment: ${env.NODE_ENV}`);
  console.log(`Log Level: ${env.LOG_LEVEL}`);

  try {
    // Test database connection
    console.log('Testing database connection...');
    const result = await db.query('SELECT NOW() as now;');
    console.log('Database connected successfully at:', result.rows[0].now);

    // Run migrations
    console.log('Running database migrations...');
    await runMigrations();

    console.log('✅ Agent Bolla initialized successfully!');
    console.log('Ready to start phase 1 implementation.');

  } catch (error) {
    console.error('❌ Error initializing agent:', error);
    process.exit(1);
  }
}

main();
