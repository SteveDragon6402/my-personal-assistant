import type { EmailPort, Newsletter } from '../../ports/EmailPort.js';
import type { Config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { AdapterError } from '../../utils/errors.js';
import { extractNewsletter, type GmailMessage } from './NewsletterExtractor.js';

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
}

export class GmailAdapter implements EmailPort {
  private readonly logger = createLogger({ adapter: 'GmailAdapter' });
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly refreshToken?: string;
  private readonly userId: string;

  constructor(config: Config) {
    this.clientId = config.gmailClientId;
    this.clientSecret = config.gmailClientSecret;
    this.refreshToken = config.gmailRefreshToken;
    this.userId = config.gmailUserId ?? 'me';
  }

  async getUnreadNewsletters(since: Date): Promise<Newsletter[]> {
    const logger = this.logger.child({ method: 'getUnreadNewsletters' });
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      logger.warn('Gmail credentials missing; skipping newsletters');
      return [];
    }

    try {
      const accessToken = await this.fetchAccessToken();
      const unixSeconds = Math.floor(since.getTime() / 1000);
      const query = encodeURIComponent(`is:unread after:${unixSeconds}`);
      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/${this.userId}/messages?q=${query}`;
      const listResponse = await this.gmailRequest<GmailListResponse>(listUrl, accessToken);
      const messageIds = listResponse.messages?.map((message) => message.id) ?? [];

      const newsletters: Newsletter[] = [];
      for (const messageId of messageIds) {
        const messageUrl = `https://gmail.googleapis.com/gmail/v1/users/${this.userId}/messages/${messageId}?format=full`;
        const message = await this.gmailRequest<GmailMessage>(messageUrl, accessToken);
        const newsletter = extractNewsletter(message);
        if (newsletter) {
          newsletters.push(newsletter);
        }
      }

      logger.info({ newsletters: newsletters.length }, 'Fetched unread newsletters');
      return newsletters;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch newsletters');
      throw new AdapterError('EMAIL', 'Failed to fetch newsletters', { cause: error });
    }
  }

  private async fetchAccessToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error('Missing Gmail OAuth credentials');
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
      throw new Error(`Failed to refresh Gmail token: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new Error('Gmail token response missing access_token');
    }
    return data.access_token;
  }

  private async gmailRequest<T>(url: string, accessToken: string): Promise<T> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gmail API error: ${response.status} ${text}`);
    }

    return (await response.json()) as T;
  }
}
