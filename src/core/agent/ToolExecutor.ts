import type { NotesPort } from '../../ports/NotesPort.js';
import type { EmailPort } from '../../ports/EmailPort.js';
import type { SleepDataPort } from '../../ports/SleepDataPort.js';
import type {
  MealRepository,
  MealVitamins,
  MealMinerals,
} from '../../persistence/repositories/MealRepository.js';
import type { HealthProfileRepository } from '../../persistence/repositories/HealthProfileRepository.js';
import type { SleepLogRepository } from '../../persistence/repositories/SleepLogRepository.js';
import type { UserPreferencesRepository } from '../../persistence/repositories/UserPreferencesRepository.js';
import type { MessageHistoryRepository } from '../../persistence/repositories/MessageHistoryRepository.js';
import type { MorningDigestService } from '../digest/MorningDigestService.js';
import { createLogger } from '../../utils/logger.js';

export interface ToolExecutorDependencies {
  notesPort: NotesPort;
  emailPort: EmailPort;
  sleepDataPort: SleepDataPort;
  sleepLogRepository: SleepLogRepository;
  mealRepository: MealRepository;
  healthProfileRepository: HealthProfileRepository;
  userPreferencesRepository: UserPreferencesRepository;
  messageHistoryRepository: MessageHistoryRepository;
  morningDigestService?: MorningDigestService;
}

export class ToolExecutor {
  private readonly logger = createLogger({ service: 'ToolExecutor' });

  constructor(
    private readonly deps: ToolExecutorDependencies,
    private readonly chatId: string
  ) {}

  /**
   * Execute a tool call and return the result as a string for Claude.
   */
  async execute(toolName: string, input: Record<string, unknown>): Promise<string> {
    const logger = this.logger.child({ toolName, chatId: this.chatId });
    logger.info({ input }, 'Executing tool');

    try {
      switch (toolName) {
        // Meal tools
        case 'log_meal':
          return this.logMeal(input);
        case 'get_meals_today':
          return this.getMealsToday();
        case 'get_meals_range':
          return this.getMealsRange(input);
        case 'delete_meal':
          return this.deleteMeal(input);
        case 'update_meal':
          return this.updateMeal(input);

        // Health profile tools
        case 'get_health_profile':
          return this.getHealthProfile();
        case 'set_health_profile':
          return this.setHealthProfile(input);

        // Email tools
        case 'get_newsletters':
          return this.getNewsletters(input);

        // Sleep tools
        case 'log_sleep':
          return this.logSleep(input);
        case 'get_sleep_last_night':
          return this.getSleepLastNight();
        case 'get_sleep_range':
          return this.getSleepRange(input);
        case 'delete_sleep':
          return this.deleteSleep(input);
        case 'update_sleep':
          return this.updateSleep(input);

        // Location tools
        case 'set_location':
          return this.setLocation(input);

        // Obsidian tools
        case 'create_note':
          return this.createNote(input);
        case 'append_to_daily':
          return this.appendToDaily(input);
        case 'search_notes':
          return this.searchNotes(input);
        case 'get_tasks':
          return this.getTasks(input);
        case 'get_categories':
          return this.getCategories();
        case 'read_note':
          return this.readNote(input);
        case 'read_daily_note':
          return this.readDailyNote(input);
        case 'list_notes':
          return this.listNotes(input);
        case 'update_note':
          return this.updateNote(input);

        // Utility tools
        case 'fetch_url':
          return this.fetchUrl(input);
        case 'read_chat_history':
          return this.readChatHistory(input);

        default:
          logger.warn({ toolName }, 'Unknown tool');
          return JSON.stringify({ error: `Unknown tool: ${toolName}` });
      }
    } catch (error) {
      logger.error({ error, toolName }, 'Tool execution failed');
      const message = error instanceof Error ? error.message : 'Unknown error';
      return JSON.stringify({ error: `Tool execution failed: ${message}` });
    }
  }

  // ============================================================================
  // MEAL TOOLS
  // ============================================================================

  private num(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }

  private logMeal(input: Record<string, unknown>): string {
    const now = Date.now();
    const description = String(input.description ?? '');
    const calories = this.num(input.calories);
    const protein = this.num(input.protein);
    const carbs = this.num(input.carbs);
    const fat = this.num(input.fat);
    const mealType = typeof input.meal_type === 'string' ? input.meal_type : undefined;

    // Parse time_eaten if provided, otherwise default to now
    let timeEaten = now;
    if (typeof input.time_eaten === 'string' && input.time_eaten.trim()) {
      const parsed = Date.parse(input.time_eaten);
      if (!Number.isNaN(parsed)) {
        timeEaten = parsed;
      }
    }

    // Derive date from timeEaten
    const date = new Date(timeEaten).toISOString().split('T')[0] ?? '';

    const vitamins =
      this.num(input.vitamin_a_mcg) != null ||
      this.num(input.vitamin_c_mg) != null ||
      this.num(input.vitamin_d_mcg) != null ||
      this.num(input.vitamin_e_mg) != null ||
      this.num(input.vitamin_k_mcg) != null ||
      this.num(input.vitamin_b6_mg) != null ||
      this.num(input.vitamin_b12_mcg) != null ||
      this.num(input.folate_mcg) != null
        ? {
            vitaminA: this.num(input.vitamin_a_mcg),
            vitaminC: this.num(input.vitamin_c_mg),
            vitaminD: this.num(input.vitamin_d_mcg),
            vitaminE: this.num(input.vitamin_e_mg),
            vitaminK: this.num(input.vitamin_k_mcg),
            vitaminB6: this.num(input.vitamin_b6_mg),
            vitaminB12: this.num(input.vitamin_b12_mcg),
            folate: this.num(input.folate_mcg),
          }
        : undefined;

    const minerals =
      this.num(input.iron_mg) != null ||
      this.num(input.calcium_mg) != null ||
      this.num(input.magnesium_mg) != null ||
      this.num(input.zinc_mg) != null ||
      this.num(input.potassium_mg) != null ||
      this.num(input.selenium_mcg) != null ||
      this.num(input.iodine_mcg) != null
        ? {
            iron: this.num(input.iron_mg),
            calcium: this.num(input.calcium_mg),
            magnesium: this.num(input.magnesium_mg),
            zinc: this.num(input.zinc_mg),
            potassium: this.num(input.potassium_mg),
            selenium: this.num(input.selenium_mcg),
            iodine: this.num(input.iodine_mcg),
          }
        : undefined;

    const meal = this.deps.mealRepository.create({
      chatId: this.chatId,
      date,
      description,
      estimatedCalories: calories,
      estimatedProtein: protein,
      estimatedCarbs: carbs,
      estimatedFat: fat,
      timeEaten,
      mealType,
      vitamins,
      minerals,
    });

    const out: Record<string, unknown> = {
      success: true,
      meal: {
        id: meal.id,
        description: meal.description,
        meal_type: meal.mealType,
        time_eaten: new Date(timeEaten).toISOString(),
        calories: meal.estimatedCalories,
        protein: meal.estimatedProtein,
        carbs: meal.estimatedCarbs,
        fat: meal.estimatedFat,
        date: meal.date,
      },
    };
    if (meal.vitamins) (out.meal as Record<string, unknown>).vitamins = meal.vitamins;
    if (meal.minerals) (out.meal as Record<string, unknown>).minerals = meal.minerals;
    return JSON.stringify(out);
  }

  private mealToSummary(m: {
    id?: number;
    description: string;
    date?: string;
    estimatedCalories?: number;
    estimatedProtein?: number;
    estimatedCarbs?: number;
    estimatedFat?: number;
    vitamins?: MealVitamins;
    minerals?: MealMinerals;
  }): Record<string, unknown> {
    const out: Record<string, unknown> = {
      id: m.id,
      description: m.description,
      calories: m.estimatedCalories,
      protein: m.estimatedProtein,
      carbs: m.estimatedCarbs,
      fat: m.estimatedFat,
    };
    if (m.vitamins) out.vitamins = m.vitamins;
    if (m.minerals) out.minerals = m.minerals;
    return out;
  }

  private sumMicros(meals: Array<{ vitamins?: MealVitamins; minerals?: MealMinerals }>): {
    vitamins?: MealVitamins;
    minerals?: MealMinerals;
  } {
    const vitamins: MealVitamins = {};
    const minerals: MealMinerals = {};
    const vitKeys: (keyof MealVitamins)[] = [
      'vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB6', 'vitaminB12', 'folate',
    ];
    const minKeys: (keyof MealMinerals)[] = [
      'iron', 'calcium', 'magnesium', 'zinc', 'potassium', 'selenium', 'iodine',
    ];
    for (const m of meals) {
      if (m.vitamins) for (const k of vitKeys) if (m.vitamins[k] != null) (vitamins as Record<string, number>)[k] = ((vitamins as Record<string, number>)[k] ?? 0) + m.vitamins[k]!;
      if (m.minerals) for (const k of minKeys) if (m.minerals[k] != null) (minerals as Record<string, number>)[k] = ((minerals as Record<string, number>)[k] ?? 0) + m.minerals[k]!;
    }
    const out: { vitamins?: MealVitamins; minerals?: MealMinerals } = {};
    if (Object.keys(vitamins).length) out.vitamins = vitamins;
    if (Object.keys(minerals).length) out.minerals = minerals;
    return out;
  }

  private getMealsToday(): string {
    const today = new Date().toISOString().split('T')[0] ?? '';
    const meals = this.deps.mealRepository.getByDate(this.chatId, today);

    const totalCalories = meals.reduce((sum, m) => sum + (m.estimatedCalories ?? 0), 0);
    const totalProtein = meals.reduce((sum, m) => sum + (m.estimatedProtein ?? 0), 0);
    const totalCarbs = meals.reduce((sum, m) => sum + (m.estimatedCarbs ?? 0), 0);
    const totalFat = meals.reduce((sum, m) => sum + (m.estimatedFat ?? 0), 0);

    const totals: Record<string, unknown> = {
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fat: totalFat,
    };
    const microTotals = this.sumMicros(meals);
    if (microTotals.vitamins) totals.vitamins = microTotals.vitamins;
    if (microTotals.minerals) totals.minerals = microTotals.minerals;

    return JSON.stringify({
      date: today,
      meals: meals.map((m) => this.mealToSummary({ ...m, vitamins: m.vitamins, minerals: m.minerals })),
      totals,
    });
  }

  private getMealsRange(input: Record<string, unknown>): string {
    const startDate = String(input.start_date ?? '');
    const endDate = String(input.end_date ?? '');
    const meals = this.deps.mealRepository.getByDateRange(this.chatId, startDate, endDate);

    const totalCalories = meals.reduce((sum, m) => sum + (m.estimatedCalories ?? 0), 0);
    const totalProtein = meals.reduce((sum, m) => sum + (m.estimatedProtein ?? 0), 0);

    const totals: Record<string, unknown> = {
      calories: totalCalories,
      protein: totalProtein,
    };
    const microTotals = this.sumMicros(meals);
    if (microTotals.vitamins) totals.vitamins = microTotals.vitamins;
    if (microTotals.minerals) totals.minerals = microTotals.minerals;

    return JSON.stringify({
      start_date: startDate,
      end_date: endDate,
      meal_count: meals.length,
      meals: meals.map((m) => ({
        ...this.mealToSummary({ ...m, vitamins: m.vitamins, minerals: m.minerals }),
        date: m.date,
      })),
      totals,
    });
  }

  private deleteMeal(input: Record<string, unknown>): string {
    const mealId = this.num(input.meal_id);
    if (mealId != null) {
      const deleted = this.deps.mealRepository.delete(this.chatId, mealId);
      if (!deleted) {
        return JSON.stringify({ success: false, message: 'Meal not found or already deleted.' });
      }
      return JSON.stringify({ success: true, deleted_meal_id: mealId, message: 'Meal deleted.' });
    }
    const last = this.deps.mealRepository.deleteLast(this.chatId);
    if (!last) {
      return JSON.stringify({ success: false, message: 'No meals to delete.' });
    }
    return JSON.stringify({
      success: true,
      deleted_meal_id: last.id,
      message: `Deleted: ${last.description} (${last.date}).`,
    });
  }

  private updateMeal(input: Record<string, unknown>): string {
    const mealId = this.num(input.meal_id);
    if (mealId == null) {
      return JSON.stringify({ success: false, message: 'meal_id is required.' });
    }
    const partial: Parameters<MealRepository['update']>[2] = {};
    if (typeof input.description === 'string') partial.description = input.description;
    if (typeof input.date === 'string') partial.date = input.date;
    if (this.num(input.calories) != null) partial.estimatedCalories = this.num(input.calories)!;
    if (this.num(input.protein) != null) partial.estimatedProtein = this.num(input.protein)!;
    if (this.num(input.carbs) != null) partial.estimatedCarbs = this.num(input.carbs)!;
    if (this.num(input.fat) != null) partial.estimatedFat = this.num(input.fat)!;
    if (typeof input.meal_type === 'string') partial.mealType = input.meal_type;
    if (typeof input.time_eaten === 'string') {
      const parsed = Date.parse(input.time_eaten);
      if (!Number.isNaN(parsed)) partial.timeEaten = parsed;
    }
    const updated = this.deps.mealRepository.update(this.chatId, mealId, partial);
    if (!updated) {
      return JSON.stringify({ success: false, message: 'Meal not found.' });
    }
    return JSON.stringify({
      success: true,
      meal: this.mealToSummary({ ...updated, vitamins: updated.vitamins, minerals: updated.minerals }),
    });
  }

  // ============================================================================
  // HEALTH PROFILE TOOLS
  // ============================================================================

  private getHealthProfile(): string {
    const profile = this.deps.healthProfileRepository.get(this.chatId);
    if (!profile) {
      return JSON.stringify({
        found: false,
        message: 'No health profile set. The user can set height, weight, gender, and age with set_health_profile.',
      });
    }
    const out: Record<string, unknown> = {
      found: true,
      height_cm: profile.heightCm,
      weight_kg: profile.weightKg,
      gender: profile.gender,
      age: profile.age,
      updated_at: profile.updatedAt,
    };
    if (
      profile.heightCm != null &&
      profile.heightCm > 0 &&
      profile.weightKg != null &&
      profile.weightKg > 0
    ) {
      const heightM = profile.heightCm / 100;
      out.bmi = Math.round((profile.weightKg / (heightM * heightM)) * 10) / 10;
    }
    return JSON.stringify(out);
  }

  private setHealthProfile(input: Record<string, unknown>): string {
    const heightCm = this.num(input.height_cm);
    const weightKg = this.num(input.weight_kg);
    const gender =
      typeof input.gender === 'string' && input.gender.trim()
        ? input.gender.trim()
        : undefined;
    const age = this.num(input.age);
    if (heightCm === undefined && weightKg === undefined && gender === undefined && age === undefined) {
      return JSON.stringify({
        success: false,
        message: 'Provide at least one of: height_cm, weight_kg, gender, age.',
      });
    }
    const profile = this.deps.healthProfileRepository.upsert(this.chatId, {
      heightCm,
      weightKg,
      gender,
      age,
    });
    const out: Record<string, unknown> = {
      success: true,
      height_cm: profile.heightCm,
      weight_kg: profile.weightKg,
      gender: profile.gender,
      age: profile.age,
    };
    if (
      profile.heightCm != null &&
      profile.heightCm > 0 &&
      profile.weightKg != null &&
      profile.weightKg > 0
    ) {
      const heightM = profile.heightCm / 100;
      out.bmi = Math.round((profile.weightKg / (heightM * heightM)) * 10) / 10;
    }
    return JSON.stringify(out);
  }

  // ============================================================================
  // EMAIL TOOLS
  // ============================================================================

  private async getNewsletters(input: Record<string, unknown>): Promise<string> {
    const sinceHours = typeof input.since_hours === 'number' ? input.since_hours : 24;
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    const newsletters = await this.deps.emailPort.getUnreadNewsletters(since);

    return JSON.stringify({
      since: since.toISOString(),
      count: newsletters.length,
      newsletters: newsletters.map((n) => ({
        subject: n.subject,
        sender: n.sender,
        received_at: n.receivedAt.toISOString(),
        body_preview: n.body.slice(0, 500) + (n.body.length > 500 ? '...' : ''),
      })),
    });
  }

  // ============================================================================
  // SLEEP TOOLS
  // ============================================================================

  private logSleep(input: Record<string, unknown>): string {
    const rawText = String(input.raw_text ?? '');
    const date = String(input.date ?? new Date().toISOString().split('T')[0]);

    const entry = this.deps.sleepLogRepository.create({
      chatId: this.chatId,
      date,
      rawText,
      sleepScore: this.num(input.sleep_score),
      timeSleptMinutes: this.num(input.time_slept_minutes),
      deepSleepMinutes: this.num(input.deep_sleep_minutes),
      remSleepMinutes: this.num(input.rem_sleep_minutes),
      rhr: this.num(input.rhr),
      hrv: this.num(input.hrv),
      interruptions: this.num(input.interruptions),
    });

    // Trigger morning digest after sleep is logged (fire and forget)
    if (this.deps.morningDigestService) {
      this.deps.morningDigestService.triggerDigest(this.chatId).catch((error) => {
        this.logger.error({ error }, 'Failed to trigger morning digest');
      });
    }

    // Build response with available metrics
    const result: Record<string, unknown> = {
      success: true,
      entry: {
        id: entry.id,
        date: entry.date,
      },
    };

    if (entry.sleepScore != null) (result.entry as Record<string, unknown>).sleep_score = entry.sleepScore;
    if (entry.timeSleptMinutes != null) {
      const hours = Math.floor(entry.timeSleptMinutes / 60);
      const mins = entry.timeSleptMinutes % 60;
      (result.entry as Record<string, unknown>).time_slept = `${hours}h ${mins}m`;
    }
    if (entry.deepSleepMinutes != null) (result.entry as Record<string, unknown>).deep_sleep_minutes = entry.deepSleepMinutes;
    if (entry.remSleepMinutes != null) (result.entry as Record<string, unknown>).rem_sleep_minutes = entry.remSleepMinutes;
    if (entry.rhr != null) (result.entry as Record<string, unknown>).rhr = entry.rhr;
    if (entry.hrv != null) (result.entry as Record<string, unknown>).hrv = entry.hrv;
    if (entry.interruptions != null) (result.entry as Record<string, unknown>).interruptions = entry.interruptions;

    return JSON.stringify(result);
  }

  // ============================================================================
  // LOCATION TOOLS
  // ============================================================================

  private setLocation(input: Record<string, unknown>): string {
    const lat = typeof input.lat === 'number' ? input.lat : undefined;
    const lon = typeof input.lon === 'number' ? input.lon : undefined;

    if (lat === undefined || lon === undefined) {
      return JSON.stringify({
        success: false,
        message: 'Both lat and lon are required as numbers.',
      });
    }

    this.deps.userPreferencesRepository.upsert({
      chatId: this.chatId,
      lat,
      lon,
    });

    return JSON.stringify({
      success: true,
      lat,
      lon,
      message: 'Location saved. You will now get weather in your morning digest.',
    });
  }

  private async getSleepLastNight(): Promise<string> {
    const sleepData = await this.deps.sleepDataPort.getLastNight(this.chatId);

    if (!sleepData) {
      return JSON.stringify({
        found: false,
        message: 'No sleep data found for last night',
      });
    }

    return JSON.stringify({
      found: true,
      sleep: {
        id: sleepData.id,
        date: sleepData.date,
        score: sleepData.sleepScore,
        deep_sleep_minutes: sleepData.deepSleepMinutes,
        rem_sleep_minutes: sleepData.remSleepMinutes,
        time_asleep: sleepData.timeAsleep,
        time_to_bed: sleepData.timeToBed,
        time_awake: sleepData.timeAwake,
        hrv: sleepData.hrv,
        resting_heart_rate: sleepData.restingHeartRate,
        predicted_energy_peak: sleepData.predictedEnergyPeak,
        predicted_energy_trough: sleepData.predictedEnergyTrough,
      },
    });
  }

  private async getSleepRange(input: Record<string, unknown>): Promise<string> {
    const startDate = String(input.start_date ?? '');
    const endDate = String(input.end_date ?? '');

    const sleepData = await this.deps.sleepDataPort.getRange(startDate, endDate, this.chatId);

    if (sleepData.length === 0) {
      return JSON.stringify({
        found: false,
        message: 'No sleep data found for the specified range',
      });
    }

    const avgScore = sleepData.reduce((sum, s) => sum + s.sleepScore, 0) / sleepData.length;
    const totalDeep = sleepData.reduce((sum, s) => sum + s.deepSleepMinutes, 0);
    const totalRem = sleepData.reduce((sum, s) => sum + s.remSleepMinutes, 0);

    return JSON.stringify({
      found: true,
      start_date: startDate,
      end_date: endDate,
      nights: sleepData.length,
      average_score: Math.round(avgScore),
      total_deep_sleep_minutes: totalDeep,
      total_rem_sleep_minutes: totalRem,
      sessions: sleepData.map((s) => ({
        id: s.id,
        date: s.date,
        score: s.sleepScore,
        deep_minutes: s.deepSleepMinutes,
        rem_minutes: s.remSleepMinutes,
      })),
    });
  }

  private deleteSleep(input: Record<string, unknown>): string {
    const sleepId = this.num(input.sleep_id);
    if (sleepId != null) {
      const deleted = this.deps.sleepLogRepository.delete(this.chatId, sleepId);
      if (!deleted) {
        return JSON.stringify({ success: false, message: 'Sleep entry not found or already deleted.' });
      }
      return JSON.stringify({ success: true, deleted_sleep_id: sleepId, message: 'Sleep entry deleted.' });
    }
    const last = this.deps.sleepLogRepository.deleteLast(this.chatId);
    if (!last) {
      return JSON.stringify({ success: false, message: 'No sleep entries to delete.' });
    }
    return JSON.stringify({
      success: true,
      deleted_sleep_id: last.id,
      message: `Deleted sleep entry for ${last.date}.`,
    });
  }

  private updateSleep(input: Record<string, unknown>): string {
    const sleepId = this.num(input.sleep_id);
    if (sleepId == null) {
      return JSON.stringify({ success: false, message: 'sleep_id is required.' });
    }
    const partial: Parameters<SleepLogRepository['update']>[2] = {};
    if (typeof input.raw_text === 'string') partial.rawText = input.raw_text;
    if (typeof input.date === 'string') partial.date = input.date;
    if (this.num(input.sleep_score) != null) partial.sleepScore = this.num(input.sleep_score)!;
    if (this.num(input.time_slept_minutes) != null) partial.timeSleptMinutes = this.num(input.time_slept_minutes)!;
    if (this.num(input.deep_sleep_minutes) != null) partial.deepSleepMinutes = this.num(input.deep_sleep_minutes)!;
    if (this.num(input.rem_sleep_minutes) != null) partial.remSleepMinutes = this.num(input.rem_sleep_minutes)!;
    if (this.num(input.rhr) != null) partial.rhr = this.num(input.rhr)!;
    if (this.num(input.hrv) != null) partial.hrv = this.num(input.hrv)!;
    if (this.num(input.interruptions) != null) partial.interruptions = this.num(input.interruptions)!;
    const updated = this.deps.sleepLogRepository.update(this.chatId, sleepId, partial);
    if (!updated) {
      return JSON.stringify({ success: false, message: 'Sleep entry not found.' });
    }
    return JSON.stringify({
      success: true,
      entry: {
        id: updated.id,
        date: updated.date,
        sleep_score: updated.sleepScore,
        time_slept_minutes: updated.timeSleptMinutes,
        deep_sleep_minutes: updated.deepSleepMinutes,
        rem_sleep_minutes: updated.remSleepMinutes,
        rhr: updated.rhr,
        hrv: updated.hrv,
        interruptions: updated.interruptions,
      },
    });
  }

  // ============================================================================
  // OBSIDIAN TOOLS
  // ============================================================================

  private async createNote(input: Record<string, unknown>): Promise<string> {
    const title = String(input.title ?? '');
    const content = String(input.content ?? '');
    const category = String(input.category ?? '');
    const tags = Array.isArray(input.tags) ? input.tags.map(String) : [];

    const result = await this.deps.notesPort.createNote({
      title,
      content,
      category,
      tags,
    });

    return JSON.stringify({
      success: true,
      path: result.path,
      title,
      category,
    });
  }

  private async appendToDaily(input: Record<string, unknown>): Promise<string> {
    const content = String(input.content ?? '');

    await this.deps.notesPort.appendToDaily(content);

    const today = new Date().toISOString().split('T')[0];
    return JSON.stringify({
      success: true,
      date: today,
      content_preview: content.slice(0, 100),
    });
  }

  private async searchNotes(input: Record<string, unknown>): Promise<string> {
    const query = String(input.query ?? '');

    const results = await this.deps.notesPort.searchNotes(query);

    return JSON.stringify({
      query,
      count: results.length,
      results: results.slice(0, 10).map((r) => ({
        title: r.title,
        path: r.path,
        excerpt: r.excerpt,
      })),
    });
  }

  private async getTasks(input: Record<string, unknown>): Promise<string> {
    const status = input.status as 'open' | 'done' | undefined;
    const project = typeof input.project === 'string' ? input.project : undefined;

    const tasks = await this.deps.notesPort.getTasks({ status, project });

    return JSON.stringify({
      count: tasks.length,
      tasks: tasks.slice(0, 20).map((t) => ({
        title: t.title,
        status: t.status,
        path: t.path,
        project: t.project,
      })),
    });
  }

  private async getCategories(): Promise<string> {
    const categories = await this.deps.notesPort.getCategories();

    return JSON.stringify({
      count: categories.length,
      categories: categories.map((c) => ({
        path: c.path,
        name: c.name,
        tags: c.tags,
      })),
    });
  }

  private async readNote(input: Record<string, unknown>): Promise<string> {
    const path = String(input.path ?? '');

    const note = await this.deps.notesPort.readNote(path);

    if (!note) {
      return JSON.stringify({
        found: false,
        message: `Note not found: ${path}`,
      });
    }

    return JSON.stringify({
      found: true,
      title: note.title,
      path: note.path,
      content: note.content,
    });
  }

  private async readDailyNote(input: Record<string, unknown>): Promise<string> {
    const date = typeof input.date === 'string' ? input.date : undefined;

    const note = await this.deps.notesPort.readDailyNote(date);

    if (!note) {
      const targetDate = date ?? new Date().toISOString().split('T')[0];
      return JSON.stringify({
        found: false,
        message: `No daily note found for ${targetDate}`,
      });
    }

    return JSON.stringify({
      found: true,
      title: note.title,
      path: note.path,
      content: note.content,
    });
  }

  private async listNotes(input: Record<string, unknown>): Promise<string> {
    const folder = typeof input.folder === 'string' ? input.folder : undefined;

    const notes = await this.deps.notesPort.listNotes(folder);

    return JSON.stringify({
      folder: folder ?? '(all)',
      count: notes.length,
      notes: notes.slice(0, 50).map((n) => ({
        title: n.title,
        path: n.path,
        modified_at: n.modifiedAt?.toISOString(),
      })),
    });
  }

  private async updateNote(input: Record<string, unknown>): Promise<string> {
    const path = String(input.path ?? '');
    const content = String(input.content ?? '');

    await this.deps.notesPort.updateNote(path, content);

    return JSON.stringify({
      success: true,
      path,
      content_length: content.length,
    });
  }

  // ============================================================================
  // UTILITY TOOLS
  // ============================================================================

  private async fetchUrl(input: Record<string, unknown>): Promise<string> {
    const url = String(input.url ?? '');
    const logger = this.logger.child({ method: 'fetchUrl', url });

    if (!url) {
      return JSON.stringify({ error: 'No URL provided' });
    }

    try {
      logger.info('Fetching URL');
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PersonalAssistantBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15000), // 15s timeout
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Failed to fetch URL');
        return JSON.stringify({
          error: `Failed to fetch: HTTP ${response.status}`,
          url,
        });
      }

      const html = await response.text();
      const title = this.extractTitle(html);
      const text = this.extractTextFromHtml(html);
      
      // Limit content to avoid token overflow (roughly 12k chars)
      const maxLength = 12000;
      const truncated = text.length > maxLength;
      const content = truncated ? text.slice(0, maxLength) + '\n\n[Content truncated...]' : text;

      logger.info(
        { htmlLength: html.length, textLength: text.length, truncated },
        'Extracted text from URL'
      );

      return JSON.stringify({
        success: true,
        url,
        title,
        content_length: content.length,
        truncated,
        content,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn({ error }, 'Failed to fetch URL');
      return JSON.stringify({
        error: `Failed to fetch URL: ${message}`,
        url,
      });
    }
  }

  private readChatHistory(input: Record<string, unknown>): string {
    const limit = this.num(input.limit);
    const offset = this.num(input.offset) ?? 0;
    const effectiveLimit = limit != null && limit > 0 ? Math.min(limit, 50) : 6;
    const effectiveOffset = offset != null && offset >= 0 ? offset : 0;

    const messages = this.deps.messageHistoryRepository.getConversation(
      this.chatId,
      effectiveLimit,
      effectiveOffset
    );

    if (messages.length === 0) {
      return JSON.stringify({
        found: false,
        message: effectiveOffset > 0 ? 'No older messages in that range.' : 'No chat history yet.',
      });
    }

    return JSON.stringify({
      found: true,
      count: messages.length,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      })),
    });
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match?.[1]?.trim() ?? '';
  }

  private extractTextFromHtml(html: string): string {
    let text = html;
    // Remove script and style blocks
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
    text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, ' ');
    // Remove nav, header, footer, aside (often boilerplate)
    text = text.replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    // Convert common block elements to newlines
    text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&mdash;/g, '—');
    text = text.replace(/&ndash;/g, '–');
    // Collapse whitespace
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n\s*\n/g, '\n\n');
    return text.trim();
  }
}
