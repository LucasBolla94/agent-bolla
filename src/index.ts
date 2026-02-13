import { env } from './config/env.js';
import { createAiClients, createRouter } from './ai/index.js';
import { db } from './database/connection.js';
import { runMigrations } from './database/migrate.js';
import { collector } from './training/index.js';

async function main(): Promise<void> {
  console.log('Agent Bolla - Starting...');
  console.log(`Environment: ${env.NODE_ENV}`);
  console.log(`Log Level: ${env.LOG_LEVEL}`);

  try {
    // Database
    console.log('Testing database connection...');
    const result = await db.query('SELECT NOW() as now;');
    console.log('Database connected at:', result.rows[0].now);

    console.log('Running database migrations...');
    await runMigrations();

    // AI clients + router (phase 1.1 / 1.2)
    const aiClients = createAiClients();
    const router = createRouter(aiClients);
    const availableProviders = [
      aiClients.ollama.provider,
      aiClients.anthropic?.provider,
      aiClients.grok?.provider,
    ].filter(Boolean);
    console.log('AI clients initialized:', availableProviders.join(', '));
    console.log('AI router ready.');

    // Training data collector (phase 1.3)
    const stats = await collector.stats();
    console.log(`Training data collector ready. Entries so far: ${stats.total}`);

    console.log('Agent Bolla initialized successfully!');
    console.log('Phases 1.1 / 1.2 / 1.3 complete.');

    // Expose for use in subsequent phases
    void router;

  } catch (error) {
    console.error('Error initializing agent:', error);
    process.exit(1);
  }
}

main();
