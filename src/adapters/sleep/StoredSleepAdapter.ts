import type { SleepDataPort, SleepData } from '../../ports/SleepDataPort.js';
import type { SleepLogRepository, SleepLogEntry } from '../../persistence/repositories/SleepLogRepository.js';
import { parseSleepText } from './sleepTextParser.js';

function entryToSleepData(entry: SleepLogEntry): SleepData {
  // If we have structured data, use it; otherwise fall back to parsing raw text
  if (entry.sleepScore != null || entry.timeSleptMinutes != null) {
    return {
      date: entry.date,
      sleepScore: entry.sleepScore ?? 0,
      deepSleepMinutes: entry.deepSleepMinutes ?? 0,
      remSleepMinutes: entry.remSleepMinutes ?? 0,
      timeAsleep: entry.timeSleptMinutes ?? 0,
      timeToBed: '', // Not tracked in structured data
      timeAwake: '', // Not tracked in structured data
      hrv: entry.hrv ?? 0,
      restingHeartRate: entry.rhr ?? 0,
      interruptions: entry.interruptions,
      rawText: entry.rawText,
    };
  }

  // Fall back to parsing raw text for legacy entries
  const parsed = parseSleepText(entry.rawText, entry.date);
  return parsed ?? {
    date: entry.date,
    sleepScore: 0,
    deepSleepMinutes: 0,
    remSleepMinutes: 0,
    timeAsleep: 0,
    timeToBed: '',
    timeAwake: '',
    hrv: 0,
    restingHeartRate: 0,
    rawText: entry.rawText,
  };
}

export class StoredSleepAdapter implements SleepDataPort {
  constructor(private readonly sleepLogRepository: SleepLogRepository) {}

  async getLastNight(chatId?: string): Promise<SleepData | null> {
    if (!chatId) return null;
    const entry = this.sleepLogRepository.getLastNight(chatId);
    if (!entry) return null;
    return entryToSleepData(entry);
  }

  async getRange(
    startDate: string,
    endDate: string,
    chatId?: string
  ): Promise<SleepData[]> {
    if (!chatId) return [];
    const entries = this.sleepLogRepository.getRange(chatId, startDate, endDate);
    return entries.map(entryToSleepData);
  }
}
