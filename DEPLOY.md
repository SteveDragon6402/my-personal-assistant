# Deploy Telegram bot (webhook mode)

This app is **Node.js/TypeScript** with Express. It already supports webhooks; no Flask/FastAPI. Use these steps to run it in webhook mode on your VPS behind Caddy.

## 1. Environment

Create `.env` on the server (or set in systemd). Required for webhook:

- **`TELEGRAM_BOT_TOKEN`** – From [@BotFather](https://t.me/BotFather).
- **`TELEGRAM_WEBHOOK_URL`** – **Full** webhook URL Telegram will POST to. Must be HTTPS.
  - With Caddy proxying to this app: `https://somethingsomething.cv/webhook/telegram`
- **`PORT`** – Optional; default is **5000** (Caddy proxies to `localhost:5000`).
- **`HOST`** – Optional; default is **0.0.0.0** so the app listens on all interfaces.

Optional (digest, capture, etc.): `ANTHROPIC_API_KEY`, `OBSIDIAN_VAULT_PATH`, Gmail/Calendar vars, etc. See `.env.example` and README.

## 2. Set Telegram webhook

After the app is running and reachable at your domain, register the webhook with Telegram (once):

```bash
# Replace YOUR_BOT_TOKEN and your actual domain
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=https://somethingsomething.cv/webhook/telegram"
```

Or from your machine (token in env):

```bash
export TELEGRAM_BOT_TOKEN=your_token_here
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=https://somethingsomething.cv/webhook/telegram"
```

To clear the webhook (e.g. to use polling again):

```bash
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/deleteWebhook"
```

**Note:** The app can also set the webhook on startup when `TELEGRAM_WEBHOOK_URL` is set (see `TelegramAdapter.setupWebhook()`). The curl above is for doing it manually or re-registering.

## 3. Deploy to VPS (192.248.158.86)

### Copy files with SCP

From your **local** machine (in the project root):

```bash
# Exclude node_modules, .env, data, and other non-essential paths
scp -r \
  src package.json package-lock.json tsconfig.json \
  .nvmrc \
  root@192.248.158.86:/opt/telegram-assistant/
```

If you prefer to clone on the server instead:

```bash
ssh root@192.248.158.86
git clone <your-repo-url> /opt/telegram-assistant
cd /opt/telegram-assistant
```

Or rsync to sync the whole tree (excluding large/ignored dirs):

```bash
rsync -avz --exclude node_modules --exclude .env --exclude data --exclude .git \
  . root@192.248.158.86:/opt/telegram-assistant/
```

### On the server

```bash
ssh root@192.248.158.86
cd /opt/telegram-assistant
```

Create `.env` with at least:

- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_WEBHOOK_URL=https://somethingsomething.cv/webhook/telegram`
- `PORT=5000` (optional; default is 5000)

Install dependencies and build:

```bash
npm ci
npm run build
```

### Run persistently with systemd

Create the service file:

```bash
sudo nano /etc/systemd/system/telegram-assistant.service
```

Paste (adjust paths if you used something other than `/opt/telegram-assistant`):

```ini
[Unit]
Description=Telegram AI Personal Assistant (webhook)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/telegram-assistant
EnvironmentFile=/opt/telegram-assistant/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

If you use Node via nvm, use the full path to `node`:

```bash
which node   # e.g. /root/.nvm/versions/node/v20.x.x/bin/node
# Put that path in ExecStart=
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable telegram-assistant
sudo systemctl start telegram-assistant
sudo systemctl status telegram-assistant
```

Logs:

```bash
sudo journalctl -u telegram-assistant -f
```

### Alternative: run with screen

```bash
cd /opt/telegram-assistant
screen -S telegram-bot
export $(grep -v '^#' .env | xargs)
npm run build && node dist/index.js
# Detach: Ctrl+A, then D
# Reattach: screen -r telegram-bot
```

## 4. Caddy

You said Caddy is already proxying to `localhost:5000`. Ensure the route matches the webhook path. The app serves:

- **POST** `/webhook/telegram` – Telegram webhook (must be HTTPS for Telegram).
- **GET** `/health` – Health check.

Example Caddy snippet (you may already have something like this):

```
yourdomain.cv {
    handle /webhook/* {
        reverse_proxy localhost:5000
    }
    handle /health {
        reverse_proxy localhost:5000
    }
}
```

So the full webhook URL is: `https://somethingsomething.cv/webhook/telegram`.

## 5. No `requirements.txt`

This project uses **Node.js** and **npm**. Dependencies are in `package.json`; install with `npm ci` or `npm install`. There is no Python `requirements.txt`.
