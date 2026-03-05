#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/taskora}"
PM2_APP_NAME="${PM2_APP_NAME:-taskora}"

echo "[1/5] Go to app dir: $APP_DIR"
cd "$APP_DIR"

echo "[2/5] Pull latest code"
git pull

echo "[3/5] Install dependencies"
npm install

echo "[4/5] Restart PM2 app: $PM2_APP_NAME"
pm2 restart "$PM2_APP_NAME"
pm2 save

echo "[5/5] Health check"
curl -fsS http://127.0.0.1:3000/api/health || true
echo
echo "Done."
