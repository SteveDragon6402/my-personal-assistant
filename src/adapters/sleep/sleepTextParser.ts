import type { SleepData } from '../../ports/SleepDataPort.js';

/**
 * Parse raw sleep summary text (e.g. from a sleep tracker app) into structured SleepData.
 * Handles common patterns: "Score: 82", "82%", "1h 42m", "Deep: 1h 42m", "11:15pm", etc.
 */
export function parseSleepText(raw: string, date: string): SleepData | null {
  const t = raw.trim();
  if (!t) return null;

  const score = pickScore(t);
  const deep = pickMinutes(t, /\bdeep[:\s]*(\d+)\s*h?\s*(\d*)\s*m?/i, /\b(\d+)\s*h\s*(\d+)\s*m\s*deep/i);
  const rem = pickMinutes(t, /\brem[:\s]*(\d+)\s*h?\s*(\d*)\s*m?/i, /\b(\d+)\s*h\s*(\d+)\s*m\s*rem/i);
  const timeAsleep = pickTotalMinutes(t);
  const timeToBed = pickTime(t, /\bbed[:\s]*(\d{1,2}:\d{2}\s*[ap]m|\d{1,2}[ap]m)/i) ?? '—';
  const timeAwake = pickTime(t, /\b(wake|awake|up)[:\s]*(\d{1,2}:\d{2}\s*[ap]m|\d{1,2}[ap]m)/i) ?? '—';
  const hrv = pickNumber(t, /\bhrv[:\s]*(\d+)/i) ?? 0;
  const rhr = pickNumber(t, /\b(resting\s*)?heart\s*rate[:\s]*(\d+)/i) ?? pickNumber(t, /\brhr[:\s]*(\d+)/i) ?? 0;
  const peak = pickTime(t, /\b(peak|energy\s*peak)[:\s]*(\d{1,2}:\d{2}|\d{1,2}[ap]m)/i);
  const trough = pickTime(t, /\b(trough|low)[:\s]*(\d{1,2}:\d{2}|\d{1,2}[ap]m)/i);

  if (score === undefined && deep === undefined && rem === undefined && timeAsleep === undefined) {
    return null;
  }

  const data: SleepData = {
    date,
    sleepScore: score ?? 0,
    deepSleepMinutes: deep ?? 0,
    remSleepMinutes: rem ?? 0,
    timeAsleep: timeAsleep ?? 0,
    timeToBed,
    timeAwake,
    hrv,
    restingHeartRate: rhr,
  };
  if (peak !== undefined) data.predictedEnergyPeak = peak;
  if (trough !== undefined) data.predictedEnergyTrough = trough;
  return data;
}

function pickScore(text: string): number | undefined {
  const m = text.match(/\b(?:score|sleep\s*score)[:\s]*(\d+)/i) ?? text.match(/\b(\d{2,3})\s*%\s*(?:sleep|score)?/);
  if (m?.[1]) {
    const n = parseInt(m[1], 10);
    return n <= 100 ? n : Math.round(n / 10);
  }
  return undefined;
}

function pickMinutes(
  text: string,
  ...patterns: RegExp[]
): number | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const h = parseInt(m[1] ?? '0', 10);
      const min = parseInt(m[2] ?? '0', 10);
      return h * 60 + min;
    }
  }
  return undefined;
}

function pickTotalMinutes(text: string): number | undefined {
  const m = text.match(/\b(?:total\s*)?(?:sleep|duration)[:\s]*(\d+)\s*h\s*(\d*)\s*m?/i)
    ?? text.match(/\b(\d+)\s*h\s*(\d+)\s*m\b/i)
    ?? text.match(/\b(\d+)\s*hrs?\s*(\d*)\s*min?/i);
  if (m?.[1]) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2] ?? '0', 10);
    return h * 60 + min;
  }
  return undefined;
}

function pickTime(text: string, re: RegExp): string | undefined {
  const m = text.match(re);
  const group = m?.[2] ?? m?.[1];
  return typeof group === 'string' ? group.trim() : undefined;
}

function pickNumber(text: string, re: RegExp): number | undefined {
  const m = text.match(re);
  const group = m?.[2] ?? m?.[1];
  if (group === undefined) return undefined;
  const n = parseInt(group, 10);
  return Number.isNaN(n) ? undefined : n;
}
