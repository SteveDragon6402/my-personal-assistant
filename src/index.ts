// Load environment variables first
import 'dotenv/config';

import { config } from './config/index.js';
import { createLogger } from './utils/logger.js';
import { AgenticAssistant } from './core/agent/AgenticAssistant.js';
import { TelegramAdapter } from './adapters/telegram/TelegramAdapter.js';
import { ObsidianAdapter } from './adapters/obsidian/ObsidianAdapter.js';
import { DisabledNotesAdapter } from './adapters/obsidian/DisabledNotesAdapter.js';
import { ClaudeAdapter } from './adapters/llm/ClaudeAdapter.js';
import { DisabledLLMAdapter } from './adapters/llm/DisabledLLMAdapter.js';
import { PendingCaptureRepository } from './persistence/repositories/PendingCaptureRepository.js';
import { MessageHistoryRepository } from './persistence/repositories/MessageHistoryRepository.js';
import { UserPreferencesRepository } from './persistence/repositories/UserPreferencesRepository.js';
import { MealRepository } from './persistence/repositories/MealRepository.js';
import { loadPrompt } from './utils/prompts.js';
import { StoredSleepAdapter } from './adapters/sleep/StoredSleepAdapter.js';
import { SleepLogRepository } from './persistence/repositories/SleepLogRepository.js';
import { GmailAdapter } from './adapters/email/GmailAdapter.js';
import { GoogleCalendarAdapter } from './adapters/calendar/GoogleCalendarAdapter.js';
import { DigestBuilder } from './core/digest/DigestBuilder.js';
import { DailyDigestJob } from './scheduler/DailyDigestJob.js';
import { scheduleDailyDigest } from './scheduler/index.js';
import { startServer } from './server.js';

const logger = createLogger({ component: 'index' });

async function main(): Promise<void> {
  logger.info('Starting Telegram AI Assistant (Agentic Mode)');

  try {
    // Initialize Telegram adapter
    const telegramAdapter = new TelegramAdapter(config);
    await telegramAdapter.initialize();

    // Initialize adapters and repositories
    const notesAdapter = config.obsidianVaultPath
      ? new ObsidianAdapter(config)
      : new DisabledNotesAdapter();
    const llmAdapter = config.anthropicApiKey ? new ClaudeAdapter(config) : new DisabledLLMAdapter();
    const sleepLogRepository = new SleepLogRepository();
    const sleepAdapter = new StoredSleepAdapter(sleepLogRepository);
    const emailAdapter = new GmailAdapter(config);
    const calendarAdapter = new GoogleCalendarAdapter(config);
    const pendingCaptureRepository = new PendingCaptureRepository();
    const messageHistoryRepository = new MessageHistoryRepository();
    const userPreferencesRepository = new UserPreferencesRepository();
    const mealRepository = new MealRepository();

    // Load prompts
    const digestPrompt = await loadPrompt('digest_summary.md');
    const agentSystemPrompt = await loadPrompt('agent_system.md');

    // Set up the daily digest job (still runs on schedule)
    const digestBuilder = new DigestBuilder(
      sleepAdapter,
      calendarAdapter,
      emailAdapter,
      llmAdapter,
      pendingCaptureRepository,
      digestPrompt
    );
    const dailyDigestJob = new DailyDigestJob(
      digestBuilder,
      telegramAdapter,
      messageHistoryRepository,
      userPreferencesRepository,
      config.digestTime,
      config.timezone
    );
    scheduleDailyDigest(dailyDigestJob, config.digestTime, config.timezone);

    // Initialize the agentic assistant (sets up message handlers)
    new AgenticAssistant({
      messagePort: telegramAdapter,
      llmPort: llmAdapter,
      notesPort: notesAdapter,
      emailPort: emailAdapter,
      sleepDataPort: sleepAdapter,
      sleepLogRepository,
      mealRepository,
      messageHistoryRepository,
      systemPrompt: agentSystemPrompt,
    });

    logger.info('Agentic assistant initialized with tool use');

    // Start HTTP server for webhooks (listens on 0.0.0.0:5000 by default for Caddy proxy)
    await startServer(telegramAdapter, config.port, config.host);

    logger.info({ host: config.host, port: config.port }, 'Server started successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to start application');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
