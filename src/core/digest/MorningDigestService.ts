import type { WeatherPort } from '../../ports/WeatherPort.js';
import type { LLMPort, Message, ContentBlock, ToolDefinition } from '../../ports/LLMPort.js';
import type { MessagePort } from '../../ports/MessagePort.js';
import type { SleepDataPort } from '../../ports/SleepDataPort.js';
import type { MealRepository } from '../../persistence/repositories/MealRepository.js';
import type { UserPreferencesRepository } from '../../persistence/repositories/UserPreferencesRepository.js';
import type { RSSAdapter } from '../../adapters/rss/RSSAdapter.js';
import { createLogger } from '../../utils/logger.js';

const HEALTH_TOOLS: ToolDefinition[] = [
  {
    name: 'get_meals_range',
    description: 'Get meals logged within a date range.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_sleep_range',
    description: 'Get sleep data for a date range.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['start_date', 'end_date'],
    },
  },
];

const WEATHER_PROMPT = `You are summarizing weather for a morning digest.

Given the weather data below, provide:
1. OBJECTIVE: A brief factual summary (temperature, conditions, rain chance). Use the same units as the data (e.g. °C for temperature).
2. SUBJECTIVE: Practical advice (e.g. "Take an umbrella", "Good day for a run").

Keep it to 2-3 sentences. Be concise and factual.

Weather data:
{{DATA}}`;

const HEALTH_PROMPT = `You are a health coach assistant creating a brief morning health focus.

Today is {{DATE}}. Use the tools to:
1. Get meals for the last 3 days (get_meals_range: start_date and end_date covering the past 3 days)
2. Get sleep data for the last 3 days (get_sleep_range: same date range)

Then provide a brief, actionable health focus for today based on what you find. Cite the data: use actual numbers (calories, protein, sleep score, time asleep, RHR, HRV, interruptions) when available. Keep it to 2-3 sentences.

Examples (quantitatively supported):
- "Last 3 days averaged ~1,200 cal and 42g protein; aim for at least one protein-rich meal today to close the gap toward ~60g."
- "Sleep averaged 6h 20m with scores 72, 68, 81 and 4 interruptions/night; aim for 7h and a consistent wind-down to reduce interruptions."
- "RHR 58–62 and HRV 45–52 ms over the past 3 nights—recovery looks stable; keep hydration and meal timing consistent today."

If no data is available, give one sentence of general wellness advice.`;

const RSS_PROMPT = `You are a news curator for a morning digest.

From the headlines below, pick exactly 5 must-read articles. Assign each pick a category label that is creative, distinctive, and interesting—not a topic area (avoid "Geopolitics", "Tech", "Economics", "Security", etc.).

Categories should surprise or delight: name the *vibe*, *lens*, or *reason to read* rather than the subject. Examples of the kind of label you want: "Read this with coffee", "The one that reframes everything", "Contrarian take", "Best with 20 minutes to spare", "Might change your mind", "Underrated angle", "The rabbit hole", "Worth the long read". Invent new ones every time; never default to dull topic buckets.

For each pick, provide:
- category: A unique, interesting label (2–5 words). No topic-area names.
- headline: The article title
- pitch: Why to read it (under 10 words)
- link: The URL

Output only the JSON array—no markdown code fences, no surrounding text, no explanation. Valid example:
[{"category":"...", "headline":"...", "pitch":"...", "link":"..."}]

Headlines:
{{DATA}}`;

export interface MorningDigestDependencies {
  weatherPort: WeatherPort;
  rssAdapter: RSSAdapter;
  llmPort: LLMPort; // Sonnet for health plan (tool use)
  haikuPort: LLMPort; // Haiku for weather + RSS summaries
  mealRepository: MealRepository;
  sleepDataPort: SleepDataPort;
  userPrefsRepo: UserPreferencesRepository;
  messagePort: MessagePort;
}

export class MorningDigestService {
  private readonly logger = createLogger({ service: 'MorningDigestService' });
  private readonly deps: MorningDigestDependencies;

  constructor(deps: MorningDigestDependencies) {
    this.deps = deps;
  }

  async triggerDigest(chatId: string): Promise<void> {
    const logger = this.logger.child({ method: 'triggerDigest', chatId });
    logger.info('Starting morning digest');

    const prefs = this.deps.userPrefsRepo.get(chatId);

    // Run all sections in parallel
    const [weatherSection, healthSection, rssSection] = await Promise.allSettled([
      this.buildWeatherSection(prefs?.lat, prefs?.lon),
      this.buildHealthSection(chatId),
      this.buildRSSSection(),
    ]);

    // Combine sections
    const sections: string[] = [];

    sections.push('☀️ Good morning! Here\'s your daily brief:\n');

    // Weather
    if (weatherSection.status === 'fulfilled' && weatherSection.value) {
      sections.push('🌤️ WEATHER\n' + weatherSection.value);
    } else {
      logger.warn({ error: weatherSection.status === 'rejected' ? weatherSection.reason : 'no location' }, 'Weather section failed');
      sections.push('🌤️ WEATHER\nSet your location to get weather updates.');
    }

    sections.push('');

    // Health
    if (healthSection.status === 'fulfilled' && healthSection.value) {
      sections.push('💪 TODAY\'S FOCUS\n' + healthSection.value);
    } else {
      logger.warn({ error: healthSection.status === 'rejected' ? healthSection.reason : 'unknown' }, 'Health section failed');
      sections.push('💪 TODAY\'S FOCUS\nStay hydrated and move your body today.');
    }

    sections.push('');

    // RSS
    if (rssSection.status === 'fulfilled' && rssSection.value) {
      sections.push('📰 MUST-READ\n' + rssSection.value);
    } else {
      logger.warn({ error: rssSection.status === 'rejected' ? rssSection.reason : 'unknown' }, 'RSS section failed');
      sections.push('📰 MUST-READ\nCouldn\'t fetch headlines today.');
    }

    const digest = sections.join('\n');

    await this.deps.messagePort.sendMessage(chatId, digest);
    logger.info('Morning digest sent');
  }

  private async buildWeatherSection(lat?: number, lon?: number): Promise<string | null> {
    if (lat === undefined || lon === undefined) {
      return null;
    }

    const logger = this.logger.child({ method: 'buildWeatherSection' });

    const weather = await this.deps.weatherPort.getWeather(lat, lon);
    const weatherJson = JSON.stringify(weather, null, 2);

    const prompt = WEATHER_PROMPT.replace('{{DATA}}', weatherJson);

    const response = await this.deps.haikuPort.generateText({
      prompt,
      maxTokens: 200,
      temperature: 0.4,
    });

    logger.debug({ usage: response.usage }, 'Weather summary generated');

    return response.text.trim();
  }

  private async buildHealthSection(chatId: string): Promise<string> {
    const logger = this.logger.child({ method: 'buildHealthSection' });

    const today = new Date().toISOString().split('T')[0] ?? '';
    const prompt = HEALTH_PROMPT.replace('{{DATE}}', today);

    const messages: Message[] = [{ role: 'user', content: prompt }];

    // Run a mini agent loop with Sonnet for tool use
    let response = await this.deps.llmPort.generateWithTools({
      messages,
      tools: HEALTH_TOOLS,
      maxTokens: 500,
    });

    let iterations = 0;
    const maxIterations = 3;

    while (response.stopReason === 'tool_use' && iterations < maxIterations) {
      iterations++;

      if (!response.toolCalls || response.toolCalls.length === 0) break;

      messages.push({ role: 'assistant', content: response.contentBlocks });

      const toolResults: ContentBlock[] = [];
      for (const toolCall of response.toolCalls) {
        const result = await this.executeHealthTool(toolCall.name, toolCall.input, chatId);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });

      response = await this.deps.llmPort.generateWithTools({
        messages,
        tools: HEALTH_TOOLS,
        maxTokens: 500,
      });
    }

    logger.debug({ iterations, usage: response.usage }, 'Health section generated');

    return response.text?.trim() ?? 'Focus on balanced nutrition and good sleep today.';
  }

  private async executeHealthTool(
    name: string,
    input: Record<string, unknown>,
    chatId: string
  ): Promise<string> {
    const startDate = String(input.start_date ?? '');
    const endDate = String(input.end_date ?? '');

    if (name === 'get_meals_range') {
      const meals = this.deps.mealRepository.getByDateRange(chatId, startDate, endDate);
      if (meals.length === 0) {
        return JSON.stringify({ found: false, message: 'No meals logged in this range' });
      }
      const totalCalories = meals.reduce((sum, m) => sum + (m.estimatedCalories ?? 0), 0);
      const totalProtein = meals.reduce((sum, m) => sum + (m.estimatedProtein ?? 0), 0);
      return JSON.stringify({
        found: true,
        meal_count: meals.length,
        totals: { calories: totalCalories, protein: totalProtein },
        meals: meals.map((m) => ({
          date: m.date,
          description: m.description,
          calories: m.estimatedCalories,
          protein: m.estimatedProtein,
        })),
      });
    }

    if (name === 'get_sleep_range') {
      const sleepData = await this.deps.sleepDataPort.getRange(startDate, endDate, chatId);
      if (sleepData.length === 0) {
        return JSON.stringify({ found: false, message: 'No sleep data in this range' });
      }
      return JSON.stringify({
        found: true,
        nights: sleepData.length,
        sessions: sleepData.map((s) => {
          const hours = Math.floor(s.timeAsleep / 60);
          const mins = s.timeAsleep % 60;
          return {
            date: s.date,
            score: s.sleepScore,
            time_slept: `${hours}h ${mins}m`,
            deep_minutes: s.deepSleepMinutes,
            rem_minutes: s.remSleepMinutes,
            rhr: s.restingHeartRate,
            hrv: s.hrv,
            interruptions: s.interruptions,
          };
        }),
      });
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  private async buildRSSSection(): Promise<string> {
    const logger = this.logger.child({ method: 'buildRSSSection' });

    const items = await this.deps.rssAdapter.fetchAll();

    if (items.length === 0) {
      return 'No new articles today.';
    }

    // Format items for the prompt
    const headlinesText = items
      .slice(0, 50) // Limit to recent 50
      .map((item) => `- [${item.source}] ${item.title}\n  ${item.link}`)
      .join('\n');

    const prompt = RSS_PROMPT.replace('{{DATA}}', headlinesText);

    const response = await this.deps.haikuPort.generateText({
      prompt,
      maxTokens: 600,
      temperature: 0.5,
    });

    logger.debug({ usage: response.usage }, 'RSS curation generated');

    // Try to parse JSON and format nicely
    try {
      const picks = JSON.parse(response.text.trim()) as Array<{
        category: string;
        headline: string;
        pitch: string;
        link: string;
      }>;

      return picks
        .map((p) => `${p.category}: ${p.headline}\n${p.pitch}\n${p.link}`)
        .join('\n\n');
    } catch {
      // If JSON parse fails, return raw response
      logger.warn('Failed to parse RSS JSON, returning raw response');
      return response.text.trim();
    }
  }
}
