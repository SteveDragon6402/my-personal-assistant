import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GmailAdapter } from '../../adapters/email/GmailAdapter.js';
import type { Config } from '../../config/index.js';

describe('GmailAdapter', () => {
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
    const adapter = new GmailAdapter(baseConfig);
    const result = await adapter.getUnreadNewsletters(new Date());
    expect(result).toEqual([]);
  });

  it('fetches newsletters with Gmail API', async () => {
    const adapter = new GmailAdapter({
      ...baseConfig,
      gmailClientId: 'client',
      gmailClientSecret: 'secret',
      gmailRefreshToken: 'refresh',
    });

    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ messages: [{ id: 'msg-1', threadId: 't-1' }] }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'msg-1',
            snippet: 'Hello',
            payload: {
              headers: [
                { name: 'Subject', value: 'Newsletter' },
                { name: 'From', value: 'sender@example.com' },
                { name: 'Date', value: new Date().toUTCString() },
                { name: 'List-Unsubscribe', value: '<https://example.com/unsub>' },
              ],
              body: { data: Buffer.from('Content').toString('base64') },
            },
          }),
          { status: 200 }
        )
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.getUnreadNewsletters(new Date(Date.now() - 1000));
    expect(result.length).toBe(1);
    expect(result[0]?.subject).toBe('Newsletter');
  });
});
