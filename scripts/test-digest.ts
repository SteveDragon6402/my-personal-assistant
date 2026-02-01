/**
 * Test script to preview the morning digest format.
 * Run with: npx tsx scripts/test-digest.ts
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { RSSAdapter } from '../src/adapters/rss/RSSAdapter.js';

const MOCK_WEATHER = {
  current: {
    temp: 14,
    feelsLike: 12,
    humidity: 72,
    uvi: 3,
    description: 'partly cloudy',
    windSpeed: 15,
  },
  today: {
    high: 18,
    low: 11,
    rainChance: 35,
    sunrise: '06:45',
    sunset: '18:30',
  },
  hourly: [
    { hour: '07:00', temp: 12, rainChance: 10, description: 'clear' },
    { hour: '08:00', temp: 13, rainChance: 15, description: 'partly cloudy' },
    { hour: '09:00', temp: 14, rainChance: 20, description: 'partly cloudy' },
    { hour: '10:00', temp: 15, rainChance: 25, description: 'cloudy' },
    { hour: '11:00', temp: 16, rainChance: 30, description: 'cloudy' },
    { hour: '12:00', temp: 17, rainChance: 35, description: 'light rain' },
    { hour: '13:00', temp: 17, rainChance: 40, description: 'light rain' },
    { hour: '14:00', temp: 18, rainChance: 35, description: 'cloudy' },
  ],
};

const MOCK_MEALS = {
  found: true,
  meal_count: 3,
  totals: { calories: 1850, protein: 65 },
  meals: [
    { date: '2026-01-31', description: 'Oatmeal with banana and honey', calories: 350, protein: 8 },
    { date: '2026-01-31', description: 'Chicken salad sandwich, apple', calories: 550, protein: 28 },
    { date: '2026-01-31', description: 'Pasta with tomato sauce, small salad', calories: 650, protein: 18 },
    { date: '2026-01-31', description: 'Greek yogurt', calories: 150, protein: 11 },
  ],
};

const MOCK_SLEEP = {
  found: true,
  nights: 3,
  sessions: [
    { date: '2026-01-31', score: 72, deep_minutes: 45, rem_minutes: 85, time_asleep: '6h 20m' },
    { date: '2026-01-30', score: 68, deep_minutes: 38, rem_minutes: 78, time_asleep: '5h 50m' },
    { date: '2026-01-29', score: 81, deep_minutes: 62, rem_minutes: 95, time_asleep: '7h 15m' },
  ],
};

const WEATHER_PROMPT = `You are a helpful assistant summarizing weather for a morning digest.

Given the weather data below, provide:
1. OBJECTIVE: A brief factual summary (temperature, conditions, rain chance)
2. SUBJECTIVE: Practical advice (e.g., "Take an umbrella", "Great day for outdoor exercise")

Keep it concise - 2-3 sentences total. Be friendly but efficient.

Weather data:
${JSON.stringify(MOCK_WEATHER, null, 2)}`;

const HEALTH_PROMPT = `You are a health coach assistant. Based on the data below, provide a brief, actionable health focus for today. Keep it to 2-3 sentences.

Yesterday's meals:
${JSON.stringify(MOCK_MEALS, null, 2)}

Recent sleep (past 3 nights):
${JSON.stringify(MOCK_SLEEP, null, 2)}

Give specific, personalized advice based on what you see in the data.`;

const RSS_PROMPT = `You are a news curator for a morning digest.

From the headlines below, pick exactly 5 must-read articles across 5 different categories. 
Create 5 unique categories based on the content (e.g., "Morning Coffee Read", "Deep Dive", "Quick Hit", "Geopolitics", "Tech Security", "Economics", "Big Picture", etc.).

For each pick, provide:
- category: Your chosen category name (be creative, 2-3 words max)
- headline: The article title
- pitch: Why to read it (under 10 words)
- link: The URL

Return ONLY valid JSON array, no other text:
[{"category":"...", "headline":"...", "pitch":"...", "link":"..."}]

Headlines:
{{DATA}}`;

async function main() {
  console.log('='.repeat(60));
  console.log('MORNING DIGEST PREVIEW');
  console.log('='.repeat(60));
  console.log();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY not set in environment');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.LLM_DIGEST_MODEL || 'claude-3-5-haiku-20241022';

  console.log(`Using model: ${model}`);
  console.log();

  // 1. Weather Section
  console.log('--- GENERATING WEATHER SECTION ---');
  const weatherResponse = await client.messages.create({
    model,
    max_tokens: 200,
    temperature: 0.4,
    messages: [{ role: 'user', content: WEATHER_PROMPT }],
  });
  const weatherText = weatherResponse.content[0].type === 'text' ? weatherResponse.content[0].text : '';
  
  console.log();
  console.log('🌤️ WEATHER');
  console.log(weatherText);
  console.log();

  // 2. Health Section
  console.log('--- GENERATING HEALTH SECTION ---');
  const healthResponse = await client.messages.create({
    model,
    max_tokens: 250,
    temperature: 0.4,
    messages: [{ role: 'user', content: HEALTH_PROMPT }],
  });
  const healthText = healthResponse.content[0].type === 'text' ? healthResponse.content[0].text : '';

  console.log();
  console.log("💪 TODAY'S FOCUS");
  console.log(healthText);
  console.log();

  // 3. RSS Section - Fetch real feeds
  console.log('--- FETCHING RSS FEEDS ---');
  const rssAdapter = new RSSAdapter();
  let items;
  try {
    items = await rssAdapter.fetchAll();
    console.log(`Fetched ${items.length} items from RSS feeds`);
  } catch (error) {
    console.error('Failed to fetch RSS:', error);
    items = [];
  }

  if (items.length > 0) {
    const headlinesText = items
      .slice(0, 50)
      .map((item) => `- [${item.source}] ${item.title}\n  ${item.link}`)
      .join('\n');

    console.log();
    console.log('--- RAW HEADLINES (first 20) ---');
    items.slice(0, 20).forEach((item) => {
      console.log(`[${item.source}] ${item.title}`);
    });
    console.log();

    console.log('--- GENERATING RSS CURATION ---');
    const rssPrompt = RSS_PROMPT.replace('{{DATA}}', headlinesText);
    const rssResponse = await client.messages.create({
      model,
      max_tokens: 600,
      temperature: 0.5,
      messages: [{ role: 'user', content: rssPrompt }],
    });
    const rssText = rssResponse.content[0].type === 'text' ? rssResponse.content[0].text : '';

    console.log();
    console.log('📰 MUST-READ');
    
    // Try to parse and format nicely
    try {
      const picks = JSON.parse(rssText.trim()) as Array<{
        category: string;
        headline: string;
        pitch: string;
        link: string;
      }>;
      
      picks.forEach((p) => {
        console.log(`\n${p.category}: ${p.headline}`);
        console.log(`${p.pitch}`);
        console.log(`${p.link}`);
      });
    } catch {
      // If JSON parse fails, show raw
      console.log(rssText);
    }
  } else {
    console.log('No RSS items fetched - skipping curation');
  }

  console.log();
  console.log('='.repeat(60));
  console.log('END OF DIGEST PREVIEW');
  console.log('='.repeat(60));
}

main().catch(console.error);
