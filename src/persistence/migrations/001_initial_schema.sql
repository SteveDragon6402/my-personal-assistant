-- Initial schema migration
-- Creates all core tables for the personal assistant

-- Messages table
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

-- Meals table
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
  time_eaten INTEGER,
  meal_type TEXT,
  vitamin_a_mcg INTEGER,
  vitamin_c_mg INTEGER,
  vitamin_d_mcg INTEGER,
  vitamin_e_mg INTEGER,
  vitamin_k_mcg INTEGER,
  vitamin_b6_mg INTEGER,
  vitamin_b12_mcg INTEGER,
  folate_mcg INTEGER,
  iron_mg INTEGER,
  calcium_mg INTEGER,
  magnesium_mg INTEGER,
  zinc_mg INTEGER,
  potassium_mg INTEGER,
  selenium_mcg INTEGER,
  iodine_mcg INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
CREATE INDEX IF NOT EXISTS idx_meals_chat_date ON meals(chat_id, date);

-- Pending captures table
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

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  chat_id TEXT PRIMARY KEY,
  digest_time TEXT,
  timezone TEXT,
  include_sleep INTEGER DEFAULT 1,
  include_newsletters INTEGER DEFAULT 1,
  include_calendar INTEGER DEFAULT 1,
  include_capture_review INTEGER DEFAULT 1,
  lat REAL,
  lon REAL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- User health profiles table
CREATE TABLE IF NOT EXISTS user_health_profiles (
  chat_id TEXT PRIMARY KEY,
  height_cm REAL,
  weight_kg REAL,
  gender TEXT,
  age INTEGER,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Sleep log table
CREATE TABLE IF NOT EXISTS sleep_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  date TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  sleep_score INTEGER,
  time_slept_minutes INTEGER,
  deep_sleep_minutes INTEGER,
  rem_sleep_minutes INTEGER,
  rhr INTEGER,
  hrv INTEGER,
  interruptions INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sleep_log_chat_date ON sleep_log(chat_id, date);

-- Assistant responses table (for conversation history)
CREATE TABLE IF NOT EXISTS assistant_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_assistant_responses_chat ON assistant_responses(chat_id);
CREATE INDEX IF NOT EXISTS idx_assistant_responses_timestamp ON assistant_responses(timestamp);
