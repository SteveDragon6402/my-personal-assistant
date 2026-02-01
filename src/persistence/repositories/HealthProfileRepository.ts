import type { Database } from 'better-sqlite3';
import { getDatabase } from '../database.js';

export interface HealthProfile {
  chatId: string;
  heightCm?: number;
  weightKg?: number;
  gender?: string;
  age?: number;
  updatedAt: number;
}

type HealthProfileRow = {
  chat_id: string;
  height_cm: number | null;
  weight_kg: number | null;
  gender: string | null;
  age: number | null;
  updated_at: number;
};

export class HealthProfileRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDatabase();
  }

  get(chatId: string): HealthProfile | null {
    const row = this.db
      .prepare(
        `SELECT chat_id, height_cm, weight_kg, gender, age, updated_at
         FROM user_health_profiles WHERE chat_id = ?`
      )
      .get(chatId) as HealthProfileRow | undefined;

    if (!row) return null;

    const profile: HealthProfile = {
      chatId: row.chat_id,
      updatedAt: row.updated_at,
    };
    if (row.height_cm != null) profile.heightCm = row.height_cm;
    if (row.weight_kg != null) profile.weightKg = row.weight_kg;
    if (row.gender != null) profile.gender = row.gender;
    if (row.age != null) profile.age = row.age;
    return profile;
  }

  /**
   * Set or update health profile fields. Only provided fields are updated; others are preserved.
   */
  upsert(chatId: string, data: Partial<Omit<HealthProfile, 'chatId' | 'updatedAt'>>): HealthProfile {
    const existing = this.get(chatId);
    const merged: Omit<HealthProfile, 'updatedAt'> = {
      chatId,
      heightCm: data.heightCm !== undefined ? data.heightCm : existing?.heightCm,
      weightKg: data.weightKg !== undefined ? data.weightKg : existing?.weightKg,
      gender: data.gender !== undefined ? data.gender : existing?.gender,
      age: data.age !== undefined ? data.age : existing?.age,
    };

    this.db
      .prepare(
        `INSERT INTO user_health_profiles (chat_id, height_cm, weight_kg, gender, age, updated_at)
         VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
         ON CONFLICT(chat_id) DO UPDATE SET
           height_cm = excluded.height_cm,
           weight_kg = excluded.weight_kg,
           gender = excluded.gender,
           age = excluded.age,
           updated_at = strftime('%s', 'now')`
      )
      .run(
        chatId,
        merged.heightCm ?? null,
        merged.weightKg ?? null,
        merged.gender ?? null,
        merged.age ?? null
      );

    const row = this.db
      .prepare(`SELECT updated_at FROM user_health_profiles WHERE chat_id = ?`)
      .get(chatId) as { updated_at: number };
    return {
      ...merged,
      updatedAt: row.updated_at,
    };
  }
}
