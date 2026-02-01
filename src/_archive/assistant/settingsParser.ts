import type { UserPreferences } from '../../persistence/repositories/UserPreferencesRepository.js';

/** Parses a message as a settings update. Returns partial prefs to apply, or null if not a settings command. */
export function parseSettingsUpdate(text: string): Partial<UserPreferences> | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  // digest HH:MM or digest H:MM
  const digestMatch = t.match(/^digest\s+(\d{1,2}):(\d{2})$/);
  if (digestMatch) {
    const h = digestMatch[1]?.padStart(2, '0') ?? '07';
    const m = digestMatch[2] ?? '00';
    return { digestTime: `${h}:${m}` };
  }

  // timezone <name>
  const tzMatch = t.match(/^timezone\s+(.+)$/);
  if (tzMatch) {
    const tz = tzMatch[1]?.trim();
    if (tz) return { timezone: tz };
  }

  const updates: Partial<UserPreferences> = {};
  let changed = false;

  if (t === 'sleep on') {
    updates.includeSleep = true;
    changed = true;
  } else if (t === 'sleep off') {
    updates.includeSleep = false;
    changed = true;
  } else if (t === 'newsletters on') {
    updates.includeNewsletters = true;
    changed = true;
  } else if (t === 'newsletters off') {
    updates.includeNewsletters = false;
    changed = true;
  } else if (t === 'calendar on') {
    updates.includeCalendar = true;
    changed = true;
  } else if (t === 'calendar off') {
    updates.includeCalendar = false;
    changed = true;
  } else if (t === 'capture on') {
    updates.includeCaptureReview = true;
    changed = true;
  } else if (t === 'capture off') {
    updates.includeCaptureReview = false;
    changed = true;
  }

  return changed ? updates : null;
}

export function formatPreferencesForDisplay(prefs: UserPreferences, defaultDigestTime: string, defaultTimezone: string): string {
  const digestTime = prefs.digestTime ?? defaultDigestTime;
  const timezone = prefs.timezone ?? defaultTimezone;
  return [
    `⏰ Digest: ${digestTime} (${timezone})`,
    `😴 Sleep: ${prefs.includeSleep ? 'on' : 'off'}`,
    `📬 Newsletters: ${prefs.includeNewsletters ? 'on' : 'off'}`,
    `📅 Calendar: ${prefs.includeCalendar ? 'on' : 'off'}`,
    `📝 Capture review: ${prefs.includeCaptureReview ? 'on' : 'off'}`,
  ].join('\n');
}
