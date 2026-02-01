import { z } from 'zod';

const configSchema = z.object({
  // Telegram
  telegramBotToken: z.string().min(1),
  telegramWebhookUrl: z.string().url().optional(), // Optional: if not set, uses polling

  // Anthropic
  anthropicApiKey: z.string().min(1).optional(),

  // OpenWeatherMap
  openWeatherApiKey: z.string().optional(),

  // Email
  gmailClientId: z.string().optional(),
  gmailClientSecret: z.string().optional(),
  gmailRefreshToken: z.string().optional(),

  // Google Calendar
  gcalCredentialsPath: z.string().optional(),

  // Obsidian
  obsidianVaultPath: z.string().optional(),
  obsidianDailyFolder: z.string().optional(),
  obsidianPendingFolder: z.string().optional(),

  // Notion
  notionApiKey: z.string().optional(),
  notionRootPageId: z.string().optional(),

  // Mindsera
  mindseraSessionCookie: z.string().optional(),

  // App
  digestTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .default('07:00'),
  timezone: z.string().default('UTC'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  host: z.string().default('0.0.0.0'),
  port: z.coerce.number().int().positive().default(5000),
  llmTextModel: z.string().optional(),
  llmVisionModel: z.string().optional(),
  llmDigestModel: z.string().optional(), // Haiku for digest summaries
  gcalClientId: z.string().optional(),
  gcalClientSecret: z.string().optional(),
  gcalRefreshToken: z.string().optional(),
  gcalCalendarId: z.string().optional(),
  gmailUserId: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  // Helper to convert empty strings to undefined
  const env = (key: string): string | undefined => {
    const value = process.env[key];
    return value === '' ? undefined : value;
  };

  const raw = {
    telegramBotToken: env('TELEGRAM_BOT_TOKEN'),
    telegramWebhookUrl: env('TELEGRAM_WEBHOOK_URL'),
    anthropicApiKey: env('ANTHROPIC_API_KEY'),
    openWeatherApiKey: env('OPENWEATHER_API_KEY'),
    gmailClientId: env('GMAIL_CLIENT_ID'),
    gmailClientSecret: env('GMAIL_CLIENT_SECRET'),
    gmailRefreshToken: env('GMAIL_REFRESH_TOKEN'),
    gcalCredentialsPath: env('GCAL_CREDENTIALS_PATH'),
    obsidianVaultPath: env('OBSIDIAN_VAULT_PATH'),
    obsidianDailyFolder: env('OBSIDIAN_DAILY_FOLDER'),
    obsidianPendingFolder: env('OBSIDIAN_PENDING_FOLDER'),
    notionApiKey: env('NOTION_API_KEY'),
    notionRootPageId: env('NOTION_ROOT_PAGE_ID'),
    mindseraSessionCookie: env('MINDSERA_SESSION_COOKIE'),
    digestTime: env('DIGEST_TIME'),
    timezone: env('TIMEZONE'),
    logLevel: env('LOG_LEVEL'),
    host: env('HOST'),
    port: env('PORT'),
    llmTextModel: env('LLM_TEXT_MODEL'),
    llmVisionModel: env('LLM_VISION_MODEL'),
    llmDigestModel: env('LLM_DIGEST_MODEL'),
    gcalClientId: env('GCAL_CLIENT_ID'),
    gcalClientSecret: env('GCAL_CLIENT_SECRET'),
    gcalRefreshToken: env('GCAL_REFRESH_TOKEN'),
    gcalCalendarId: env('GCAL_CALENDAR_ID'),
    gmailUserId: env('GMAIL_USER_ID'),
  };

  try {
    return configSchema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      throw new Error(`Configuration validation failed:\n${issues.join('\n')}`);
    }
    throw error;
  }
}

export const config = loadConfig();
