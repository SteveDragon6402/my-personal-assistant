-- Create weight_log table
CREATE TABLE IF NOT EXISTS weight_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  date TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_weight_log_chat_date ON weight_log(chat_id, date);
