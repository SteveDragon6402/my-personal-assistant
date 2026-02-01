import Database from 'better-sqlite3';
import { createLogger } from '../utils/logger.js';
import { join, dirname as pathDirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

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

  // Run migrations
  runMigrations(db);

  return db;
}

function runMigrations(db: Database.Database): void {
  logger.info('Running database migrations');

  // Create messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      from_number TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      has_media INTEGER DEFAULT 0,
      media_url TEXT,
      media_type TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_number);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  `);

  // Create meals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      estimated_calories INTEGER,
      estimated_protein INTEGER,
      estimated_carbs INTEGER,
      estimated_fat INTEGER,
      image_path TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
    CREATE INDEX IF NOT EXISTS idx_meals_chat_date ON meals(chat_id, date);
  `);

  // Add chat_id to meals if missing (existing DBs created before per-user meals)
  const mealsInfo = db.prepare('PRAGMA table_info(meals)').all() as Array<{ name: string }>;
  const mealColumns = new Set(mealsInfo.map((c) => c.name));
  if (!mealColumns.has('chat_id')) {
    db.exec('ALTER TABLE meals ADD COLUMN chat_id TEXT');
    logger.info('Added chat_id column to meals table');
  }

  // Add micronutrient columns to meals (vitamins A,C,D,E,K, B6, B12, folate; minerals)
  const microColumns: [string, string][] = [
    ['vitamin_a_mcg', 'INTEGER'],
    ['vitamin_c_mg', 'INTEGER'],
    ['vitamin_d_mcg', 'INTEGER'],
    ['vitamin_e_mg', 'INTEGER'],
    ['vitamin_k_mcg', 'INTEGER'],
    ['vitamin_b6_mg', 'INTEGER'],
    ['vitamin_b12_mcg', 'INTEGER'],
    ['folate_mcg', 'INTEGER'],
    ['iron_mg', 'INTEGER'],
    ['calcium_mg', 'INTEGER'],
    ['magnesium_mg', 'INTEGER'],
    ['zinc_mg', 'INTEGER'],
    ['potassium_mg', 'INTEGER'],
    ['selenium_mcg', 'INTEGER'],
    ['iodine_mcg', 'INTEGER'],
  ];
  for (const [col, colType] of microColumns) {
    if (!mealColumns.has(col)) {
      db.exec(`ALTER TABLE meals ADD COLUMN ${col} ${colType}`);
      mealColumns.add(col);
      logger.info({ column: col }, 'Added micronutrient column to meals table');
    }
  }

  // Create pending_captures table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_captures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      suggested_category TEXT,
      confidence REAL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      resolved_at INTEGER,
      resolved_category TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_pending_captures_resolved ON pending_captures(resolved_at);
  `);

  // User preferences (per chat_id: digest time, timezone, section toggles, location)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      chat_id TEXT PRIMARY KEY,
      digest_time TEXT,
      timezone TEXT,
      include_sleep INTEGER DEFAULT 1,
      include_newsletters INTEGER DEFAULT 1,
      include_calendar INTEGER DEFAULT 1,
      include_capture_review INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Add lat/lon columns to user_preferences if missing (for weather in digest)
  const prefsInfo = db.prepare('PRAGMA table_info(user_preferences)').all() as Array<{ name: string }>;
  const prefsColumns = new Set(prefsInfo.map((c) => c.name));
  if (!prefsColumns.has('lat')) {
    db.exec('ALTER TABLE user_preferences ADD COLUMN lat REAL');
    logger.info('Added lat column to user_preferences table');
  }
  if (!prefsColumns.has('lon')) {
    db.exec('ALTER TABLE user_preferences ADD COLUMN lon REAL');
    logger.info('Added lon column to user_preferences table');
  }

  // User health profile (height, weight, gender, age for BMI and personalized nutrition)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_health_profiles (
      chat_id TEXT PRIMARY KEY,
      height_cm REAL,
      weight_kg REAL,
      gender TEXT,
      age INTEGER,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Manual sleep log (user forwards/pastes sleep summary text)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sleep_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      date TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sleep_log_chat_date ON sleep_log(chat_id, date);
  `);

  // Assistant responses (for conversation history)
  db.exec(`
    CREATE TABLE IF NOT EXISTS assistant_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_responses_chat ON assistant_responses(chat_id);
    CREATE INDEX IF NOT EXISTS idx_assistant_responses_timestamp ON assistant_responses(timestamp);
  `);

  logger.info('Database migrations completed');
}

export function closeDatabase(): void {
  if (db) {
    logger.info('Closing database connection');
    db.close();
    db = null;
  }
}
