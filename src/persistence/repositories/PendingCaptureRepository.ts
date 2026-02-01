import type { Database } from 'better-sqlite3';
import { getDatabase } from '../database.js';

export interface PendingCapture {
  id: number;
  content: string;
  suggestedCategory?: string;
  confidence?: number;
  createdAt: number;
  resolvedAt?: number;
  resolvedCategory?: string;
}

export class PendingCaptureRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db || getDatabase();
  }

  create(capture: Omit<PendingCapture, 'id' | 'createdAt'>): PendingCapture {
    const stmt = this.db.prepare(`
      INSERT INTO pending_captures (content, suggested_category, confidence)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(
      capture.content,
      capture.suggestedCategory ?? null,
      capture.confidence ?? null
    );

    return {
      id: Number(result.lastInsertRowid),
      ...capture,
      createdAt: Date.now(),
    };
  }

  getUnresolved(): PendingCapture[] {
    const stmt = this.db.prepare(
      'SELECT * FROM pending_captures WHERE resolved_at IS NULL ORDER BY created_at DESC'
    );
    const rows = stmt.all() as Array<{
      id: number;
      content: string;
      suggested_category: string | null;
      confidence: number | null;
      created_at: number;
      resolved_at: number | null;
      resolved_category: string | null;
    }>;

    return rows.map((row) => {
      const capture: PendingCapture = {
        id: row.id,
        content: row.content,
        createdAt: row.created_at,
      };
      if (row.suggested_category !== null) {
        capture.suggestedCategory = row.suggested_category;
      }
      if (row.confidence !== null) {
        capture.confidence = row.confidence;
      }
      if (row.resolved_at !== null) {
        capture.resolvedAt = row.resolved_at;
      }
      if (row.resolved_category !== null) {
        capture.resolvedCategory = row.resolved_category;
      }
      return capture;
    });
  }

  resolve(id: number, category: string): void {
    const stmt = this.db.prepare(
      'UPDATE pending_captures SET resolved_at = ?, resolved_category = ? WHERE id = ?'
    );
    stmt.run(Date.now(), category, id);
  }
}
