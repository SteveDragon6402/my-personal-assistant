import Database from 'better-sqlite3';
import { createLogger } from '../utils/logger.js';
import { join, dirname as pathDirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { runMigrations } from './migrations/runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const logger = createLogger({ component: 'database' });

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = process.env.DATABASE_PATH || join(__dirname, '../../data', 'assistant.db');
  logger.info({ dbPath }, 'Initializing database');

  // Ensure data directory exists
  const dbDir = pathDirname(dbPath);
  try {
    mkdirSync(dbDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore error
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations from SQL files
  runMigrations(db);

  return db;
}

export function closeDatabase(): void {
  if (db) {
    logger.info('Closing database connection');
    db.close();
    db = null;
  }
}
