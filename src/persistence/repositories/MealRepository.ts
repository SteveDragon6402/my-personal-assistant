import type { Database } from 'better-sqlite3';
import { getDatabase } from '../database.js';

/** Key vitamins (estimated). Units: mcg RAE (A), mg (C,E,B6), mcg (D,K,B12, folate). */
export interface MealVitamins {
  vitaminA?: number; // mcg RAE
  vitaminC?: number; // mg
  vitaminD?: number; // mcg
  vitaminE?: number; // mg
  vitaminK?: number; // mcg
  vitaminB6?: number; // mg
  vitaminB12?: number; // mcg
  folate?: number; // mcg DFE
}

/** Key minerals (estimated). Units: mg (iron, calcium, magnesium, zinc, potassium), mcg (selenium, iodine). */
export interface MealMinerals {
  iron?: number; // mg
  calcium?: number; // mg
  magnesium?: number; // mg
  zinc?: number; // mg
  potassium?: number; // mg
  selenium?: number; // mcg
  iodine?: number; // mcg
}

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
  /** AI-estimated key vitamins (optional). */
  vitamins?: MealVitamins;
  /** AI-estimated key minerals (optional). */
  minerals?: MealMinerals;
  /** Timestamp when the meal was eaten (defaults to createdAt if not specified). */
  timeEaten?: number;
  /** Free-form meal type (e.g., "breakfast", "lunch", "snack") as determined by AI. */
  mealType?: string;
  createdAt: number;
}

export class MealRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db || getDatabase();
  }

  create(meal: Omit<Meal, 'id' | 'createdAt'>): Meal {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO meals (
        chat_id, date, description, estimated_calories, estimated_protein, estimated_carbs, estimated_fat, image_path,
        time_eaten, meal_type,
        vitamin_a_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg, vitamin_k_mcg, vitamin_b6_mg, vitamin_b12_mcg, folate_mcg,
        iron_mg, calcium_mg, magnesium_mg, zinc_mg, potassium_mg, selenium_mcg, iodine_mcg
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const v = meal.vitamins;
    const m = meal.minerals;
    // Default timeEaten to now if not provided
    const timeEaten = meal.timeEaten ?? now;

    const result = stmt.run(
      meal.chatId,
      meal.date,
      meal.description,
      meal.estimatedCalories ?? null,
      meal.estimatedProtein ?? null,
      meal.estimatedCarbs ?? null,
      meal.estimatedFat ?? null,
      meal.imagePath ?? null,
      timeEaten,
      meal.mealType ?? null,
      v?.vitaminA ?? null,
      v?.vitaminC ?? null,
      v?.vitaminD ?? null,
      v?.vitaminE ?? null,
      v?.vitaminK ?? null,
      v?.vitaminB6 ?? null,
      v?.vitaminB12 ?? null,
      v?.folate ?? null,
      m?.iron ?? null,
      m?.calcium ?? null,
      m?.magnesium ?? null,
      m?.zinc ?? null,
      m?.potassium ?? null,
      m?.selenium ?? null,
      m?.iodine ?? null
    );

    return {
      id: Number(result.lastInsertRowid),
      ...meal,
      timeEaten,
      createdAt: now,
    };
  }

  getByDate(chatId: string, date: string): Meal[] {
    const stmt = this.db.prepare(
      'SELECT * FROM meals WHERE (chat_id = ? OR chat_id IS NULL) AND date = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(chatId, date) as MealRow[];
    return rows.map((row) => rowToMeal(row));
  }

  getByDateRange(chatId: string, startDate: string, endDate: string): Meal[] {
    const stmt = this.db.prepare(
      'SELECT * FROM meals WHERE (chat_id = ? OR chat_id IS NULL) AND date >= ? AND date <= ? ORDER BY date DESC, created_at DESC'
    );
    const rows = stmt.all(chatId, startDate, endDate) as MealRow[];
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
  time_eaten?: number | null;
  meal_type?: string | null;
  created_at: number;
  // Micronutrients (optional so older DB rows without columns still type-check)
  vitamin_a_mcg?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_mcg?: number | null;
  vitamin_e_mg?: number | null;
  vitamin_k_mcg?: number | null;
  vitamin_b6_mg?: number | null;
  vitamin_b12_mcg?: number | null;
  folate_mcg?: number | null;
  iron_mg?: number | null;
  calcium_mg?: number | null;
  magnesium_mg?: number | null;
  zinc_mg?: number | null;
  potassium_mg?: number | null;
  selenium_mcg?: number | null;
  iodine_mcg?: number | null;
};

function rowToMeal(row: MealRow): Meal {
  const meal: Meal = {
    id: row.id,
    chatId: row.chat_id ?? '',
    date: row.date,
    description: row.description,
    timeEaten: row.time_eaten ?? row.created_at, // Default to created_at for older rows
    createdAt: row.created_at,
  };
  if (row.estimated_calories !== null) meal.estimatedCalories = row.estimated_calories;
  if (row.estimated_protein !== null) meal.estimatedProtein = row.estimated_protein;
  if (row.estimated_carbs !== null) meal.estimatedCarbs = row.estimated_carbs;
  if (row.estimated_fat !== null) meal.estimatedFat = row.estimated_fat;
  if (row.image_path !== null) meal.imagePath = row.image_path;
  if (row.meal_type) meal.mealType = row.meal_type;

  const hasVit =
    row.vitamin_a_mcg != null ||
    row.vitamin_c_mg != null ||
    row.vitamin_d_mcg != null ||
    row.vitamin_e_mg != null ||
    row.vitamin_k_mcg != null ||
    row.vitamin_b6_mg != null ||
    row.vitamin_b12_mcg != null ||
    row.folate_mcg != null;
  if (hasVit) {
    meal.vitamins = {};
    if (row.vitamin_a_mcg != null) meal.vitamins.vitaminA = row.vitamin_a_mcg;
    if (row.vitamin_c_mg != null) meal.vitamins.vitaminC = row.vitamin_c_mg;
    if (row.vitamin_d_mcg != null) meal.vitamins.vitaminD = row.vitamin_d_mcg;
    if (row.vitamin_e_mg != null) meal.vitamins.vitaminE = row.vitamin_e_mg;
    if (row.vitamin_k_mcg != null) meal.vitamins.vitaminK = row.vitamin_k_mcg;
    if (row.vitamin_b6_mg != null) meal.vitamins.vitaminB6 = row.vitamin_b6_mg;
    if (row.vitamin_b12_mcg != null) meal.vitamins.vitaminB12 = row.vitamin_b12_mcg;
    if (row.folate_mcg != null) meal.vitamins.folate = row.folate_mcg;
  }

  const hasMin =
    row.iron_mg != null ||
    row.calcium_mg != null ||
    row.magnesium_mg != null ||
    row.zinc_mg != null ||
    row.potassium_mg != null ||
    row.selenium_mcg != null ||
    row.iodine_mcg != null;
  if (hasMin) {
    meal.minerals = {};
    if (row.iron_mg != null) meal.minerals.iron = row.iron_mg;
    if (row.calcium_mg != null) meal.minerals.calcium = row.calcium_mg;
    if (row.magnesium_mg != null) meal.minerals.magnesium = row.magnesium_mg;
    if (row.zinc_mg != null) meal.minerals.zinc = row.zinc_mg;
    if (row.potassium_mg != null) meal.minerals.potassium = row.potassium_mg;
    if (row.selenium_mcg != null) meal.minerals.selenium = row.selenium_mcg;
    if (row.iodine_mcg != null) meal.minerals.iodine = row.iodine_mcg;
  }

  return meal;
}
