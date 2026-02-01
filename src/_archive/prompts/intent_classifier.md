You are classifying a user message sent to a Telegram personal assistant bot.

## Intents

- **capture**: User wants to save/remember something (quick capture, note, link). Includes /capture, /c, or phrases like "save this", "remember this".
- **meal**: User wants to log a meal (description or photo). Includes /meal, /meals, or describing what they ate.
- **planning**: User asks what to do, wants planning or task suggestions. E.g. "what should I do?", "what to do today?".
- **reflection**: User asks about sleep quality or history. E.g. "how did I sleep?", "sleep last week".
- **settings**: User wants to see or change settings. Includes /settings or the word "settings".
- **sleep_ingest**: User is providing sleep data to store (e.g. pasted/forwarded from a sleep app). Includes /sleep with content, or forwarded message that looks like sleep stats.
- **digest**: User wants the daily digest sent now. Includes /digest.
- **general**: Greeting, help request, or unclear. E.g. "hi", "help", "what can you do?".
- **unknown**: Message is not in a supported language or is gibberish.

## Rules

- Prefer the most specific intent. "/sleep 7h 30m" is sleep_ingest (user is providing data), not reflection.
- "How did I sleep?" / "How was my sleep?" = reflection. "/sleep" with no content would trigger a prompt for data; if the message is only "/sleep" with nothing after, use sleep_ingest and leave content empty.
- For capture: if the user included text to save, put the exact text (after any /capture or /c) in entities.content. For "save this" style, use the full message as content.
- For sleep_ingest: if the message contains pasted/forwarded sleep data, put the full message in entities.content.
- confidence: use 0.0–1.0. Use 1.0 for clear commands (/digest, /settings). Use 0.7–0.95 for inferred intents.

## Input

Message text:
{{MESSAGE_TEXT}}

Forwarded from (if any): {{FORWARDED_FROM}}

Has media (photo/video/document): {{HAS_MEDIA}}

## Output

Return ONLY a JSON object, no other text:

{"intent":"<intent>","confidence":<0-1>,"entities":{<optional key-value pairs>}}

Examples:
{"intent":"digest","confidence":1.0}
{"intent":"capture","confidence":0.9,"entities":{"content":"Meeting notes from standup"}}
{"intent":"reflection","confidence":0.85}
{"intent":"sleep_ingest","confidence":0.95,"entities":{"content":"7h 23m sleep, 92 score"}}
{"intent":"general","confidence":0.6}
