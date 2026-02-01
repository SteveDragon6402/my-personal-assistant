import type { CalendarPort, CalendarEvent } from '../../ports/CalendarPort.js';
import type { Config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { AdapterError } from '../../utils/errors.js';

interface CalendarEventsResponse {
  items?: Array<{
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  }>;
}

export class GoogleCalendarAdapter implements CalendarPort {
  private readonly logger = createLogger({ adapter: 'GoogleCalendarAdapter' });
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly refreshToken?: string;
  private readonly calendarId: string;
  private readonly timezone: string;

  constructor(config: Config) {
    this.clientId = config.gcalClientId ?? config.gmailClientId;
    this.clientSecret = config.gcalClientSecret ?? config.gmailClientSecret;
    this.refreshToken = config.gcalRefreshToken ?? config.gmailRefreshToken;
    this.calendarId = config.gcalCalendarId ?? 'primary';
    this.timezone = config.timezone;
  }

  async getTodayEvents(): Promise<CalendarEvent[]> {
    const { start, end } = getTodayRange(this.timezone);
    return this.getEvents(start, end);
  }

  async getEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    const logger = this.logger.child({ method: 'getEvents' });
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      logger.warn('Google Calendar credentials missing; skipping events');
      return [];
    }

    try {
      const accessToken = await this.fetchAccessToken();
      const timeMin = startDate.toISOString();
      const timeMax = endDate.toISOString();
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`
      );
      url.searchParams.set('timeMin', timeMin);
      url.searchParams.set('timeMax', timeMax);
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('timeZone', this.timezone);

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Calendar API error: ${response.status} ${text}`);
      }

      const data = (await response.json()) as CalendarEventsResponse;
      const items = data.items ?? [];
      return items
        .map((item) => mapCalendarEvent(item))
        .filter((event): event is CalendarEvent => event !== null);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch calendar events');
      throw new AdapterError('CALENDAR', 'Failed to fetch calendar events', { cause: error });
    }
  }

  private async fetchAccessToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error('Missing Google Calendar OAuth credentials');
    }
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to refresh Calendar token: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new Error('Calendar token response missing access_token');
    }
    return data.access_token;
  }
}

function mapCalendarEvent(item: {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}): CalendarEvent | null {
  const start = parseEventDate(item.start);
  const end = parseEventDate(item.end);
  if (!start || !end) {
    return null;
  }
  return {
    id: item.id,
    title: item.summary ?? 'Untitled',
    start,
    end,
    description: item.description,
    location: item.location,
  };
}

function parseEventDate(value: { dateTime?: string; date?: string } | undefined): Date | null {
  if (!value) {
    return null;
  }
  const dateStr = value.dateTime ?? value.date;
  if (!dateStr) {
    return null;
  }
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTodayRange(timezone: string): { start: Date; end: Date } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offsetMinutes = getTimezoneOffsetMinutes(utcDate, timezone);
  const start = new Date(utcDate.getTime() - offsetMinutes * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const tzPart = parts.find((part) => part.type === 'timeZoneName')?.value;
  if (!tzPart) {
    return 0;
  }
  const match = tzPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return 0;
  }
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = match[3] ? Number(match[3]) : 0;
  return sign * (hours * 60 + minutes);
}
