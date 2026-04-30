import type { Database } from 'better-sqlite3';
import { getDatabase } from '../database.js';

export interface WeightLogEntry {
  id?: number;
  chatId: string;
  date: string;
  weightKg: number;
  notes?: string;
  createdAt?: number;
}

type WeightLogRow = {
  id: number;
  chat_id: string;
  date: string;
  weight_kg: number;
  notes: string | null;
  created_at: number;
};

function mapRow(row: WeightLogRow): WeightLogEntry {
  return {
    id: row.id,
    chatId: row.chat_id,
    date: row.date,
    weightKg: row.weight_kg,
    notes: row.notes || undefined,
    createdAt: row.created_at,
  };
}

export class WeightLogRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDatabase();
  }

  save(entry: Omit<WeightLogEntry, 'id' | 'createdAt'>): number {
    const result = this.db
      .prepare(
        `INSERT INTO weight_log (chat_id, date, weight_kg, notes)
         VALUES (?, ?, ?, ?)`
      )
      .run(entry.chatId, entry.date, entry.weightKg, entry.notes || null);

    // Also optionally update the health profile to have the latest weight if needed,
    // but typically it's handled by Tools explicitly or kept normalized.
    // The instructions say "store daily log alongside updating the health profile",
    // so the agent can do both or we do it here. We'll let the agent manage it.

    return result.lastInsertRowid as number;
  }

  getByDate(chatId: string, date: string): WeightLogEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, chat_id, date, weight_kg, notes, created_at 
         FROM weight_log 
         WHERE chat_id = ? AND date = ? 
         ORDER BY id DESC`
      )
      .all(chatId, date) as WeightLogRow[];

    return rows.map(mapRow);
  }

  getRange(chatId: string, startDate: string, endDate: string): WeightLogEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, chat_id, date, weight_kg, notes, created_at 
         FROM weight_log 
         WHERE chat_id = ? AND date >= ? AND date <= ?
         ORDER BY date DESC, id DESC`
      )
      .all(chatId, startDate, endDate) as WeightLogRow[];

    return rows.map(mapRow);
  }

  getLast(chatId: string): WeightLogEntry | null {
    const row = this.db
      .prepare(
        `SELECT id, chat_id, date, weight_kg, notes, created_at 
         FROM weight_log 
         WHERE chat_id = ? 
         ORDER BY date DESC, id DESC LIMIT 1`
      )
      .get(chatId) as WeightLogRow | undefined;

    return row ? mapRow(row) : null;
  }

  delete(chatId: string, id?: number): boolean {
    if (id) {
      const result = this.db
        .prepare(`DELETE FROM weight_log WHERE chat_id = ? AND id = ?`)
        .run(chatId, id);
      return result.changes > 0;
    } else {
      // Delete the most recent log
      const last = this.getLast(chatId);
      if (last && last.id) {
        const result = this.db.prepare(`DELETE FROM weight_log WHERE id = ?`).run(last.id);
        return result.changes > 0;
      }
      return false;
    }
  }

  update(
    chatId: string,
    id: number,
    fields: Partial<Pick<WeightLogEntry, 'weightKg' | 'notes' | 'date'>>
  ): boolean {
    const sets: string[] = [];
    const values: any[] = [];

    if (fields.weightKg !== undefined) {
      sets.push('weight_kg = ?');
      values.push(fields.weightKg);
    }
    if (fields.notes !== undefined) {
      sets.push('notes = ?');
      values.push(fields.notes);
    }
    if (fields.date !== undefined) {
      sets.push('date = ?');
      values.push(fields.date);
    }

    if (sets.length === 0) return false;

    values.push(chatId, id);

    const result = this.db
      .prepare(
        `UPDATE weight_log 
         SET ${sets.join(', ')} 
         WHERE chat_id = ? AND id = ?`
      )
      .run(...values);

    return result.changes > 0;
  }
}
