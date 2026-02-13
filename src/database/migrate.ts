import { db } from './connection.js';
import * as migration001 from './migrations/001_create_tables.js';

interface Migration {
  id: number;
  name: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
}

const migrations: Migration[] = [
  {
    id: 1,
    name: '001_create_tables',
    up: migration001.up,
    down: migration001.down
  }
];

async function createMigrationsTable(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

async function getExecutedMigrations(): Promise<number[]> {
  const result = await db.query<{ id: number }>('SELECT id FROM migrations ORDER BY id;');
  return result.rows.map(row => row.id);
}

async function recordMigration(id: number, name: string): Promise<void> {
  await db.query('INSERT INTO migrations (id, name) VALUES ($1, $2);', [id, name]);
}

async function removeMigration(id: number): Promise<void> {
  await db.query('DELETE FROM migrations WHERE id = $1;', [id]);
}

export async function runMigrations(): Promise<void> {
  console.log('Starting database migrations...');

  await createMigrationsTable();
  const executed = await getExecutedMigrations();

  for (const migration of migrations) {
    if (!executed.includes(migration.id)) {
      console.log(`Running migration: ${migration.name}`);
      await migration.up();
      await recordMigration(migration.id, migration.name);
      console.log(`Migration ${migration.name} completed`);
    } else {
      console.log(`Migration ${migration.name} already executed, skipping`);
    }
  }

  console.log('All migrations completed successfully');
}

export async function rollbackMigration(): Promise<void> {
  console.log('Rolling back last migration...');

  await createMigrationsTable();
  const executed = await getExecutedMigrations();

  if (executed.length === 0) {
    console.log('No migrations to rollback');
    return;
  }

  const lastMigrationId = executed[executed.length - 1];
  const migration = migrations.find(m => m.id === lastMigrationId);

  if (!migration) {
    throw new Error(`Migration ${lastMigrationId} not found`);
  }

  console.log(`Rolling back migration: ${migration.name}`);
  await migration.down();
  await removeMigration(migration.id);
  console.log(`Migration ${migration.name} rolled back successfully`);
}

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  if (command === 'up') {
    runMigrations()
      .then(() => {
        console.log('Migrations completed');
        process.exit(0);
      })
      .catch(err => {
        console.error('Migration error:', err);
        process.exit(1);
      });
  } else if (command === 'down') {
    rollbackMigration()
      .then(() => {
        console.log('Rollback completed');
        process.exit(0);
      })
      .catch(err => {
        console.error('Rollback error:', err);
        process.exit(1);
      });
  } else {
    console.log('Usage: node dist/database/migrate.js [up|down]');
    process.exit(1);
  }
}
