import type { MessagePort } from '../../ports/MessagePort.js';
import type { SleepDataPort } from '../../ports/SleepDataPort.js';
import type { LLMPort } from '../../ports/LLMPort.js';
import type { IntentClassifierPort } from './types.js';
import { IntentClassifier } from './IntentClassifier.js';
import { createLogger } from '../../utils/logger.js';
import { clearCorrelationId, generateCorrelationId, setCorrelationId } from '../../utils/logger.js';
import type { CaptureService } from '../capture/CaptureService.js';
import type { MessageHistoryRepository } from '../../persistence/repositories/MessageHistoryRepository.js';
import type { UserPreferencesRepository } from '../../persistence/repositories/UserPreferencesRepository.js';
import type { SleepLogRepository } from '../../persistence/repositories/SleepLogRepository.js';
import type { MealRepository } from '../../persistence/repositories/MealRepository.js';
import { loadPrompt } from '../../utils/prompts.js';
import { parseSettingsUpdate, formatPreferencesForDisplay } from './settingsParser.js';

export interface DigestRunner {
  runForUser(chatId: string): Promise<void>;
}

export class AssistantService {
  private readonly logger = createLogger({ service: 'AssistantService' });
  private readonly intentClassifier: IntentClassifierPort;
  private readonly awaitingSleep = new Set<string>();

  constructor(
    private readonly messagePort: MessagePort,
    private readonly captureService: CaptureService,
    private readonly messageHistoryRepository: MessageHistoryRepository,
    private readonly sleepPort: SleepDataPort,
    private readonly sleepLogRepository: SleepLogRepository,
    private readonly userPreferencesRepository: UserPreferencesRepository,
    private readonly mealRepository: MealRepository,
    private readonly llmPort: LLMPort,
    private readonly digestRunner: DigestRunner,
    private readonly defaultDigestTime: string,
    private readonly defaultTimezone: string,
    intentClassifier?: IntentClassifierPort
  ) {
    this.intentClassifier = intentClassifier ?? new IntentClassifier();
    this.setupMessageHandler();
  }

  private setupMessageHandler(): void {
    this.messagePort.onMessage(async (message) => {
      const correlationId = generateCorrelationId();
      setCorrelationId(correlationId);

      const logger = this.logger.child({ correlationId, from: message.from });
      logger.info({ messageId: message.id, text: message.text }, 'Received message');

      try {
        this.messageHistoryRepository.save(message);
        await this.handleMessage(message);
      } catch (error) {
        logger.error({ error }, 'Error handling message');
        await this.messagePort.sendMessage(
          message.from,
          'Sorry, I encountered an error processing your message. Please try again.'
        );
      } finally {
        clearCorrelationId();
      }
    });
  }

  private async handleMessage(message: import('../../ports/MessagePort.js').IncomingMessage): Promise<void> {
    const settingsUpdate = parseSettingsUpdate(message.text);
    if (settingsUpdate) {
      this.userPreferencesRepository.upsert({ chatId: message.from, ...settingsUpdate });
      const prefs = this.userPreferencesRepository.getOrDefault(message.from, {
        digestTime: this.defaultDigestTime,
        timezone: this.defaultTimezone,
      });
      await this.messagePort.sendMessage(
        message.from,
        `✅ Updated.\n\n${formatPreferencesForDisplay(prefs, this.defaultDigestTime, this.defaultTimezone)}`
      );
      return;
    }

    if (this.awaitingSleep.has(message.from) && message.text.trim()) {
      this.awaitingSleep.delete(message.from);
      const date = new Date().toISOString().split('T')[0];
      if (!date) return;
      this.sleepLogRepository.create({ chatId: message.from, date, rawText: message.text.trim() });
      await this.messagePort.sendMessage(
        message.from,
        `😴 Stored sleep data for ${date}. Ask "how did I sleep?" anytime to see it.`
      );
      return;
    }

    const classification = await this.intentClassifier.classify(message);
    const logger = this.logger.child({ intent: classification.intent });

    logger.info({ confidence: classification.confidence }, 'Classified intent');

    switch (classification.intent) {
      case 'capture':
        await this.handleCapture(message);
        break;
      case 'meal':
        await this.handleMeal(message);
        break;
      case 'planning':
        await this.handlePlanning(message);
        break;
      case 'reflection':
        await this.handleReflection(message);
        break;
      case 'settings':
        await this.handleSettings(message);
        break;
      case 'sleep_ingest':
        await this.handleSleepIngest(message, classification.entities?.content);
        break;
      case 'digest':
        await this.handleDigest(message);
        break;
      case 'general':
      default:
        await this.handleGeneral(message);
        break;
    }
  }

  private async handleCapture(message: import('../../ports/MessagePort.js').IncomingMessage): Promise<void> {
    await this.messagePort.sendMessage(message.from, '📝 Saving…');
    const outcome = await this.captureService.handleCapture(message);
    if (outcome.status === 'created') {
      await this.messagePort.sendMessage(
        message.from,
        `📝 Saved to ${outcome.category}\nTitle: ${outcome.title}\nPath: ${outcome.path}`
      );
      return;
    }

    if (outcome.status === 'appended') {
      await this.messagePort.sendMessage(
        message.from,
        `📝 Added to daily note: ${outcome.path}`
      );
      return;
    }

    const suggestionText =
      outcome.suggestedCategory && outcome.confidence !== undefined
        ? `Suggested: ${outcome.suggestedCategory} (${Math.round(outcome.confidence * 100)}%)`
        : 'No confident category found.';
    await this.messagePort.sendMessage(
      message.from,
      `📝 Captured for review. ${suggestionText}\nI'll ask you to confirm later.`
    );
  }

  private async handleMeal(message: import('../../ports/MessagePort.js').IncomingMessage): Promise<void> {
    const date = new Date().toISOString().split('T')[0] ?? '';
    const logger = this.logger.child({ method: 'handleMeal', from: message.from });

    if (message.hasMedia && message.mediaUrl && message.mediaType === 'photo') {
      const imageUrl =
        typeof this.messagePort.getMediaUrl === 'function'
          ? await this.messagePort.getMediaUrl(message.mediaUrl)
          : undefined;
      if (!imageUrl) {
        await this.messagePort.sendMessage(
          message.from,
          '🍽️ Photo logging is not available for this channel. Describe your meal in text instead.'
        );
        return;
      }
      const estimate = await this.estimateMealFromImage(imageUrl, logger);
      if (estimate) {
        this.mealRepository.create({
          chatId: message.from,
          date,
          description: estimate.description as string,
          ...(estimate.calories !== undefined && { estimatedCalories: estimate.calories }),
          ...(estimate.protein !== undefined && { estimatedProtein: estimate.protein }),
          ...(estimate.carbs !== undefined && { estimatedCarbs: estimate.carbs }),
          ...(estimate.fat !== undefined && { estimatedFat: estimate.fat }),
        });
        await this.messagePort.sendMessage(
          message.from,
          this.formatMealReply(estimate.description, estimate)
        );
      } else {
        await this.messagePort.sendMessage(
          message.from,
          '🍽️ I couldn’t estimate that meal from the photo. Try describing it in text, or add your Anthropic API key for vision.'
        );
      }
      return;
    }

    const raw = (message.text ?? '').trim().replace(/^\/(meal|meals)\s*/i, '').trim();
    if (!raw) {
      await this.messagePort.sendMessage(
        message.from,
        '🍽️ What did you eat? Send a description (e.g. "chicken salad with olive oil") or a photo of your meal, and I’ll estimate calories and macros.'
      );
      return;
    }

    const estimate = await this.estimateMealFromDescription(raw, logger);
    if (estimate) {
      try {
        this.mealRepository.create({
          chatId: message.from,
          date: date as string,
          description: estimate.description as string,
          ...(estimate.calories !== undefined && { estimatedCalories: estimate.calories }),
          ...(estimate.protein !== undefined && { estimatedProtein: estimate.protein }),
          ...(estimate.carbs !== undefined && { estimatedCarbs: estimate.carbs }),
          ...(estimate.fat !== undefined && { estimatedFat: estimate.fat }),
        });
        await this.messagePort.sendMessage(
          message.from,
          this.formatMealReply(estimate.description, estimate)
        );
      } catch (error) {
        logger.error({ error }, 'Failed to save meal');
        await this.messagePort.sendMessage(message.from, '🍽️ Failed to save meal. Try again.');
      }
    } else {
      await this.messagePort.sendMessage(
        message.from,
        '🍽️ I couldn’t estimate that. Add your Anthropic API key for meal estimates, or describe the meal in more detail.'
      );
    }
  }

  private formatMealReply(
    description: string,
    macros: { calories?: number; protein?: number; carbs?: number; fat?: number }
  ): string {
    const parts: string[] = [];
    if (macros.calories !== undefined) parts.push(`${macros.calories} cal`);
    if (macros.protein !== undefined) parts.push(`${macros.protein}p`);
    if (macros.carbs !== undefined) parts.push(`${macros.carbs}c`);
    if (macros.fat !== undefined) parts.push(`${macros.fat}f`);
    const macroStr = parts.length > 0 ? ` (${parts.join(' ')})` : '';
    return `🍽️ Logged: ${description}${macroStr}`;
  }

  private parseMealEstimateResponse(text: string): {
    description: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  } | null {
    type MealEstimate = {
      description: string;
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
    };
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const description =
        typeof parsed.description === 'string' && parsed.description.trim()
          ? parsed.description.trim()
          : null;
      if (!description) return null;
      const num = (v: unknown): number | undefined =>
        typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
      const calories = num(parsed.calories);
      const protein = num(parsed.protein);
      const carbs = num(parsed.carbs);
      const fat = num(parsed.fat);
      const result: MealEstimate = { description };
      if (calories !== undefined) result.calories = calories;
      if (protein !== undefined) result.protein = protein;
      if (carbs !== undefined) result.carbs = carbs;
      if (fat !== undefined) result.fat = fat;
      return result;
    } catch {
      return null;
    }
  }

  private async estimateMealFromDescription(
    description: string,
    logger: ReturnType<typeof createLogger>
  ): Promise<{
    description: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  } | null> {
    try {
      const promptTemplate = await loadPrompt('meal_estimate_text.md');
      const prompt = promptTemplate.replace('{{DESCRIPTION}}', description);
      const response = await this.llmPort.generateText({
        prompt,
        maxTokens: 300,
        temperature: 0.2,
      });
      if (!response.text?.trim()) return null;
      return this.parseMealEstimateResponse(response.text);
    } catch (error) {
      logger.warn({ error }, 'Meal estimate from description failed');
      return null;
    }
  }

  private async estimateMealFromImage(
    imageUrl: string,
    logger: ReturnType<typeof createLogger>
  ): Promise<{
    description: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  } | null> {
    try {
      const prompt = await loadPrompt('meal_estimate_vision.md');
      const response = await this.llmPort.generateVision({
        imageUrl,
        prompt,
        maxTokens: 300,
      });
      if (!response.text?.trim()) return null;
      return this.parseMealEstimateResponse(response.text);
    } catch (error) {
      logger.warn({ error }, 'Meal estimate from image failed');
      return null;
    }
  }

  private async handlePlanning(message: import('../../ports/MessagePort.js').IncomingMessage): Promise<void> {
    await this.messagePort.sendMessage(
      message.from,
      '📅 Planning feature coming soon. I will analyze your tasks and calendar to suggest what to do.'
    );
  }

  private async handleSleepIngest(
    message: import('../../ports/MessagePort.js').IncomingMessage,
    content: string | undefined
  ): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    if (!date) return;

    if (content && content.length > 0) {
      this.sleepLogRepository.create({ chatId: message.from, date, rawText: content });
      await this.messagePort.sendMessage(
        message.from,
        `😴 Stored sleep data for ${date}. Ask "how did I sleep?" anytime to see it.`
      );
      return;
    }

    this.awaitingSleep.add(message.from);
    await this.messagePort.sendMessage(
      message.from,
      '😴 Paste or forward your sleep summary (e.g. from your sleep app) and I’ll store it for today.'
    );
  }

  private async handleDigest(message: import('../../ports/MessagePort.js').IncomingMessage): Promise<void> {
    try {
      await this.digestRunner.runForUser(message.from);
      await this.messagePort.sendMessage(message.from, '✅ Digest sent.');
    } catch (error) {
      this.logger.error({ error }, 'Manual digest failed');
      await this.messagePort.sendMessage(
        message.from,
        'Sorry, I couldn’t build your digest. Try again in a moment.'
      );
    }
  }

  private async handleReflection(message: import('../../ports/MessagePort.js').IncomingMessage): Promise<void> {
    const text = message.text.toLowerCase();
    const isWeek = /week|last\s*7|7\s*days/.test(text);
    const chatId = message.from;

    try {
      if (isWeek) {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 7);
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        if (!startStr || !endStr) throw new Error('Invalid date');
        const sessions = await this.sleepPort.getRange(startStr, endStr, chatId);
        if (sessions.length === 0) {
          await this.messagePort.sendMessage(
            message.from,
            '😴 No sleep data for the last 7 days. Send /sleep and paste your summary to add it.'
          );
          return;
        }
        const avgScore =
          sessions.reduce((sum, s) => sum + s.sleepScore, 0) / sessions.length;
        const totalDeep = sessions.reduce((sum, s) => sum + s.deepSleepMinutes, 0);
        const totalRem = sessions.reduce((sum, s) => sum + s.remSleepMinutes, 0);
        await this.messagePort.sendMessage(
          message.from,
          `😴 Last 7 days\n` +
            `Average score: ${Math.round(avgScore)}\n` +
            `Total deep sleep: ${Math.round(totalDeep / 60)}h ${totalDeep % 60}m\n` +
            `Total REM: ${Math.round(totalRem / 60)}h ${totalRem % 60}m\n` +
            `Nights: ${sessions.length}`
        );
        return;
      }

      const lastNight = await this.sleepPort.getLastNight(chatId);
      if (!lastNight) {
        await this.messagePort.sendMessage(
          message.from,
          '😴 No sleep data for last night. Send /sleep and paste your summary (or forward it from your sleep app) to add it.'
        );
        return;
      }

      const peak = lastNight.predictedEnergyPeak ?? '—';
      const trough = lastNight.predictedEnergyTrough ?? '—';
      await this.messagePort.sendMessage(
        message.from,
        `😴 Last night\n` +
          `Score: ${lastNight.sleepScore} | Deep: ${lastNight.deepSleepMinutes}m | REM: ${lastNight.remSleepMinutes}m\n` +
          `Bed: ${lastNight.timeToBed} → Awake: ${lastNight.timeAwake}\n` +
          `Energy peak ~${peak}, trough ~${trough}`
      );
    } catch (error) {
      this.logger.error({ error }, 'Reflection (sleep) failed');
      await this.messagePort.sendMessage(
        message.from,
        '😴 Couldn’t load sleep data. Try again later.'
      );
    }
  }

  private async handleSettings(message: import('../../ports/MessagePort.js').IncomingMessage): Promise<void> {
    const prefs = this.userPreferencesRepository.getOrDefault(message.from, {
      digestTime: this.defaultDigestTime,
      timezone: this.defaultTimezone,
    });

    const menu =
      `⚙️ Settings\n\n` +
      formatPreferencesForDisplay(prefs, this.defaultDigestTime, this.defaultTimezone) +
      `\n\nTo change:\n` +
      `• digest 08:00 — set digest time\n` +
      `• timezone Europe/London — set timezone\n` +
      `• sleep on / sleep off\n` +
      `• newsletters on / newsletters off\n` +
      `• calendar on / calendar off\n` +
      `• capture on / capture off — include pending captures in digest`;

    await this.messagePort.sendMessage(message.from, menu);
  }

  private async handleGeneral(message: import('../../ports/MessagePort.js').IncomingMessage): Promise<void> {
    await this.messagePort.sendMessage(
      message.from,
      `👋 Hi! I'm your AI assistant. I can help with:\n\n• Quick capture: /capture or /c\n• Sleep: /sleep (paste summary) or "how did I sleep?"\n• Digest: /digest (send digest now)\n• Meal tracking: /meal\n• Planning: Ask "what should I do?"\n• Settings: /settings\n\nMore features coming soon!`
    );
  }
}
