import type { DigestBuilder } from '../core/digest/DigestBuilder.js';
import type { MessagePort } from '../ports/MessagePort.js';
import type { MessageHistoryRepository } from '../persistence/repositories/MessageHistoryRepository.js';
import type { UserPreferencesRepository } from '../persistence/repositories/UserPreferencesRepository.js';
import { createLogger } from '../utils/logger.js';

export class DailyDigestJob {
  private readonly logger = createLogger({ job: 'DailyDigestJob' });

  constructor(
    private readonly digestBuilder: DigestBuilder,
    private readonly messagePort: MessagePort,
    private readonly messageHistoryRepository: MessageHistoryRepository,
    private readonly userPreferencesRepository: UserPreferencesRepository,
    private readonly defaultDigestTime: string,
    private readonly defaultTimezone: string
  ) {}

  async run(): Promise<void> {
    const logger = this.logger.child({ method: 'run' });
    const recipient = this.messageHistoryRepository.getLatestSender();
    if (!recipient) {
      logger.warn('No recent sender found; skipping digest');
      return;
    }

    const prefs = this.userPreferencesRepository.getOrDefault(recipient, {
      digestTime: this.defaultDigestTime,
      timezone: this.defaultTimezone,
    });

    try {
      const digest = await this.digestBuilder.buildDigest(
        new Date(),
        {
          includeSleep: prefs.includeSleep,
          includeNewsletters: prefs.includeNewsletters,
          includeCalendar: prefs.includeCalendar,
          includeCaptureReview: prefs.includeCaptureReview,
        },
        recipient
      );
      await this.messagePort.sendMessage(recipient, digest);
      logger.info({ recipient }, 'Daily digest sent');
    } catch (error) {
      logger.error({ error }, 'Failed to send daily digest');
    }
  }

  /** Build and send digest for a specific user (e.g. manual /digest trigger). */
  async runForUser(chatId: string): Promise<void> {
    const logger = this.logger.child({ method: 'runForUser', chatId });
    const prefs = this.userPreferencesRepository.getOrDefault(chatId, {
      digestTime: this.defaultDigestTime,
      timezone: this.defaultTimezone,
    });

    try {
      const digest = await this.digestBuilder.buildDigest(
        new Date(),
        {
          includeSleep: prefs.includeSleep,
          includeNewsletters: prefs.includeNewsletters,
          includeCalendar: prefs.includeCalendar,
          includeCaptureReview: prefs.includeCaptureReview,
        },
        chatId
      );
      await this.messagePort.sendMessage(chatId, digest);
      logger.info({ chatId }, 'Digest sent (manual trigger)');
    } catch (error) {
      logger.error({ error }, 'Failed to send digest');
      throw error;
    }
  }
}
