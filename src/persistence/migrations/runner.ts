import type { Database } from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createLogger({ component: 'migrations' });

interface MigrationRecord {
  id: number;
  name: string;
  applied_at: number;
}

export function runMigrations(db: Database): void {
  logger.info('Running database migrations');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  const appliedMigrations = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as MigrationRecord[]).map((r) => r.name)
  );

  const migrationsDir = __dirname;
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const filename of migrationFiles) {
    if (appliedMigrations.has(filename)) {
      logger.debug({ migration: filename }, 'Migration already applied');
      continue;
    }

    const filepath = join(migrationsDir, filename);
    const sql = readFileSync(filepath, 'utf-8');

    logger.info({ migration: filename }, 'Applying migration');

    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(filename);
      logger.info({ migration: filename }, 'Migration applied successfully');
    } catch (error) {
      logger.error({ migration: filename, error }, 'Migration failed');
      throw error;
    }
  }

  logger.info('Database migrations completed');
}
