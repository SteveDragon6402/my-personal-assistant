/**
 * Live test of the morning digest using actual APIs and database.
 * Run with: npx tsx scripts/test-digest-live.ts
 */
import 'dotenv/config';
import { getDatabase } from '../src/persistence/database.js';
import { MealRepository } from '../src/persistence/repositories/MealRepository.js';
import { SleepLogRepository } from '../src/persistence/repositories/SleepLogRepository.js';
import { UserPreferencesRepository } from '../src/persistence/repositories/UserPreferencesRepository.js';
import { StoredSleepAdapter } from '../src/adapters/sleep/StoredSleepAdapter.js';
import { ClaudeAdapter } from '../src/adapters/llm/ClaudeAdapter.js';
import { HaikuAdapter } from '../src/adapters/llm/HaikuAdapter.js';
import { OpenWeatherAdapter } from '../src/adapters/weather/OpenWeatherAdapter.js';
import { RSSAdapter } from '../src/adapters/rss/RSSAdapter.js';
import { MorningDigestService } from '../src/core/digest/MorningDigestService.js';
import { config } from '../src/config/index.js';

// Mock MessagePort that just prints to console
const mockMessagePort = {
  async sendMessage(chatId: string, text: string) {
    console.log('\n' + '='.repeat(60));
    console.log(`DIGEST OUTPUT (would send to chatId: ${chatId})`);
    console.log('='.repeat(60));
    console.log(text);
    console.log('='.repeat(60) + '\n');
  },
  async getMediaUrl(fileId: string) {
    return fileId;
  },
};

async function main() {
  console.log('='.repeat(60));
  console.log('LIVE MORNING DIGEST TEST');
  console.log('='.repeat(60));
  console.log();

  // Config is already loaded via import

  // Initialize database
  const db = getDatabase();
  console.log('Database initialized');

  // Create repositories
  const mealRepository = new MealRepository(db);
  const sleepLogRepository = new SleepLogRepository(db);
  const userPrefsRepo = new UserPreferencesRepository(db);

  // Create adapters
  const sleepDataPort = new StoredSleepAdapter(sleepLogRepository);
  const llmPort = new ClaudeAdapter(config); // Sonnet for tool use
  const haikuPort = new HaikuAdapter(config); // Haiku for summaries
  const weatherPort = new OpenWeatherAdapter(config);
  const rssAdapter = new RSSAdapter();

  console.log('Adapters initialized');
  console.log(`  - LLM (Sonnet): ${config.llmTextModel ?? 'default'}`);
  console.log(`  - LLM (Haiku): ${config.llmDigestModel ?? 'claude-3-5-haiku-20241022'}`);
  console.log(`  - Weather API: ${config.openWeatherApiKey ? 'configured' : 'NOT CONFIGURED'}`);
  console.log();

  // Use a test chat ID
  const testChatId = 'test-digest-001';

  // Check if we have user prefs with location
  const prefs = userPrefsRepo.get(testChatId);
  console.log('User preferences:');
  if (prefs?.lat && prefs?.lon) {
    console.log(`  - Location: ${prefs.lat}, ${prefs.lon}`);
  } else {
    console.log('  - Location: NOT SET (will use default London coords for test)');
    // Set default coords for test (London)
    userPrefsRepo.upsert({ chatId: testChatId, lat: 51.5074, lon: -0.1278 });
    console.log('  - Set default location to London (51.5074, -0.1278)');
  }
  console.log();

  // Check what data we have in the database
  const today = new Date().toISOString().split('T')[0] ?? '';
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0] ?? '';
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0] ?? '';

  const recentMeals = mealRepository.getByDateRange(testChatId, threeDaysAgo, today);
  const recentSleep = await sleepDataPort.getRange(threeDaysAgo, today, testChatId);

  console.log('Database contents:');
  console.log(`  - Meals (last 3 days): ${recentMeals.length}`);
  if (recentMeals.length > 0) {
    recentMeals.slice(0, 3).forEach((m) => {
      console.log(`    • ${m.date}: ${m.description} (${m.estimatedCalories ?? '?'} cal)`);
    });
  }
  console.log(`  - Sleep entries (last 3 days): ${recentSleep.length}`);
  if (recentSleep.length > 0) {
    recentSleep.slice(0, 3).forEach((s) => {
      console.log(`    • ${s.date}: ${s.rawText?.slice(0, 50) ?? 'no data'}...`);
    });
  }
  console.log();

  // Create the digest service
  const digestService = new MorningDigestService({
    weatherPort,
    rssAdapter,
    llmPort,
    haikuPort,
    mealRepository,
    sleepDataPort,
    userPrefsRepo,
    messagePort: mockMessagePort,
  });

  console.log('Running digest...');
  console.log('(This will make real API calls to OpenWeather, Anthropic, and RSS feeds)');
  console.log();

  try {
    await digestService.triggerDigest(testChatId);
    console.log('Digest completed successfully!');
  } catch (error) {
    console.error('Digest failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
