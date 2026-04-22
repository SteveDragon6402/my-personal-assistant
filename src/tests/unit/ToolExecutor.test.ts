import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolExecutor, type ToolExecutorDependencies } from '../../core/agent/ToolExecutor.js';
import type { NotesPort } from '../../ports/NotesPort.js';
import type { EmailPort } from '../../ports/EmailPort.js';
import type { SleepDataPort } from '../../ports/SleepDataPort.js';
import type { MealRepository } from '../../persistence/repositories/MealRepository.js';
import type { HealthProfileRepository } from '../../persistence/repositories/HealthProfileRepository.js';
import type { SleepLogRepository } from '../../persistence/repositories/SleepLogRepository.js';
import type { UserPreferencesRepository } from '../../persistence/repositories/UserPreferencesRepository.js';
import type { MessageHistoryRepository } from '../../persistence/repositories/MessageHistoryRepository.js';

describe('ToolExecutor', () => {
  let deps: ToolExecutorDependencies;
  let executor: ToolExecutor;

  beforeEach(() => {
    deps = {
      notesPort: {
        createNote: vi.fn().mockResolvedValue({ path: 'test/note.md' }),
        appendToDaily: vi.fn().mockResolvedValue(undefined),
        searchNotes: vi.fn().mockResolvedValue([]),
        getTasks: vi.fn().mockResolvedValue([]),
        getCategories: vi.fn().mockResolvedValue([]),
        readNote: vi.fn().mockResolvedValue(null),
        readDailyNote: vi.fn().mockResolvedValue(null),
        listNotes: vi.fn().mockResolvedValue([]),
        updateNote: vi.fn().mockResolvedValue(undefined),
      } as unknown as NotesPort,
      emailPort: {
        getUnreadNewsletters: vi.fn().mockResolvedValue([]),
      } as unknown as EmailPort,
      sleepDataPort: {
        getLastNight: vi.fn().mockResolvedValue(null),
        getRange: vi.fn().mockResolvedValue([]),
      } as unknown as SleepDataPort,
      sleepLogRepository: {
        create: vi.fn().mockReturnValue({ id: 1, date: '2026-02-20', rawText: 'test' }),
        delete: vi.fn().mockReturnValue(true),
        deleteLast: vi.fn().mockReturnValue({ id: 1, date: '2026-02-20' }),
        update: vi.fn().mockReturnValue({ id: 1, date: '2026-02-20' }),
      } as unknown as SleepLogRepository,
      mealRepository: {
        create: vi.fn().mockReturnValue({
          id: 1,
          description: 'test meal',
          date: '2026-02-20',
          estimatedCalories: 500,
        }),
        getByDate: vi.fn().mockReturnValue([]),
        getByDateRange: vi.fn().mockReturnValue([]),
        delete: vi.fn().mockReturnValue(true),
        deleteLast: vi.fn().mockReturnValue({ id: 1, description: 'last meal', date: '2026-02-20' }),
        update: vi.fn().mockReturnValue({ id: 1, description: 'updated' }),
      } as unknown as MealRepository,
      healthProfileRepository: {
        get: vi.fn().mockReturnValue(null),
        upsert: vi.fn().mockReturnValue({ heightCm: 180, weightKg: 75 }),
      } as unknown as HealthProfileRepository,
      userPreferencesRepository: {
        get: vi.fn().mockReturnValue(null),
        getOrDefault: vi.fn().mockReturnValue({ timezone: 'UTC' }),
        upsert: vi.fn().mockReturnValue({ chatId: '123', lat: 51.5, lon: -0.1 }),
      } as unknown as UserPreferencesRepository,
      messageHistoryRepository: {
        getConversation: vi.fn().mockReturnValue([]),
      } as unknown as MessageHistoryRepository,
    };

    executor = new ToolExecutor(deps, '123456');
  });

  describe('meal tools', () => {
    it('should log a meal', async () => {
      const result = await executor.execute('log_meal', {
        description: 'Chicken salad',
        calories: 450,
        protein: 35,
        carbs: 20,
        fat: 25,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(deps.mealRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '123456',
          description: 'Chicken salad',
          estimatedCalories: 450,
        })
      );
    });

    it('should get meals for today', async () => {
      vi.mocked(deps.mealRepository.getByDate).mockReturnValue([
        { id: 1, description: 'Breakfast', estimatedCalories: 400, estimatedProtein: 20 },
        { id: 2, description: 'Lunch', estimatedCalories: 600, estimatedProtein: 30 },
      ] as ReturnType<MealRepository['getByDate']>);

      const result = await executor.execute('get_meals_today', {});

      const parsed = JSON.parse(result);
      expect(parsed.meals).toHaveLength(2);
      expect(parsed.totals.calories).toBe(1000);
      expect(parsed.totals.protein).toBe(50);
    });

    it('should delete last meal when no id provided', async () => {
      const result = await executor.execute('delete_meal', {});

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(deps.mealRepository.deleteLast).toHaveBeenCalledWith('123456');
    });

    it('should delete specific meal by id', async () => {
      const result = await executor.execute('delete_meal', { meal_id: 5 });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(deps.mealRepository.delete).toHaveBeenCalledWith('123456', 5);
    });
  });

  describe('health profile tools', () => {
    it('should return not found when no profile exists', async () => {
      const result = await executor.execute('get_health_profile', {});

      const parsed = JSON.parse(result);
      expect(parsed.found).toBe(false);
    });

    it('should return profile with BMI when exists', async () => {
      vi.mocked(deps.healthProfileRepository.get).mockReturnValue({
        chatId: '123456',
        heightCm: 180,
        weightKg: 81,
        gender: 'male',
        age: 30,
        updatedAt: Date.now(),
      });

      const result = await executor.execute('get_health_profile', {});

      const parsed = JSON.parse(result);
      expect(parsed.found).toBe(true);
      expect(parsed.bmi).toBe(25); // 81 / (1.8^2) = 25
    });

    it('should set health profile', async () => {
      const result = await executor.execute('set_health_profile', {
        height_cm: 175,
        weight_kg: 70,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(deps.healthProfileRepository.upsert).toHaveBeenCalledWith('123456', {
        heightCm: 175,
        weightKg: 70,
        gender: undefined,
        age: undefined,
      });
    });
  });

  describe('sleep tools', () => {
    it('should log sleep with structured data', async () => {
      const result = await executor.execute('log_sleep', {
        raw_text: 'Sleep score 85',
        sleep_score: 85,
        time_slept_minutes: 420,
        deep_sleep_minutes: 90,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(deps.sleepLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '123456',
          sleepScore: 85,
          timeSleptMinutes: 420,
        })
      );
    });

    it('should return not found for sleep last night', async () => {
      const result = await executor.execute('get_sleep_last_night', {});

      const parsed = JSON.parse(result);
      expect(parsed.found).toBe(false);
    });
  });

  describe('location tools', () => {
    it('should set location', async () => {
      const result = await executor.execute('set_location', { lat: 51.5074, lon: -0.1278 });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(deps.userPreferencesRepository.upsert).toHaveBeenCalledWith({
        chatId: '123456',
        lat: 51.5074,
        lon: -0.1278,
      });
    });

    it('should fail without both lat and lon', async () => {
      const result = await executor.execute('set_location', { lat: 51.5 });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
    });
  });

  describe('utility tools', () => {
    it('should return current date', async () => {
      const result = await executor.execute('get_current_date', {});

      const parsed = JSON.parse(result);
      expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(parsed.timezone).toBe('UTC');
    });

    it('should read chat history', async () => {
      vi.mocked(deps.messageHistoryRepository.getConversation).mockReturnValue([
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi there!', timestamp: new Date() },
      ]);

      const result = await executor.execute('read_chat_history', { limit: 5 });

      const parsed = JSON.parse(result);
      expect(parsed.found).toBe(true);
      expect(parsed.messages).toHaveLength(2);
    });
  });

  describe('unknown tool', () => {
    it('should return error for unknown tool', async () => {
      const result = await executor.execute('nonexistent_tool', {});

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain('Unknown tool');
    });
  });
});
