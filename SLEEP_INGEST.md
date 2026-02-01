# Sleep Data: Manual Ingest

Sleep data is **manually ingested** (no external sleep API):

1. **Forward or paste** your morning sleep summary to the bot.
2. **Commands:**
   - `/sleep` — Bot replies asking you to paste or forward your summary; the **next message** you send is stored as sleep data for today.
   - `/sleep <paste your summary>` — Store the pasted text as sleep data for today.
3. **Forwarded messages** — If you forward a message from a source whose name contains "eight", "sleep", or "pod" (e.g. a sleep tracker app), and the text has numbers, the bot treats it as sleep data and stores it for today.

Stored entries are in the `sleep_log` table (per chat, date, raw text). The digest and "how did I sleep?" use this data; raw text is parsed (regex) into score, deep/REM minutes, bed/wake times, etc. for display.

No env vars or API keys are required for sleep.
