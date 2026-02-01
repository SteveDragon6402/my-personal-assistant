# AI Development Guide

Technical documentation for the agentic architecture and future development.

## Architecture Overview

This bot uses an **agentic LLM architecture** where Claude handles all user interactions through tool use:

```
User Message → Claude (with tools) → Tool Execution → Claude (with results) → Response
                     ↑                      ↓
                     └──────────────────────┘
                        (loop until done)
```

### Key Components

| Component | Path | Purpose |
|-----------|------|---------|
| `AgenticAssistant` | `src/core/agent/AgenticAssistant.ts` | Main agent loop, handles messages |
| `ToolExecutor` | `src/core/agent/ToolExecutor.ts` | Dispatches tool calls to adapters |
| `tools.ts` | `src/core/agent/tools.ts` | JSON Schema tool definitions |
| `agent_system.md` | `src/prompts/agent_system.md` | System prompt for Claude |
| `ClaudeAdapter` | `src/adapters/llm/ClaudeAdapter.ts` | Anthropic API integration |

### Current Tools (17)

**Meals**
- `log_meal` - Log food with calorie/macro estimates
- `get_meals_today` - Today's meal summary
- `get_meals_range` - Meals over a date range

**Sleep**
- `log_sleep` - Store raw sleep tracker data
- `get_sleep_last_night` - Most recent sleep data
- `get_sleep_range` - Sleep history over time

**Obsidian Notes**
- `create_note` - Create a new note in a category
- `append_to_daily` - Quick capture to daily note
- `search_notes` - Full-text search
- `get_tasks` - List tasks from notes
- `get_categories` - List available folders
- `read_note` - Read a specific note
- `read_daily_note` - Read today's (or a date's) daily note
- `list_notes` - Browse notes in a folder
- `update_note` - Edit an existing note

**Email**
- `get_newsletters` - Fetch unread newsletters

**Utility**
- `fetch_url` - Fetch and extract webpage content

---

## Open Features / Future Work

### High Priority

#### 1. Prompt Caching
**Status**: Not implemented  
**Impact**: ~85% reduction in input token costs

Anthropic's prompt caching allows caching the system prompt + tool definitions. Since these are ~3,100 tokens sent with every request, caching would significantly reduce costs.

**Implementation**:
```typescript
// In ClaudeAdapter.generateWithTools()
const response = await this.client.messages.create({
  model: this.textModel,
  max_tokens: maxTokens,
  system: [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' }  // Add this
    }
  ],
  tools: tools.map(t => ({
    ...t,
    cache_control: { type: 'ephemeral' }  // Or cache tools
  })),
  messages: convertedMessages,
});
```

Cache TTL is 5 minutes by default. For extended caching, use Anthropic's beta header.

**References**:
- [Anthropic Prompt Caching Docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)

---

#### 2. Calendar Integration
**Status**: Adapter exists, no tools  
**Files**: `src/adapters/calendar/GoogleCalendarAdapter.ts`

The calendar adapter is implemented but not exposed as tools. Add:

```typescript
// Proposed tools
- get_calendar_today     // What's on my calendar today?
- get_calendar_range     // Events for a date range
- create_event           // Schedule something
- find_free_time         // When am I free this week?
```

---

#### 3. Smart Model Routing
**Status**: Not implemented  
**Impact**: ~10x cost reduction for simple messages

Route simple messages (greetings, confirmations, single-tool calls) to Haiku 3.5 instead of Sonnet 4.5.

**Approach**:
1. Use Haiku to classify intent complexity
2. Or use heuristics: message length, presence of URLs, question complexity
3. Route to appropriate model

---

#### 4. Meal/Sleep Editing & Deletion
**Status**: Not implemented

Currently can only add data, not modify. Add tools:
- `delete_meal` - Remove a logged meal by ID
- `edit_meal` - Update calories/macros for a meal
- `delete_sleep` - Remove a sleep entry

---

### Medium Priority

#### 5. Conversation Memory
**Status**: Removed (caused issues)

The original implementation stored message history but caused the bot to re-execute old commands. A better approach:

- Store summary of recent context, not raw messages
- Use separate "memory" tool Claude can query
- Implement sliding window with summarization

---

#### 6. Reminders & Scheduling
**Status**: Not implemented

Allow the user to set reminders:
- `set_reminder` - "Remind me to X at 3pm"
- `list_reminders` - Show pending reminders
- `cancel_reminder` - Remove a reminder

Requires: scheduled job runner, notification mechanism (Telegram scheduled message or polling)

---

#### 7. Image/Photo Handling
**Status**: Vision capability exists, no tool

The Claude adapter supports vision but there's no tool for it. Use cases:
- Photo of meal → automatic calorie estimation
- Screenshot of sleep data → parse and log
- Photo of whiteboard → transcribe to note

**Implementation**: Handle `message.photo` in TelegramAdapter, send to Claude with vision.

---

#### 8. Web Search
**Status**: Not implemented

Let Claude search the web for real-time information:
- `web_search` - Search query, return top results
- Useful for: "What time is sunset today?", "Who won the game?"

Could use: Brave Search API, SerpAPI, or Tavily

---

#### 9. Daily Digest On-Demand
**Status**: Scheduled only, not on-demand

The `DigestBuilder` runs on a cron schedule. Expose as a tool:
- `generate_digest` - "Give me my daily digest now"

---

#### 10. Data Export
**Status**: Not implemented

Export personal data for analysis:
- `export_meals` - Export meals to CSV
- `export_sleep` - Export sleep data
- `export_notes` - Export notes as markdown ZIP

---

### Low Priority / Nice to Have

#### 11. Undo Last Action
Track recent actions, allow rollback:
- `undo` - Undo the last meal log / note creation

#### 12. User Preferences Tool
- `set_preference` - Set timezone, default category, notification settings
- `get_preferences` - View current settings

#### 13. Health Correlations
Analyze patterns across data:
- "How does my sleep affect my eating?"
- "Show me my energy levels vs sleep quality"

#### 14. Quick Actions / Shortcuts
Pre-defined commands for common flows:
- `/quick meal` → Logs "quick meal, ~500 cal"
- `/sleep` → Prompts for sleep data paste

---

## Adding a New Tool

1. **Define the tool** in `src/core/agent/tools.ts`:
```typescript
export const myNewTool: ToolDefinition = {
  name: 'my_new_tool',
  description: 'What this tool does and when to use it',
  input_schema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '...' },
    },
    required: ['param1'],
  },
};
```

2. **Add to ALL_TOOLS array** at the bottom of `tools.ts`

3. **Implement execution** in `src/core/agent/ToolExecutor.ts`:
```typescript
case 'my_new_tool': {
  const result = await this.someAdapter.doThing(input.param1);
  return JSON.stringify(result);
}
```

4. **Update system prompt** in `src/prompts/agent_system.md` if the tool needs usage guidance

5. **Test** by sending a message that should trigger the tool

---

## Cost Tracking

Usage is tracked **cumulatively** across all tool iterations in `AgenticAssistant.handleMessage()`.

**Per-message costs (Claude Sonnet 4.5, no caching):**

| Message Type | Iterations | Input Tokens | Output Tokens | Cost |
|--------------|------------|--------------|---------------|------|
| Simple (no tools) | 0 | ~3,100 | ~30 | $0.010 |
| Single tool (log meal) | 1 | ~6,500 | ~100 | $0.021 |
| Multi-tool (save URL) | 3 | ~14,000 | ~260 | $0.046 |

**Baseline**: ~3,100 tokens is the system prompt + tool definitions (sent each iteration)

**Weekly estimate** (82 messages):
- 20 URL saves: 280K input, 5.2K output
- 30 meals: 195K input, 3K output  
- 7 sleep logs: 45K input, 700 output
- 25 misc: 100K input, 1.5K output
- **Total**: ~620K input, ~10.4K output

**Monthly cost**: ~$8.00 (without caching)  
**With prompt caching**: ~$1.50/month

---

## Debugging

### View tool execution
Check logs for:
```
service":"AgenticAssistant" ... "iterations":3
```
`iterations` = number of tool-use rounds

### Test a specific tool
Send a message designed to trigger it:
- Meal: "I just ate a banana"
- Sleep: "Good morning! [paste sleep data]"
- Note: "Save this: https://example.com"
- Search: "Find my notes about project X"

### Common issues

1. **Tool not called**: Check system prompt guidance, tool description
2. **Wrong tool called**: Improve tool descriptions to be more specific
3. **Tool fails silently**: Check ToolExecutor error handling, adapter logs
