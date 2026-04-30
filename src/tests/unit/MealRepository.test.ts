import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MealRepository } from '../../persistence/repositories/MealRepository.js';

describe('MealRepository', () => {
  let db: Database.Database;
  let repo: MealRepository;

  beforeEach(() => {
    db = new Database(':memory:');

    db.exec(`
      CREATE TABLE meals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        estimated_calories INTEGER,
        estimated_protein INTEGER,
        estimated_carbs INTEGER,
        estimated_fat INTEGER,
        time_eaten INTEGER,
        meal_type TEXT,
        vitamin_a_mcg INTEGER,
        vitamin_c_mg INTEGER,
        vitamin_d_mcg INTEGER,
        vitamin_e_mg INTEGER,
        vitamin_k_mcg INTEGER,
        vitamin_b6_mg INTEGER,
        vitamin_b12_mcg INTEGER,
        folate_mcg INTEGER,
        iron_mg INTEGER,
        calcium_mg INTEGER,
        magnesium_mg INTEGER,
        zinc_mg INTEGER,
        potassium_mg INTEGER,
        selenium_mcg INTEGER,
        iodine_mcg INTEGER,
        image_path TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);

    repo = new MealRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a meal with basic info', () => {
      const meal = repo.create({
        chatId: '123',
        date: '2026-02-20',
        description: 'Chicken salad',
        estimatedCalories: 450,
        estimatedProtein: 35,
        estimatedCarbs: 15,
        estimatedFat: 25,
      });

      expect(meal.id).toBeDefined();
      expect(meal.description).toBe('Chicken salad');
      expect(meal.estimatedCalories).toBe(450);
    });

    it('should create a meal with vitamins and minerals', () => {
      const meal = repo.create({
        chatId: '123',
        date: '2026-02-20',
        description: 'Spinach salad',
        estimatedCalories: 200,
        vitamins: {
          vitaminA: 500,
          vitaminC: 30,
          vitaminK: 150,
        },
        minerals: {
          iron: 3,
          calcium: 100,
        },
      });

      expect(meal.vitamins?.vitaminA).toBe(500);
      expect(meal.vitamins?.vitaminC).toBe(30);
      expect(meal.minerals?.iron).toBe(3);
    });

    it('should create a meal with meal type and time', () => {
      const timeEaten = Date.now();
      const meal = repo.create({
        chatId: '123',
        date: '2026-02-20',
        description: 'Oatmeal',
        estimatedCalories: 300,
        mealType: 'breakfast',
        timeEaten,
      });

      expect(meal.mealType).toBe('breakfast');
      expect(meal.timeEaten).toBe(timeEaten);
    });
  });

  describe('getByDate', () => {
    it('should return meals for specific date and chat', () => {
      repo.create({ chatId: '123', date: '2026-02-20', description: 'Breakfast' });
      repo.create({ chatId: '123', date: '2026-02-20', description: 'Lunch' });
      repo.create({ chatId: '123', date: '2026-02-21', description: 'Other day' });
      repo.create({ chatId: '456', date: '2026-02-20', description: 'Other user' });

      const meals = repo.getByDate('123', '2026-02-20');

      expect(meals).toHaveLength(2);
      expect(meals.map((m) => m.description)).toContain('Breakfast');
      expect(meals.map((m) => m.description)).toContain('Lunch');
    });

    it('should return empty array when no meals', () => {
      const meals = repo.getByDate('123', '2026-02-20');
      expect(meals).toEqual([]);
    });
  });

  describe('getByDateRange', () => {
    it('should return meals within date range', () => {
      repo.create({ chatId: '123', date: '2026-02-18', description: 'Day 1' });
      repo.create({ chatId: '123', date: '2026-02-19', description: 'Day 2' });
      repo.create({ chatId: '123', date: '2026-02-20', description: 'Day 3' });
      repo.create({ chatId: '123', date: '2026-02-21', description: 'Outside range' });

      const meals = repo.getByDateRange('123', '2026-02-18', '2026-02-20');

      expect(meals).toHaveLength(3);
    });
  });

  describe('delete', () => {
    it('should delete meal by id', () => {
      const meal = repo.create({ chatId: '123', date: '2026-02-20', description: 'To delete' });

      const deleted = repo.delete('123', meal.id!);

      expect(deleted).toBe(true);
      expect(repo.getByDate('123', '2026-02-20')).toHaveLength(0);
    });

    it('should return false for non-existent meal', () => {
      const deleted = repo.delete('123', 999);
      expect(deleted).toBe(false);
    });

    it('should not delete meal from different chat', () => {
      const meal = repo.create({ chatId: '123', date: '2026-02-20', description: 'Test' });

      const deleted = repo.delete('456', meal.id!);

      expect(deleted).toBe(false);
      expect(repo.getByDate('123', '2026-02-20')).toHaveLength(1);
    });
  });

  describe('deleteLast', () => {
    it('should delete most recent meal', () => {
      repo.create({ chatId: '123', date: '2026-02-19', description: 'Earlier' });
      repo.create({ chatId: '123', date: '2026-02-20', description: 'Later' });

      const deleted = repo.deleteLast('123');

      expect(deleted?.description).toBe('Later');
      expect(repo.getByDate('123', '2026-02-20')).toHaveLength(0);
      expect(repo.getByDate('123', '2026-02-19')).toHaveLength(1);
    });

    it('should return null when no meals', () => {
      const deleted = repo.deleteLast('123');
      expect(deleted).toBeNull();
    });
  });

  describe('update', () => {
    it('should update meal fields', () => {
      const meal = repo.create({
        chatId: '123',
        date: '2026-02-20',
        description: 'Original',
        estimatedCalories: 400,
      });

      const updated = repo.update('123', meal.id!, {
        description: 'Updated',
        estimatedCalories: 500,
      });

      expect(updated?.description).toBe('Updated');
      expect(updated?.estimatedCalories).toBe(500);
    });

    it('should return null for non-existent meal', () => {
      const updated = repo.update('123', 999, { description: 'Test' });
      expect(updated).toBeNull();
    });
  });
});
