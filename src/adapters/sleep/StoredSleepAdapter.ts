import type { SleepDataPort, SleepData } from '../../ports/SleepDataPort.js';
import type { SleepLogRepository } from '../../persistence/repositories/SleepLogRepository.js';
import { parseSleepText } from './sleepTextParser.js';

export class StoredSleepAdapter implements SleepDataPort {
  constructor(private readonly sleepLogRepository: SleepLogRepository) {}

  async getLastNight(chatId?: string): Promise<SleepData | null> {
    if (!chatId) return null;
    const entry = this.sleepLogRepository.getLastNight(chatId);
    if (!entry) return null;
    const parsed = parseSleepText(entry.rawText, entry.date);
    return parsed;
  }

  async getRange(
    startDate: string,
    endDate: string,
    chatId?: string
  ): Promise<SleepData[]> {
    if (!chatId) return [];
    const entries = this.sleepLogRepository.getRange(chatId, startDate, endDate);
    const result: SleepData[] = [];
    for (const entry of entries) {
      const parsed = parseSleepText(entry.rawText, entry.date);
      if (parsed) result.push(parsed);
    }
    return result;
  }
}
