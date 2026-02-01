import type { SleepDataPort, SleepData } from '../../ports/SleepDataPort.js';
import type { CalendarPort, CalendarEvent } from '../../ports/CalendarPort.js';
import type { EmailPort, Newsletter } from '../../ports/EmailPort.js';
import type { LLMPort } from '../../ports/LLMPort.js';
import type { PendingCaptureRepository } from '../../persistence/repositories/PendingCaptureRepository.js';
import { createLogger } from '../../utils/logger.js';

export interface DigestSectionToggles {
  includeSleep?: boolean;
  includeNewsletters?: boolean;
  includeCalendar?: boolean;
  includeCaptureReview?: boolean;
}

export class DigestBuilder {
  private readonly logger = createLogger({ service: 'DigestBuilder' });

  constructor(
    private readonly sleepPort: SleepDataPort,
    private readonly calendarPort: CalendarPort,
    private readonly emailPort: EmailPort,
    private readonly llmPort: LLMPort,
    private readonly pendingCaptureRepository: PendingCaptureRepository,
    private readonly digestPrompt: string
  ) {}

  async buildDigest(
    now: Date = new Date(),
    toggles: DigestSectionToggles = {},
    chatId?: string
  ): Promise<string> {
    const logger = this.logger.child({ date: now.toISOString() });
    const includeSleep = toggles.includeSleep !== false;
    const includeNewsletters = toggles.includeNewsletters !== false;
    const includeCalendar = toggles.includeCalendar !== false;
    const includeCaptureReview = toggles.includeCaptureReview !== false;

    const [sleepResult, calendarResult, emailResult] = await Promise.allSettled([
      includeSleep ? this.sleepPort.getLastNight(chatId) : Promise.resolve(null),
      includeCalendar ? this.calendarPort.getTodayEvents() : Promise.resolve([]),
      includeNewsletters
        ? this.emailPort.getUnreadNewsletters(new Date(now.getTime() - 24 * 60 * 60 * 1000))
        : Promise.resolve([]),
    ]);

    const sleep = includeSleep && sleepResult.status === 'fulfilled' ? sleepResult.value : null;
    const events = includeCalendar && calendarResult.status === 'fulfilled' ? calendarResult.value : [];
    const allNewsletters = includeNewsletters && emailResult.status === 'fulfilled' ? emailResult.value : [];
    const pendingCaptures =
      includeCaptureReview ? this.pendingCaptureRepository.getUnresolved() : [];

    const recentNewsletters = [...allNewsletters]
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .slice(0, 5)
      .map((newsletter) => ({
        ...newsletter,
        body: truncate(newsletter.body, 8000),
      }));

    const payload = {
      date: now.toISOString().split('T')[0],
      sleep,
      events,
      newsletters: recentNewsletters,
      pendingCaptures: pendingCaptures.map((capture) => ({
        content: capture.content,
        suggestedCategory: capture.suggestedCategory,
        confidence: capture.confidence,
      })),
    };

    try {
      const response = await this.llmPort.generateText({
        prompt: this.digestPrompt.replace('{{DATA}}', JSON.stringify(payload, null, 2)),
        temperature: 0.3,
        maxTokens: 700,
      });
      if (response.text.trim()) {
        return response.text.trim();
      }
    } catch (error) {
      logger.error({ error }, 'Failed to generate digest via LLM, using fallback');
    }

    return buildFallbackDigest(
      sleep,
      events,
      recentNewsletters,
      pendingCaptures,
      { includeSleep, includeNewsletters, includeCalendar, includeCaptureReview }
    );
  }
}

function buildFallbackDigest(
  sleep: SleepData | null,
  events: CalendarEvent[],
  newsletters: Newsletter[],
  pendingCaptures: Array<{
    content: string;
    suggestedCategory?: string;
    confidence?: number;
  }>,
  toggles: DigestSectionToggles = {}
): string {
  const lines: string[] = [];
  lines.push("☀️ Good morning! Here's your daily brief:");

  if (toggles.includeSleep !== false) {
    lines.push('');
    lines.push('😴 SLEEP');
    if (sleep) {
      lines.push(
        `Score: ${sleep.sleepScore} | Deep: ${sleep.deepSleepMinutes}m | REM: ${sleep.remSleepMinutes}m`
      );
      lines.push(`Bed: ${sleep.timeToBed} → Awake: ${sleep.timeAwake}`);
      lines.push(
        `💡 Energy peak ~${sleep.predictedEnergyPeak ?? 'unknown'}, trough ~${sleep.predictedEnergyTrough ?? 'unknown'}`
      );
    } else {
      lines.push('Sleep data unavailable.');
    }
  }

  if (toggles.includeNewsletters !== false) {
    lines.push('');
    lines.push(`📬 NEWSLETTERS (${newsletters.length} new)`);
    if (newsletters.length === 0) {
      lines.push('No newsletters today ✨');
    } else {
      newsletters.slice(0, 5).forEach((newsletter) => {
        lines.push(`- ${newsletter.subject}: ${truncate(newsletter.body, 120)}`);
      });
    }
  }

  if (toggles.includeCalendar !== false) {
    lines.push('');
    lines.push('📅 CALENDAR');
    if (events.length === 0) {
      lines.push('No meetings today ✨');
    } else {
      events.forEach((event) => {
        lines.push(`- ${event.title} (${formatTime(event.start)} - ${formatTime(event.end)})`);
      });
    }
  }

  if (toggles.includeCaptureReview !== false && pendingCaptures.length > 0) {
    lines.push('');
    lines.push('📝 CAPTURE REVIEW');
    pendingCaptures.slice(0, 5).forEach((capture) => {
      const confidence =
        capture.confidence !== undefined ? ` (${Math.round(capture.confidence * 100)}%)` : '';
      lines.push(`- "${truncate(capture.content, 80)}" → ${capture.suggestedCategory ?? 'Uncategorized'}${confidence}`);
    });
  }

  return lines.join('\n');
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
