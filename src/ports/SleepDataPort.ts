export interface SleepData {
  date: string; // ISO date
  sleepScore: number;
  deepSleepMinutes: number;
  remSleepMinutes: number;
  timeAsleep: number;
  timeToBed: string;
  timeAwake: string;
  hrv: number;
  restingHeartRate: number;
  predictedEnergyPeak?: string; // Time of day
  predictedEnergyTrough?: string;
}

export interface SleepDataPort {
  getLastNight(chatId?: string): Promise<SleepData | null>;
  getRange(startDate: string, endDate: string, chatId?: string): Promise<SleepData[]>;
}
