import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramAdapter } from '../../adapters/telegram/TelegramAdapter.js';
import type { Config } from '../../config/index.js';
import TelegramBot from 'node-telegram-bot-api';

// Mock node-telegram-bot-api
vi.mock('node-telegram-bot-api', () => {
  const mockBot = {
    getMe: vi.fn(),
    setWebHook: vi.fn(),
    sendMessage: vi.fn(),
    getFile: vi.fn(),
    on: vi.fn(),
  };

  return {
    default: vi.fn(() => mockBot),
  };
});

describe('TelegramAdapter', () => {
  const mockConfig: Config = {
    telegramBotToken: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz',
    anthropicApiKey: 'test-anthropic-key',
    digestTime: '07:00',
    timezone: 'UTC',
    logLevel: 'info',
    port: 3000,
  };

  let mockBot: ReturnType<typeof TelegramBot>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBot = TelegramBot(mockConfig.telegramBotToken, {}) as unknown as ReturnType<typeof TelegramBot>;
  });

  describe('parseTelegramMessage', () => {
    it('should parse valid text message', async () => {
      const adapter = new TelegramAdapter(mockConfig);
      const telegramMessage: TelegramBot.Message = {
        message_id: 123,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 456789,
          type: 'private',
        },
        text: 'Hello world',
      };

      const handler = vi.fn();
      adapter.onMessage(handler);

      // Simulate message event
      const messageHandlers = (mockBot.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0] === 'message'
      );
      if (messageHandlers) {
        const handlerFunc = messageHandlers[1];
        await handlerFunc(telegramMessage);
      }

      // Since we can't easily test the internal parsing, test via webhook
      await adapter.handleWebhook({ message: telegramMessage });

      expect(handler).toHaveBeenCalled();
      const message = handler.mock.calls[0]?.[0];
      expect(message?.id).toBe('123');
      expect(message?.from).toBe('456789');
      expect(message?.text).toBe('Hello world');
    });

    it('should handle media messages', async () => {
      const adapter = new TelegramAdapter(mockConfig);
      const telegramMessage: TelegramBot.Message = {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 456789,
          type: 'private',
        },
        caption: 'Check this out',
        photo: [
          {
            file_id: 'photo-file-id',
            file_unique_id: 'unique-id',
            width: 100,
            height: 100,
            file_size: 1000,
          },
        ],
      };

      const handler = vi.fn();
      adapter.onMessage(handler);

      await adapter.handleWebhook({ message: telegramMessage });

      expect(handler).toHaveBeenCalled();
      const message = handler.mock.calls[0]?.[0];
      expect(message?.hasMedia).toBe(true);
      expect(message?.mediaType).toBe('photo');
      expect(message?.mediaUrl).toBe('photo-file-id');
    });

    it('should ignore messages without text or media', async () => {
      const adapter = new TelegramAdapter(mockConfig);
      const telegramMessage: TelegramBot.Message = {
        message_id: 789,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 456789,
          type: 'private',
        },
        // No text, photo, video, document, or audio
      };

      const handler = vi.fn();
      adapter.onMessage(handler);

      await adapter.handleWebhook({ message: telegramMessage });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      const mockSentMessage: TelegramBot.Message = {
        message_id: 999,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 456789,
          type: 'private',
        },
        text: 'Test message',
      };

      vi.mocked(mockBot.sendMessage).mockResolvedValue(mockSentMessage);

      const adapter = new TelegramAdapter(mockConfig);
      await adapter.sendMessage('456789', 'Test message');

      expect(mockBot.sendMessage).toHaveBeenCalledWith(456789, 'Test message');
    });

    it('should throw error on invalid chat ID', async () => {
      const adapter = new TelegramAdapter(mockConfig);
      await expect(adapter.sendMessage('invalid', 'Test')).rejects.toThrow();
    });

    it('should throw error on API failure', async () => {
      const error = new Error('Telegram API error');
      vi.mocked(mockBot.sendMessage).mockRejectedValue(error);

      const adapter = new TelegramAdapter(mockConfig);
      await expect(adapter.sendMessage('456789', 'Test')).rejects.toThrow();
    });
  });

  describe('initialize', () => {
    it('should verify bot token and set up handlers', async () => {
      const mockBotInfo: TelegramBot.User = {
        id: 123456789,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'testbot',
      };

      vi.mocked(mockBot.getMe).mockResolvedValue(mockBotInfo);

      const adapter = new TelegramAdapter(mockConfig);
      await adapter.initialize();

      expect(mockBot.getMe).toHaveBeenCalled();
      expect(mockBot.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockBot.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should set up webhook if URL is provided', async () => {
      const configWithWebhook: Config = {
        ...mockConfig,
        telegramWebhookUrl: 'https://example.com',
      };

      const mockBotInfo: TelegramBot.User = {
        id: 123456789,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'testbot',
      };

      vi.mocked(mockBot.getMe).mockResolvedValue(mockBotInfo);
      vi.mocked(mockBot.setWebHook).mockResolvedValue(true);

      const adapter = new TelegramAdapter(configWithWebhook);
      await adapter.initialize();

      expect(mockBot.setWebHook).toHaveBeenCalledWith('https://example.com/webhook/telegram');
    });
  });
});
