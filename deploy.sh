#!/usr/bin/env bash
# Deploy Telegram assistant to VPS. Run from project root.
# Usage: ./deploy.sh [skip-build]
# Set VPS_HOST and VPS_USER if different.

set -e

VPS_HOST="${VPS_HOST:-192.248.158.86}"
VPS_USER="${VPS_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/telegram-assistant}"

echo "==> Syncing files to ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}"
rsync -avz --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude data \
  --exclude .git \
  --exclude .npm-cache \
  --exclude dist \
  . "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

echo "==> Installing, building, and restarting on VPS (may take 1–2 min; deprecation warnings are normal)"
# Source nvm, install/use Node from .nvmrc (20) so better-sqlite3 has prebuilts; inject node path into systemd unit
ssh "${VPS_USER}@${VPS_HOST}" "source ~/.nvm/nvm.sh 2>/dev/null; cd ${REMOTE_DIR} && nvm install && nvm use && npm ci && npm run build && NODE_PATH=\$(which node) && sed \"s|ExecStart=.*|ExecStart=\$NODE_PATH dist/index.js|\" deploy/telegram-assistant.service | sudo tee /etc/systemd/system/telegram-assistant.service > /dev/null && sudo systemctl daemon-reload && sudo systemctl enable telegram-assistant && (test -f ${REMOTE_DIR}/.env || { echo ''; echo '*** .env missing on server. Create it:'; echo \"  ssh ${VPS_USER}@${VPS_HOST}\"; echo \"  nano ${REMOTE_DIR}/.env\"; echo '  Add at least: TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook/telegram'; echo ''; exit 1; }) && sudo systemctl restart telegram-assistant && sudo systemctl status telegram-assistant --no-pager"

echo "==> Done. Ensure .env exists on server with TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_URL."
echo ""
echo "If you saw 'npm: command not found', install Node on the VPS first:"
echo "  ssh ${VPS_USER}@${VPS_HOST}"
echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
echo "  source ~/.bashrc && nvm install --lts && nvm use --lts"
echo "  Then run ./deploy.sh again."
