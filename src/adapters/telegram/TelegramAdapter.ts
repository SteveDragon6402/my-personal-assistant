import type { MessagePort, IncomingMessage } from '../../ports/MessagePort.js';
import type { Config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { TelegramError } from '../../utils/errors.js';
import TelegramBot from 'node-telegram-bot-api';

export class TelegramAdapter implements MessagePort {
  private readonly logger = createLogger({ adapter: 'TelegramAdapter' });
  private readonly bot: TelegramBot;
  private messageHandlers: Array<(message: IncomingMessage) => Promise<void>> = [];

  constructor(private readonly config: Config) {
    // Use polling if no webhook URL is set, otherwise webhook mode
    const options: TelegramBot.ConstructorOptions = config.telegramWebhookUrl
      ? { webHook: false } // Will set webhook manually
      : {
          polling: {
            interval: 300, // Poll every 300ms (0.3 seconds) - faster response
            autoStart: false, // We'll start it manually after initialization
          },
        };
    this.bot = new TelegramBot(config.telegramBotToken, options);
  }

  async initialize(): Promise<void> {
    const logger = this.logger.child({ method: 'initialize' });
    logger.info('Initializing Telegram bot adapter');

    try {
      // Verify bot token by getting bot info
      const me = await this.bot.getMe();
      logger.info({ botId: me.id, botUsername: me.username }, 'Telegram bot verified');

      // Set up message handlers
      this.setupMessageHandlers();

      // If webhook URL is provided, set it up
      if (this.config.telegramWebhookUrl) {
        await this.setupWebhook();
      } else {
        logger.info('No webhook URL configured, using polling mode');
        // Start polling manually (since autoStart is false)
        this.bot.startPolling();
        logger.info('Polling started with 300ms interval');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Telegram adapter');
      throw new TelegramError('Failed to initialize Telegram adapter', { cause: error });
    }
  }

  private setupMessageHandlers(): void {
    // Handle text messages
    this.bot.on('message', async (msg: TelegramBot.Message) => {
      const logger = this.logger.child({ method: 'onMessage', chatId: msg.chat.id });
      logger.debug({ messageId: msg.message_id, text: msg.text }, 'Received message');

      try {
        const incomingMessage = this.parseTelegramMessage(msg);
        if (!incomingMessage) {
          return;
        }

        // Notify all handlers
        await Promise.all(this.messageHandlers.map((handler) => handler(incomingMessage)));
      } catch (error) {
        logger.error({ error }, 'Error processing message');
      }
    });

    // Handle errors
    this.bot.on('error', (error: Error) => {
      this.logger.error({ error }, 'Telegram bot error');
    });

    // Polling errors (network blips, 409 if another poll is active, etc.) – usually transient
    this.bot.on('polling_error', (error: Error) => {
      this.logger.warn(
        { err: error, code: (error as { code?: string }).code },
        'Telegram polling error (often transient; polling will retry)'
      );
    });
  }

  private async setupWebhook(): Promise<void> {
    const logger = this.logger.child({ method: 'setupWebhook' });
    // TELEGRAM_WEBHOOK_URL must be the full URL (e.g. https://yourdomain.com/webhook/telegram)
    const webhookUrl = this.config.telegramWebhookUrl as string;

    try {
      await this.bot.setWebHook(webhookUrl);
      logger.info({ webhookUrl }, 'Webhook set successfully');
    } catch (error) {
      logger.error(
        { error, webhookUrl },
        'Failed to set webhook (app will keep running). Use a domain that resolves from the internet and set webhook manually: curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>"'
      );
      // Do not throw: keep app running so HTTP server can receive webhooks once URL is fixed
    }
  }

  async sendMessage(to: string, text: string): Promise<void> {
    const logger = this.logger.child({ method: 'sendMessage', to });
    logger.info({ textLength: text.length }, 'Sending message');

    try {
      const chatId = parseInt(to, 10);
      if (isNaN(chatId)) {
        throw new Error(`Invalid chat ID: ${to}`);
      }

      const sentMessage = await this.bot.sendMessage(chatId, text);
      logger.info({ messageId: sentMessage.message_id }, 'Message sent successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to send message');
      throw new TelegramError('Failed to send message', { cause: error });
    }
  }

  onMessage(handler: (message: IncomingMessage) => Promise<void>): void {
    this.messageHandlers.push(handler);
  }

  async getMediaUrl(fileId: string): Promise<string> {
    return this.getFileUrl(fileId);
  }

  async handleWebhook(update: unknown): Promise<void> {
    const logger = this.logger.child({ method: 'handleWebhook' });
    logger.debug({ update }, 'Received webhook update');

    try {
      // Telegram sends Update objects
      const telegramUpdate = update as TelegramBot.Update;
      if (!telegramUpdate.message) {
        logger.debug('Webhook update does not contain a message');
        return;
      }

      const incomingMessage = this.parseTelegramMessage(telegramUpdate.message);
      if (!incomingMessage) {
        return;
      }

      logger.info({ messageId: incomingMessage.id, from: incomingMessage.from }, 'Processing webhook message');

      // Notify all handlers
      await Promise.all(this.messageHandlers.map((handler) => handler(incomingMessage)));
    } catch (error) {
      logger.error({ error }, 'Error processing webhook');
      throw error;
    }
  }

  private parseTelegramMessage(msg: TelegramBot.Message): IncomingMessage | null {
    if (!msg.text && !msg.photo && !msg.document && !msg.video) {
      // Ignore non-text/non-media messages for now
      return null;
    }

    const chatId = msg.chat.id.toString();
    const messageId = msg.message_id.toString();
    const text = msg.text || msg.caption || '';
    const timestamp = new Date(msg.date * 1000); // Telegram uses Unix timestamp

    // Check for media
    const hasMedia = !!(msg.photo || msg.video || msg.document || msg.audio);
    let mediaUrl: string | undefined;
    let mediaType: string | undefined;

    if (hasMedia) {
      if (msg.photo && msg.photo.length > 0) {
        // Get the largest photo
        const largestPhoto = msg.photo[msg.photo.length - 1];
        if (largestPhoto) {
          mediaUrl = largestPhoto.file_id;
          mediaType = 'photo';
        }
      } else if (msg.video) {
        mediaUrl = msg.video.file_id;
        mediaType = 'video';
      } else if (msg.document) {
        mediaUrl = msg.document.file_id;
        mediaType = 'document';
      } else if (msg.audio) {
        mediaUrl = msg.audio.file_id;
        mediaType = 'audio';
      }
    }

    const incomingMessage: IncomingMessage = {
      id: messageId,
      from: chatId,
      text,
      timestamp,
      hasMedia,
    };

    if (mediaUrl) {
      incomingMessage.mediaUrl = mediaUrl;
    }
    if (mediaType) {
      incomingMessage.mediaType = mediaType;
    }
    const forwardFrom = (msg as TelegramBot.Message & { forward_sender_name?: string; forward_from?: { username?: string; first_name?: string } }).forward_sender_name
      ?? (msg as TelegramBot.Message & { forward_from?: { username?: string; first_name?: string } }).forward_from?.username
      ?? (msg as TelegramBot.Message & { forward_from?: { first_name?: string } }).forward_from?.first_name;
    if (forwardFrom) {
      incomingMessage.forwardedFrom = forwardFrom;
    }

    return incomingMessage;
  }

  // Helper method to get file URL from Telegram file ID
  async getFileUrl(fileId: string): Promise<string> {
    try {
      const file = await this.bot.getFile(fileId);
      return `https://api.telegram.org/file/bot${this.config.telegramBotToken}/${file.file_path}`;
    } catch (error) {
      this.logger.error({ error, fileId }, 'Failed to get file URL');
      throw new TelegramError('Failed to get file URL', { cause: error });
    }
  }
}
