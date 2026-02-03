export interface SleepData {
  date: string; // ISO date
  sleepScore: number;
  deepSleepMinutes: number;
  remSleepMinutes: number;
  timeAsleep: number; // in minutes
  timeToBed: string;
  timeAwake: string;
  hrv: number; // Heart rate variability in ms
  restingHeartRate: number; // bpm
  interruptions?: number; // Number of sleep interruptions
  predictedEnergyPeak?: string; // Time of day
  predictedEnergyTrough?: string;
  rawText?: string; // Original raw text for reference
}

export interface SleepDataPort {
  getLastNight(chatId?: string): Promise<SleepData | null>;
  getRange(startDate: string, endDate: string, chatId?: string): Promise<SleepData[]>;
}
