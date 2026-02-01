import { describe, it, expect, vi } from 'vitest';
import { DigestBuilder } from '../../core/digest/DigestBuilder.js';
import type { SleepDataPort } from '../../ports/SleepDataPort.js';
import type { CalendarPort } from '../../ports/CalendarPort.js';
import type { EmailPort } from '../../ports/EmailPort.js';
import type { LLMPort } from '../../ports/LLMPort.js';
import type { PendingCaptureRepository } from '../../persistence/repositories/PendingCaptureRepository.js';

describe('DigestBuilder', () => {
  const sleepPort: SleepDataPort = {
    getLastNight: vi.fn().mockResolvedValue({
      date: '2026-01-30',
      sleepScore: 80,
      deepSleepMinutes: 90,
      remSleepMinutes: 100,
      timeAsleep: 420,
      timeToBed: '23:00',
      timeAwake: '07:00',
      hrv: 40,
      restingHeartRate: 55,
      predictedEnergyPeak: '10:00',
      predictedEnergyTrough: '14:00',
    }),
    getRange: vi.fn().mockResolvedValue([]),
  };
  const calendarPort: CalendarPort = {
    getTodayEvents: vi.fn().mockResolvedValue([]),
    getEvents: vi.fn().mockResolvedValue([]),
  };
  const emailPort: EmailPort = {
    getUnreadNewsletters: vi.fn().mockResolvedValue([]),
  };
  const llmPort: LLMPort = {
    generateText: vi.fn().mockResolvedValue({ text: 'LLM digest output' }),
    generateVision: vi.fn().mockResolvedValue({ text: '' }),
  };
  const pendingRepo = {
    getUnresolved: vi.fn().mockReturnValue([]),
  } as unknown as PendingCaptureRepository;

  it('returns LLM digest when available', async () => {
    const builder = new DigestBuilder(
      sleepPort,
      calendarPort,
      emailPort,
      llmPort,
      pendingRepo,
      'Prompt {{DATA}}'
    );

    const digest = await builder.buildDigest();
    expect(digest).toBe('LLM digest output');
  });

  it('falls back to basic digest when LLM returns empty', async () => {
    llmPort.generateText = vi.fn().mockResolvedValue({ text: '' });
    const builder = new DigestBuilder(
      sleepPort,
      calendarPort,
      emailPort,
      llmPort,
      pendingRepo,
      'Prompt {{DATA}}'
    );

    const digest = await builder.buildDigest();
    expect(digest).toContain("Good morning! Here's your daily brief:");
  });
});
