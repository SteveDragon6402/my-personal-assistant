# Telegram AI Personal Assistant

A modular, production-grade Telegram-based AI personal assistant that aggregates personal data from multiple sources and provides intelligent daily digests, quick capture, meal tracking, and ad-hoc assistance.

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Telegram**: Bot API
- **AI/LLM**: Anthropic Claude API
- **Database**: SQLite (via better-sqlite3)
- **HTTP Server**: Express

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your configuration:
```bash
cp .env.example .env
```

3. **Gmail/Calendar refresh token (optional):** If you want newsletters or calendar in the digest:
   - In [Google Cloud Console](https://console.cloud.google.com/) create an OAuth client (Desktop app), enable Gmail API (and Calendar API if needed). Add redirect URI: `http://localhost:3001/callback`.
   - Put `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in `.env`.
   - Run `npm run gmail-token`; your browser opens, you sign in and approve. The refresh token is printed — add it to `.env` as `GMAIL_REFRESH_TOKEN=...`. For Calendar you can use the same token and set `GCAL_CLIENT_ID` / `GCAL_CLIENT_SECRET` / `GCAL_REFRESH_TOKEN` (same values as Gmail if using the same OAuth client).

4. Build the project:
```bash
npm run build
```

5. Run in development mode:
```bash
npm run dev
```

## Webhook mode (production)

By default the app listens on **0.0.0.0:5000** for webhook delivery. To use webhooks instead of polling:

- Set **`TELEGRAM_WEBHOOK_URL`** to the **full** HTTPS URL Telegram will POST to, e.g. `https://yourdomain.com/webhook/telegram`.
- Set **`TELEGRAM_BOT_TOKEN`** (required). The app will register the webhook on startup when `TELEGRAM_WEBHOOK_URL` is set.
- Optional: **`PORT`** (default **5000**), **`HOST`** (default **0.0.0.0**).

To register the webhook manually (e.g. after deploy):

```bash
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=https://yourdomain.com/webhook/telegram"
```

See **[DEPLOY.md](DEPLOY.md)** for VPS deployment (SCP, systemd, Caddy).

## Development

- `npm run build` - Compile TypeScript
- `npm run dev` - Run in watch mode
- `npm run gmail-token` - One-time OAuth flow to get Gmail/Calendar refresh token (prints token for `.env`)
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm test` - Run tests
- `npm run test:coverage` - Run tests with coverage

## Architecture

This project follows clean architecture principles with hexagonal/ports-and-adapters pattern. All external services are behind interfaces for testability and maintainability.
