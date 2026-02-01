import type { Database } from 'better-sqlite3';
import { getDatabase } from '../database.js';

export interface SleepLogEntry {
  id: number;
  chatId: string;
  date: string;
  rawText: string;
  createdAt: number;
}

export class SleepLogRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDatabase();
  }

  create(chatId: string, date: string, rawText: string): SleepLogEntry {
    const stmt = this.db.prepare(
      `INSERT INTO sleep_log (chat_id, date, raw_text) VALUES (?, ?, ?)`
    );
    const result = stmt.run(chatId, date, rawText);
    return {
      id: Number(result.lastInsertRowid),
      chatId,
      date,
      rawText,
      createdAt: Date.now(),
    };
  }

  getLastNight(chatId: string): SleepLogEntry | null {
    const row = this.db
      .prepare(
        `SELECT id, chat_id, date, raw_text, created_at FROM sleep_log
         WHERE chat_id = ? ORDER BY date DESC LIMIT 1`
      )
      .get(chatId) as {
      id: number;
      chat_id: string;
      date: string;
      raw_text: string;
      created_at: number;
    } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      chatId: row.chat_id,
      date: row.date,
      rawText: row.raw_text,
      createdAt: row.created_at,
    };
  }

  getRange(chatId: string, startDate: string, endDate: string): SleepLogEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, chat_id, date, raw_text, created_at FROM sleep_log
         WHERE chat_id = ? AND date >= ? AND date <= ? ORDER BY date DESC`
      )
      .all(chatId, startDate, endDate) as Array<{
      id: number;
      chat_id: string;
      date: string;
      raw_text: string;
      created_at: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      chatId: row.chat_id,
      date: row.date,
      rawText: row.raw_text,
      createdAt: row.created_at,
    }));
  }
}
