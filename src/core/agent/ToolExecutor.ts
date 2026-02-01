import type { NotesPort } from '../../ports/NotesPort.js';
import type { EmailPort } from '../../ports/EmailPort.js';
import type { SleepDataPort } from '../../ports/SleepDataPort.js';
import type { MealRepository } from '../../persistence/repositories/MealRepository.js';
import type { SleepLogRepository } from '../../persistence/repositories/SleepLogRepository.js';
import { createLogger } from '../../utils/logger.js';

export interface ToolExecutorDependencies {
  notesPort: NotesPort;
  emailPort: EmailPort;
  sleepDataPort: SleepDataPort;
  sleepLogRepository: SleepLogRepository;
  mealRepository: MealRepository;
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

  private logMeal(input: Record<string, unknown>): string {
    const date = new Date().toISOString().split('T')[0] ?? '';
    const description = String(input.description ?? '');
    const calories = typeof input.calories === 'number' ? input.calories : undefined;
    const protein = typeof input.protein === 'number' ? input.protein : undefined;
    const carbs = typeof input.carbs === 'number' ? input.carbs : undefined;
    const fat = typeof input.fat === 'number' ? input.fat : undefined;

    const meal = this.deps.mealRepository.create({
      chatId: this.chatId,
      date,
      description,
      estimatedCalories: calories,
      estimatedProtein: protein,
      estimatedCarbs: carbs,
      estimatedFat: fat,
    });

    return JSON.stringify({
      success: true,
      meal: {
        id: meal.id,
        description: meal.description,
        calories: meal.estimatedCalories,
        protein: meal.estimatedProtein,
        carbs: meal.estimatedCarbs,
        fat: meal.estimatedFat,
        date: meal.date,
      },
    });
  }

  private getMealsToday(): string {
    const today = new Date().toISOString().split('T')[0] ?? '';
    const meals = this.deps.mealRepository.getByDate(this.chatId, today);

    const totalCalories = meals.reduce((sum, m) => sum + (m.estimatedCalories ?? 0), 0);
    const totalProtein = meals.reduce((sum, m) => sum + (m.estimatedProtein ?? 0), 0);
    const totalCarbs = meals.reduce((sum, m) => sum + (m.estimatedCarbs ?? 0), 0);
    const totalFat = meals.reduce((sum, m) => sum + (m.estimatedFat ?? 0), 0);

    return JSON.stringify({
      date: today,
      meals: meals.map((m) => ({
        description: m.description,
        calories: m.estimatedCalories,
        protein: m.estimatedProtein,
        carbs: m.estimatedCarbs,
        fat: m.estimatedFat,
      })),
      totals: {
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
      },
    });
  }

  private getMealsRange(input: Record<string, unknown>): string {
    const startDate = String(input.start_date ?? '');
    const endDate = String(input.end_date ?? '');
    const meals = this.deps.mealRepository.getByDateRange(this.chatId, startDate, endDate);

    const totalCalories = meals.reduce((sum, m) => sum + (m.estimatedCalories ?? 0), 0);
    const totalProtein = meals.reduce((sum, m) => sum + (m.estimatedProtein ?? 0), 0);

    return JSON.stringify({
      start_date: startDate,
      end_date: endDate,
      meal_count: meals.length,
      meals: meals.map((m) => ({
        date: m.date,
        description: m.description,
        calories: m.estimatedCalories,
        protein: m.estimatedProtein,
        carbs: m.estimatedCarbs,
        fat: m.estimatedFat,
      })),
      totals: {
        calories: totalCalories,
        protein: totalProtein,
      },
    });
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

    const entry = this.deps.sleepLogRepository.create(this.chatId, date, rawText);

    return JSON.stringify({
      success: true,
      entry: {
        id: entry.id,
        date: entry.date,
        raw_text_preview: entry.rawText.slice(0, 200),
      },
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
        date: s.date,
        score: s.sleepScore,
        deep_minutes: s.deepSleepMinutes,
        rem_minutes: s.remSleepMinutes,
      })),
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
