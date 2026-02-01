import type { Database } from 'better-sqlite3';
import { getDatabase } from '../database.js';

export interface Meal {
  id: number;
  chatId: string;
  date: string;
  description: string;
  estimatedCalories?: number;
  estimatedProtein?: number;
  estimatedCarbs?: number;
  estimatedFat?: number;
  imagePath?: string;
  createdAt: number;
}

export class MealRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db || getDatabase();
  }

  create(meal: Omit<Meal, 'id' | 'createdAt'>): Meal {
    const stmt = this.db.prepare(`
      INSERT INTO meals (chat_id, date, description, estimated_calories, estimated_protein, estimated_carbs, estimated_fat, image_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      meal.chatId,
      meal.date,
      meal.description,
      meal.estimatedCalories ?? null,
      meal.estimatedProtein ?? null,
      meal.estimatedCarbs ?? null,
      meal.estimatedFat ?? null,
      meal.imagePath ?? null
    );

    return {
      id: Number(result.lastInsertRowid),
      ...meal,
      createdAt: Date.now(),
    };
  }

  getByDate(chatId: string, date: string): Meal[] {
    const stmt = this.db.prepare(
      'SELECT * FROM meals WHERE (chat_id = ? OR chat_id IS NULL) AND date = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(chatId, date) as Array<{
      id: number;
      chat_id: string | null;
      date: string;
      description: string;
      estimated_calories: number | null;
      estimated_protein: number | null;
      estimated_carbs: number | null;
      estimated_fat: number | null;
      image_path: string | null;
      created_at: number;
    }>;

    return rows.map((row) => rowToMeal(row));
  }

  getByDateRange(chatId: string, startDate: string, endDate: string): Meal[] {
    const stmt = this.db.prepare(
      'SELECT * FROM meals WHERE (chat_id = ? OR chat_id IS NULL) AND date >= ? AND date <= ? ORDER BY date DESC, created_at DESC'
    );
    const rows = stmt.all(chatId, startDate, endDate) as Array<{
      id: number;
      chat_id: string | null;
      date: string;
      description: string;
      estimated_calories: number | null;
      estimated_protein: number | null;
      estimated_carbs: number | null;
      estimated_fat: number | null;
      image_path: string | null;
      created_at: number;
    }>;

    return rows.map((row) => rowToMeal(row));
  }
}

type MealRow = {
  id: number;
  chat_id: string | null;
  date: string;
  description: string;
  estimated_calories: number | null;
  estimated_protein: number | null;
  estimated_carbs: number | null;
  estimated_fat: number | null;
  image_path: string | null;
  created_at: number;
};

function rowToMeal(row: MealRow): Meal {
  const meal: Meal = {
    id: row.id,
    chatId: row.chat_id ?? '',
    date: row.date,
    description: row.description,
    createdAt: row.created_at,
  };
  if (row.estimated_calories !== null) {
    meal.estimatedCalories = row.estimated_calories;
  }
  if (row.estimated_protein !== null) {
    meal.estimatedProtein = row.estimated_protein;
  }
  if (row.estimated_carbs !== null) {
    meal.estimatedCarbs = row.estimated_carbs;
  }
  if (row.estimated_fat !== null) {
    meal.estimatedFat = row.estimated_fat;
  }
  if (row.image_path !== null) {
    meal.imagePath = row.image_path;
  }
  return meal;
}
