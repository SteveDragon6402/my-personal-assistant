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

  getById(chatId: string, entryId: number): SleepLogEntry | null {
    const row = this.db
      .prepare('SELECT * FROM sleep_log WHERE id = ? AND chat_id = ?')
      .get(entryId, chatId) as SleepLogRow | undefined;
    if (!row) return null;
    return rowToEntry(row);
  }

  delete(chatId: string, entryId: number): boolean {
    const result = this.db.prepare('DELETE FROM sleep_log WHERE id = ? AND chat_id = ?').run(entryId, chatId);
    return result.changes > 0;
  }

  deleteLast(chatId: string): SleepLogEntry | null {
    const row = this.db
      .prepare('SELECT * FROM sleep_log WHERE chat_id = ? ORDER BY date DESC, created_at DESC LIMIT 1')
      .get(chatId) as SleepLogRow | undefined;
    if (!row) return null;
    this.db.prepare('DELETE FROM sleep_log WHERE id = ?').run(row.id);
    return rowToEntry(row);
  }

  /** Update only provided fields. Returns updated entry or null if not found. */
  update(
    chatId: string,
    entryId: number,
    partial: Partial<{
      rawText: string;
      date: string;
      sleepScore: number;
      timeSleptMinutes: number;
      deepSleepMinutes: number;
      remSleepMinutes: number;
      rhr: number;
      hrv: number;
      interruptions: number;
    }>
  ): SleepLogEntry | null {
    const existing = this.getById(chatId, entryId);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (partial.rawText !== undefined) {
      updates.push('raw_text = ?');
      values.push(partial.rawText);
    }
    if (partial.date !== undefined) {
      updates.push('date = ?');
      values.push(partial.date);
    }
    if (partial.sleepScore !== undefined) {
      updates.push('sleep_score = ?');
      values.push(partial.sleepScore);
    }
    if (partial.timeSleptMinutes !== undefined) {
      updates.push('time_slept_minutes = ?');
      values.push(partial.timeSleptMinutes);
    }
    if (partial.deepSleepMinutes !== undefined) {
      updates.push('deep_sleep_minutes = ?');
      values.push(partial.deepSleepMinutes);
    }
    if (partial.remSleepMinutes !== undefined) {
      updates.push('rem_sleep_minutes = ?');
      values.push(partial.remSleepMinutes);
    }
    if (partial.rhr !== undefined) {
      updates.push('rhr = ?');
      values.push(partial.rhr);
    }
    if (partial.hrv !== undefined) {
      updates.push('hrv = ?');
      values.push(partial.hrv);
    }
    if (partial.interruptions !== undefined) {
      updates.push('interruptions = ?');
      values.push(partial.interruptions);
    }

    if (updates.length === 0) return existing;

    values.push(entryId, chatId);
    this.db.prepare(`UPDATE sleep_log SET ${updates.join(', ')} WHERE id = ? AND chat_id = ?`).run(...values);
    return this.getById(chatId, entryId);
  }
}
