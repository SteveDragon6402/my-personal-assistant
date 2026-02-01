import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleCalendarAdapter } from '../../adapters/calendar/GoogleCalendarAdapter.js';
import type { Config } from '../../config/index.js';

describe('GoogleCalendarAdapter', () => {
  const baseConfig: Config = {
    telegramBotToken: 'token',
    digestTime: '07:00',
    timezone: 'UTC',
    logLevel: 'info',
    port: 3000,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty list when credentials are missing', async () => {
    const adapter = new GoogleCalendarAdapter(baseConfig);
    const result = await adapter.getEvents(new Date(), new Date());
    expect(result).toEqual([]);
  });

  it('fetches calendar events', async () => {
    const adapter = new GoogleCalendarAdapter({
      ...baseConfig,
      gcalClientId: 'client',
      gcalClientSecret: 'secret',
      gcalRefreshToken: 'refresh',
      gcalCalendarId: 'primary',
    });

    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'evt-1',
                summary: 'Meeting',
                start: { dateTime: new Date().toISOString() },
                end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
              },
            ],
          }),
          { status: 200 }
        )
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.getEvents(new Date(), new Date(Date.now() + 3600000));
    expect(result.length).toBe(1);
    expect(result[0]?.title).toBe('Meeting');
  });
});
