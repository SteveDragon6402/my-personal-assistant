import type { Database } from 'better-sqlite3';
import { getDatabase } from '../database.js';

export interface SleepLogEntry {
  id: number;
  chatId: string;
  date: string;
  rawText: string;
  /** Sleep quality score (0-100) */
  sleepScore?: number;
  /** Total time slept in minutes */
  timeSleptMinutes?: number;
  /** Deep sleep in minutes */
  deepSleepMinutes?: number;
  /** REM sleep in minutes */
  remSleepMinutes?: number;
  /** Resting heart rate (bpm) */
  rhr?: number;
  /** Heart rate variability (ms) */
  hrv?: number;
  /** Number of sleep interruptions */
  interruptions?: number;
  createdAt: number;
}

export type SleepLogInput = Omit<SleepLogEntry, 'id' | 'createdAt'>;

type SleepLogRow = {
  id: number;
  chat_id: string;
  date: string;
  raw_text: string;
  sleep_score?: number | null;
  time_slept_minutes?: number | null;
  deep_sleep_minutes?: number | null;
  rem_sleep_minutes?: number | null;
  rhr?: number | null;
  hrv?: number | null;
  interruptions?: number | null;
  created_at: number;
};

function rowToEntry(row: SleepLogRow): SleepLogEntry {
  const entry: SleepLogEntry = {
    id: row.id,
    chatId: row.chat_id,
    date: row.date,
    rawText: row.raw_text,
    createdAt: row.created_at,
  };
  if (row.sleep_score != null) entry.sleepScore = row.sleep_score;
  if (row.time_slept_minutes != null) entry.timeSleptMinutes = row.time_slept_minutes;
  if (row.deep_sleep_minutes != null) entry.deepSleepMinutes = row.deep_sleep_minutes;
  if (row.rem_sleep_minutes != null) entry.remSleepMinutes = row.rem_sleep_minutes;
  if (row.rhr != null) entry.rhr = row.rhr;
  if (row.hrv != null) entry.hrv = row.hrv;
  if (row.interruptions != null) entry.interruptions = row.interruptions;
  return entry;
}

export class SleepLogRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDatabase();
  }

  create(input: SleepLogInput): SleepLogEntry {
    const stmt = this.db.prepare(`
      INSERT INTO sleep_log (
        chat_id, date, raw_text,
        sleep_score, time_slept_minutes, deep_sleep_minutes, rem_sleep_minutes,
        rhr, hrv, interruptions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      input.chatId,
      input.date,
      input.rawText,
      input.sleepScore ?? null,
      input.timeSleptMinutes ?? null,
      input.deepSleepMinutes ?? null,
      input.remSleepMinutes ?? null,
      input.rhr ?? null,
      input.hrv ?? null,
      input.interruptions ?? null
    );
    return {
      id: Number(result.lastInsertRowid),
      ...input,
      createdAt: Date.now(),
    };
  }

  getLastNight(chatId: string): SleepLogEntry | null {
    const row = this.db
      .prepare(
        `SELECT * FROM sleep_log WHERE chat_id = ? ORDER BY date DESC LIMIT 1`
      )
      .get(chatId) as SleepLogRow | undefined;
    if (!row) return null;
    return rowToEntry(row);
  }

  getRange(chatId: string, startDate: string, endDate: string): SleepLogEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM sleep_log
         WHERE chat_id = ? AND date >= ? AND date <= ? ORDER BY date DESC`
      )
      .all(chatId, startDate, endDate) as SleepLogRow[];
    return rows.map(rowToEntry);
  }
}
