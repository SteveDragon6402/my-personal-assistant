// Load environment variables first
import 'dotenv/config';

import { config } from './config/index.js';
import { createLogger } from './utils/logger.js';
import { AgenticAssistant } from './core/agent/AgenticAssistant.js';
import { TelegramAdapter } from './adapters/telegram/TelegramAdapter.js';
import { ObsidianAdapter } from './adapters/obsidian/ObsidianAdapter.js';
import { DisabledNotesAdapter } from './adapters/obsidian/DisabledNotesAdapter.js';
import { ClaudeAdapter } from './adapters/llm/ClaudeAdapter.js';
import { HaikuAdapter } from './adapters/llm/HaikuAdapter.js';
import { DisabledLLMAdapter } from './adapters/llm/DisabledLLMAdapter.js';
import { MessageHistoryRepository } from './persistence/repositories/MessageHistoryRepository.js';
import { MealRepository } from './persistence/repositories/MealRepository.js';
import { HealthProfileRepository } from './persistence/repositories/HealthProfileRepository.js';
import { UserPreferencesRepository } from './persistence/repositories/UserPreferencesRepository.js';
import { loadPrompt } from './utils/prompts.js';
import { StoredSleepAdapter } from './adapters/sleep/StoredSleepAdapter.js';
import { SleepLogRepository } from './persistence/repositories/SleepLogRepository.js';
import { GmailAdapter } from './adapters/email/GmailAdapter.js';
import { OpenWeatherAdapter } from './adapters/weather/OpenWeatherAdapter.js';
import { RSSAdapter } from './adapters/rss/RSSAdapter.js';
import { MorningDigestService } from './core/digest/MorningDigestService.js';
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
    const haikuAdapter = config.anthropicApiKey ? new HaikuAdapter(config) : new DisabledLLMAdapter();
    const sleepLogRepository = new SleepLogRepository();
    const sleepAdapter = new StoredSleepAdapter(sleepLogRepository);
    const emailAdapter = new GmailAdapter(config);
    const weatherAdapter = new OpenWeatherAdapter(config);
    const rssAdapter = new RSSAdapter();
    const messageHistoryRepository = new MessageHistoryRepository();
    const mealRepository = new MealRepository();
    const healthProfileRepository = new HealthProfileRepository();
    const userPreferencesRepository = new UserPreferencesRepository();

    // Load prompts
    const agentSystemPrompt = await loadPrompt('agent_system.md');

    // Initialize the morning digest service
    const morningDigestService = new MorningDigestService({
      weatherPort: weatherAdapter,
      rssAdapter,
      llmPort: llmAdapter,
      haikuPort: haikuAdapter,
      mealRepository,
      sleepDataPort: sleepAdapter,
      userPrefsRepo: userPreferencesRepository,
      messagePort: telegramAdapter,
    });

    // Initialize the agentic assistant (sets up message handlers)
    new AgenticAssistant({
      messagePort: telegramAdapter,
      llmPort: llmAdapter,
      notesPort: notesAdapter,
      emailPort: emailAdapter,
      sleepDataPort: sleepAdapter,
      sleepLogRepository,
      mealRepository,
      healthProfileRepository,
      userPreferencesRepository,
      messageHistoryRepository,
      morningDigestService,
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
