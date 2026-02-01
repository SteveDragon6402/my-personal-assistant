import type { Database } from 'better-sqlite3';
import { getDatabase } from '../database.js';

export interface UserPreferences {
  chatId: string;
  digestTime?: string;
  timezone?: string;
  includeSleep: boolean;
  includeNewsletters: boolean;
  includeCalendar: boolean;
  includeCaptureReview: boolean;
  updatedAt: number;
}

const DEFAULT_PREFS: Omit<UserPreferences, 'chatId' | 'updatedAt'> = {
  includeSleep: true,
  includeNewsletters: true,
  includeCalendar: true,
  includeCaptureReview: true,
};

export class UserPreferencesRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDatabase();
  }

  get(chatId: string): UserPreferences | null {
    const row = this.db
      .prepare(
        `SELECT chat_id, digest_time, timezone, include_sleep, include_newsletters, include_calendar, include_capture_review, updated_at
         FROM user_preferences WHERE chat_id = ?`
      )
      .get(chatId) as {
      chat_id: string;
      digest_time: string | null;
      timezone: string | null;
      include_sleep: number;
      include_newsletters: number;
      include_calendar: number;
      include_capture_review: number;
      updated_at: number;
    } | undefined;

    if (!row) return null;
    return {
      chatId: row.chat_id,
      digestTime: row.digest_time ?? undefined,
      timezone: row.timezone ?? undefined,
      includeSleep: row.include_sleep === 1,
      includeNewsletters: row.include_newsletters === 1,
      includeCalendar: row.include_calendar === 1,
      includeCaptureReview: row.include_capture_review === 1,
      updatedAt: row.updated_at,
    };
  }

  getOrDefault(chatId: string, defaults: { digestTime?: string; timezone?: string }): UserPreferences {
    const existing = this.get(chatId);
    if (existing) return existing;
    return {
      chatId,
      digestTime: defaults.digestTime,
      timezone: defaults.timezone,
      ...DEFAULT_PREFS,
      updatedAt: 0,
    };
  }

  upsert(prefs: Partial<UserPreferences> & { chatId: string }): void {
    const existing = this.get(prefs.chatId);
    const digestTime = prefs.digestTime ?? existing?.digestTime ?? null;
    const timezone = prefs.timezone ?? existing?.timezone ?? null;
    const includeSleep = prefs.includeSleep ?? existing?.includeSleep ?? true;
    const includeNewsletters = prefs.includeNewsletters ?? existing?.includeNewsletters ?? true;
    const includeCalendar = prefs.includeCalendar ?? existing?.includeCalendar ?? true;
    const includeCaptureReview = prefs.includeCaptureReview ?? existing?.includeCaptureReview ?? true;

    this.db
      .prepare(
        `INSERT INTO user_preferences (chat_id, digest_time, timezone, include_sleep, include_newsletters, include_calendar, include_capture_review, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
         ON CONFLICT(chat_id) DO UPDATE SET
           digest_time = excluded.digest_time,
           timezone = excluded.timezone,
           include_sleep = excluded.include_sleep,
           include_newsletters = excluded.include_newsletters,
           include_calendar = excluded.include_calendar,
           include_capture_review = excluded.include_capture_review,
           updated_at = strftime('%s', 'now')`
      )
      .run(
        prefs.chatId,
        digestTime,
        timezone,
        includeSleep ? 1 : 0,
        includeNewsletters ? 1 : 0,
        includeCalendar ? 1 : 0,
        includeCaptureReview ? 1 : 0
      );
  }

  /** Chat IDs that have ever had preferences set (for digest scheduling). */
  getAllChatIds(): string[] {
    const rows = this.db.prepare('SELECT chat_id FROM user_preferences').all() as { chat_id: string }[];
    return rows.map((r) => r.chat_id);
  }
}
