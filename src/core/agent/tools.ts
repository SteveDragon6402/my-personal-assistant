import type { ToolDefinition } from '../../ports/LLMPort.js';

/**
 * Tool definitions for the agentic assistant.
 * These follow the Anthropic tool use JSON Schema format.
 */

// ============================================================================
// MEAL TOOLS
// ============================================================================

export const logMealTool: ToolDefinition = {
  name: 'log_meal',
  description:
    'Log a meal the user ate. Use this when the user tells you what they ate. ' +
    'Estimate calories and macros (protein, carbs, fat) and, when you can, key vitamins and minerals. ' +
    'Vitamins: A (mcg RAE), C (mg), D (mcg), E (mg), K (mcg), B6 (mg), B12 (mcg), folate (mcg DFE). ' +
    'Minerals: iron, calcium, magnesium, zinc, potassium (mg); selenium, iodine (mcg). All micros are optional estimates. ' +
    'Classify the meal_type based on context (e.g., "breakfast", "lunch", "dinner", "snack", "late night snack"). ' +
    'If the user mentions when they ate (e.g., "I had eggs this morning at 8am"), set time_eaten accordingly.',
  input_schema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'A brief description of what the user ate',
      },
      meal_type: {
        type: 'string',
        description:
          'Type of meal based on context (e.g., "breakfast", "lunch", "dinner", "snack", "brunch", "late night snack")',
      },
      time_eaten: {
        type: 'string',
        description:
          'ISO 8601 timestamp of when the meal was eaten (e.g., "2026-02-01T08:30:00"). ' +
          'Only set if the user specifies a time. Omit to default to now.',
      },
      calories: {
        type: 'number',
        description: 'Estimated total calories',
      },
      protein: {
        type: 'number',
        description: 'Estimated protein in grams',
      },
      carbs: {
        type: 'number',
        description: 'Estimated carbohydrates in grams',
      },
      fat: {
        type: 'number',
        description: 'Estimated fat in grams',
      },
      // Vitamins (optional estimates; units in descriptions)
      vitamin_a_mcg: { type: 'number', description: 'Vitamin A, mcg RAE' },
      vitamin_c_mg: { type: 'number', description: 'Vitamin C, mg' },
      vitamin_d_mcg: { type: 'number', description: 'Vitamin D, mcg' },
      vitamin_e_mg: { type: 'number', description: 'Vitamin E, mg' },
      vitamin_k_mcg: { type: 'number', description: 'Vitamin K, mcg' },
      vitamin_b6_mg: { type: 'number', description: 'Vitamin B6, mg' },
      vitamin_b12_mcg: { type: 'number', description: 'Vitamin B12, mcg' },
      folate_mcg: { type: 'number', description: 'Folate, mcg DFE' },
      // Minerals (optional estimates)
      iron_mg: { type: 'number', description: 'Iron, mg' },
      calcium_mg: { type: 'number', description: 'Calcium, mg' },
      magnesium_mg: { type: 'number', description: 'Magnesium, mg' },
      zinc_mg: { type: 'number', description: 'Zinc, mg' },
      potassium_mg: { type: 'number', description: 'Potassium, mg' },
      selenium_mcg: { type: 'number', description: 'Selenium, mcg' },
      iodine_mcg: { type: 'number', description: 'Iodine, mcg' },
    },
    required: ['description'],
  },
};

export const getMealsTodayTool: ToolDefinition = {
  name: 'get_meals_today',
  description:
    'Get all meals logged today. Use this when the user asks about what they ate today or wants a summary of their daily nutrition.',
  input_schema: {
    type: 'object',
    properties: {},
  },
};

export const getMealsRangeTool: ToolDefinition = {
  name: 'get_meals_range',
  description:
    'Get meals logged within a date range. Use this when the user asks about meals over multiple days.',
  input_schema: {
    type: 'object',
    properties: {
      start_date: {
        type: 'string',
        description: 'Start date in ISO format (YYYY-MM-DD)',
      },
      end_date: {
        type: 'string',
        description: 'End date in ISO format (YYYY-MM-DD)',
      },
    },
    required: ['start_date', 'end_date'],
  },
};

// ============================================================================
// HEALTH PROFILE TOOLS
// ============================================================================

export const getHealthProfileTool: ToolDefinition = {
  name: 'get_health_profile',
  description:
    'Get the user\'s health profile (height, weight, gender, age). Use this when giving nutrition or meal recommendations so you can account for BMI and personal context.',
  input_schema: {
    type: 'object',
    properties: {},
  },
};

export const setHealthProfileTool: ToolDefinition = {
  name: 'set_health_profile',
  description:
    'Record or update the user\'s health profile: height (cm), weight (kg), gender, age. Use when the user shares this info. Only provided fields are updated.',
  input_schema: {
    type: 'object',
    properties: {
      height_cm: {
        type: 'number',
        description: 'Height in centimeters',
      },
      weight_kg: {
        type: 'number',
        description: 'Weight in kilograms',
      },
      gender: {
        type: 'string',
        description: 'Gender (e.g. male, female, other)',
      },
      age: {
        type: 'number',
        description: 'Age in years',
      },
    },
  },
};

// ============================================================================
// EMAIL TOOLS (Read-only)
// ============================================================================

export const getNewslettersTool: ToolDefinition = {
  name: 'get_newsletters',
  description:
    'Fetch unread newsletter emails since a given date. Use this when the user asks about their newsletters or wants to catch up on email digests.',
  input_schema: {
    type: 'object',
    properties: {
      since_hours: {
        type: 'number',
        description:
          'How many hours back to look for newsletters. Defaults to 24 if not specified.',
      },
    },
  },
};

// ============================================================================
// SLEEP TOOLS
// ============================================================================

export const logSleepTool: ToolDefinition = {
  name: 'log_sleep',
  description:
    'Log sleep data from the user. Extract structured metrics when possible. ' +
    'Use this when the user shares sleep data (pasted from an app, or described verbally).',
  input_schema: {
    type: 'object',
    properties: {
      raw_text: {
        type: 'string',
        description: 'The raw sleep data text from the user (for reference/backup)',
      },
      date: {
        type: 'string',
        description:
          'The date for this sleep entry in ISO format (YYYY-MM-DD). Defaults to today if not specified.',
      },
      sleep_score: {
        type: 'number',
        description: 'Sleep quality score (0-100) if provided',
      },
      time_slept_minutes: {
        type: 'number',
        description: 'Total time slept in minutes (e.g., 420 for 7 hours)',
      },
      deep_sleep_minutes: {
        type: 'number',
        description: 'Deep sleep duration in minutes',
      },
      rem_sleep_minutes: {
        type: 'number',
        description: 'REM sleep duration in minutes',
      },
      rhr: {
        type: 'number',
        description: 'Resting heart rate in bpm',
      },
      hrv: {
        type: 'number',
        description: 'Heart rate variability in milliseconds',
      },
      interruptions: {
        type: 'number',
        description: 'Number of sleep interruptions/awakenings',
      },
    },
    required: ['raw_text'],
  },
};

export const getSleepLastNightTool: ToolDefinition = {
  name: 'get_sleep_last_night',
  description:
    "Get the user's most recent sleep data. Use this when the user asks about how they slept last night or their recent sleep.",
  input_schema: {
    type: 'object',
    properties: {},
  },
};

export const getSleepRangeTool: ToolDefinition = {
  name: 'get_sleep_range',
  description:
    'Get sleep data for a date range. Use this when the user asks about sleep patterns over time or wants a weekly/monthly summary.',
  input_schema: {
    type: 'object',
    properties: {
      start_date: {
        type: 'string',
        description: 'Start date in ISO format (YYYY-MM-DD)',
      },
      end_date: {
        type: 'string',
        description: 'End date in ISO format (YYYY-MM-DD)',
      },
    },
    required: ['start_date', 'end_date'],
  },
};

// ============================================================================
// OBSIDIAN TOOLS
// ============================================================================

export const createNoteTool: ToolDefinition = {
  name: 'create_note',
  description:
    'Create a new note in Obsidian. Use this for longer content that deserves its own file, ' +
    'such as article summaries, meeting notes, or research. First call get_categories to see available categories.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The title of the note (will be used as filename)',
      },
      content: {
        type: 'string',
        description: 'The content of the note in markdown format',
      },
      category: {
        type: 'string',
        description:
          'The category/folder path to save the note in (e.g., "Areas/Health", "Projects/Work")',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags to add to the note',
      },
    },
    required: ['title', 'content', 'category'],
  },
};

export const appendToDailyTool: ToolDefinition = {
  name: 'append_to_daily',
  description:
    "Append content to today's daily note in Obsidian. Use this for quick captures, " +
    'thoughts, links, or anything that fits in a daily log.',
  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The content to append to the daily note',
      },
    },
    required: ['content'],
  },
};

export const searchNotesTool: ToolDefinition = {
  name: 'search_notes',
  description:
    'Search notes in Obsidian by text query. Use this when the user wants to find notes about a topic.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
    },
    required: ['query'],
  },
};

export const getTasksTool: ToolDefinition = {
  name: 'get_tasks',
  description:
    'Get tasks from Obsidian notes. Use this when the user asks about their tasks, to-dos, or what they need to do.',
  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['open', 'done'],
        description: "Filter by task status. 'open' for incomplete tasks, 'done' for completed.",
      },
      project: {
        type: 'string',
        description: 'Filter by project folder name',
      },
    },
  },
};

export const getCategoriesTool: ToolDefinition = {
  name: 'get_categories',
  description:
    'List available note categories/folders in Obsidian. Use this before creating a note ' +
    'to see what categories are available.',
  input_schema: {
    type: 'object',
    properties: {},
  },
};

export const readNoteTool: ToolDefinition = {
  name: 'read_note',
  description:
    'Read the full content of a note by its path. Use this when the user wants to see ' +
    'what a specific note contains, or after searching to read a found note.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the note relative to the vault (e.g., "Projects/MyProject.md")',
      },
    },
    required: ['path'],
  },
};

export const readDailyNoteTool: ToolDefinition = {
  name: 'read_daily_note',
  description:
    "Read today's daily note (or a specific date's daily note). Use this when the user " +
    'asks what they captured today or wants to see their daily log.',
  input_schema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Optional date in ISO format (YYYY-MM-DD). Defaults to today if not specified.',
      },
    },
  },
};

export const listNotesTool: ToolDefinition = {
  name: 'list_notes',
  description:
    'List all notes in a folder, sorted by most recently modified. Use this when the user ' +
    'wants to browse their notes or see what\'s in a specific category.',
  input_schema: {
    type: 'object',
    properties: {
      folder: {
        type: 'string',
        description:
          'Optional folder path to list (e.g., "Projects", "Areas/Health"). ' +
          'If not specified, lists all notes in the vault.',
      },
    },
  },
};

export const updateNoteTool: ToolDefinition = {
  name: 'update_note',
  description:
    'Update/replace the content of an existing note. Use this when the user wants to ' +
    'edit a note, add to it, or make changes. You should read the note first, then send the full updated content.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the note relative to the vault',
      },
      content: {
        type: 'string',
        description: 'The complete new content for the note (replaces existing content)',
      },
    },
    required: ['path', 'content'],
  },
};

// ============================================================================
// UTILITY TOOLS
// ============================================================================

export const fetchUrlTool: ToolDefinition = {
  name: 'fetch_url',
  description:
    'Fetch and read the content of a webpage. Use this when the user shares a URL and you need to ' +
    'understand what the article/page is about in order to summarize it or save it with context.',
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch',
      },
    },
    required: ['url'],
  },
};

// ============================================================================
// LOCATION TOOLS
// ============================================================================

export const setLocationTool: ToolDefinition = {
  name: 'set_location',
  description:
    'Set the user\'s location (latitude and longitude) for weather in the morning digest. ' +
    'Use this when the user tells you their city or location.',
  input_schema: {
    type: 'object',
    properties: {
      lat: {
        type: 'number',
        description: 'Latitude (e.g., 51.5074 for London)',
      },
      lon: {
        type: 'number',
        description: 'Longitude (e.g., -0.1278 for London)',
      },
    },
    required: ['lat', 'lon'],
  },
};

// ============================================================================
// ALL TOOLS COMBINED
// ============================================================================

export const ALL_TOOLS: ToolDefinition[] = [
  // Meals
  logMealTool,
  getMealsTodayTool,
  getMealsRangeTool,
  // Health profile
  getHealthProfileTool,
  setHealthProfileTool,
  // Email
  getNewslettersTool,
  // Sleep
  logSleepTool,
  getSleepLastNightTool,
  getSleepRangeTool,
  // Location
  setLocationTool,
  // Obsidian
  createNoteTool,
  appendToDailyTool,
  searchNotesTool,
  getTasksTool,
  getCategoriesTool,
  readNoteTool,
  readDailyNoteTool,
  listNotesTool,
  updateNoteTool,
  // Utility
  fetchUrlTool,
];
