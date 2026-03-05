#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <domain> <www_domain> <repo_url> <jwt_secret> [app_dir]"
  echo "Example: $0 example.com www.example.com https://github.com/user/taskora.git super-secret /var/www/taskora"
  exit 1
fi

DOMAIN="$1"
WWW_DOMAIN="$2"
REPO_URL="$3"
JWT_SECRET="$4"
APP_DIR="${5:-/var/www/taskora}"

echo "==> Installing system packages"
sudo apt update
sudo apt install -y curl git nginx certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Installing PM2"
  sudo npm i -g pm2
fi

echo "==> Preparing app directory: $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"
cd "$APP_DIR"

if [[ ! -d .git ]]; then
  echo "==> Cloning repository"
  git clone "$REPO_URL" .
else
  echo "==> Repository exists, pulling latest"
  git pull
fi

echo "==> Installing dependencies"
npm install

echo "==> Writing production .env"
cat > .env << EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=$JWT_SECRET
BASE_URL=https://$DOMAIN

AUTH_RATE_WINDOW_MS=900000
AUTH_RATE_MAX=30
RESET_RATE_WINDOW_MS=900000
RESET_RATE_MAX=10

SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_SECURE=false
MAIL_FROM=no-reply@$DOMAIN

GOOGLE_CLIENT_ID=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
EOF

echo "==> Starting app with PM2"
pm2 start ecosystem.config.cjs --only taskora || pm2 restart taskora
pm2 save
pm2 startup | tail -n 1 || true

echo "==> Writing nginx config"
sudo tee /etc/nginx/sites-available/taskora > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN $WWW_DOMAIN;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/taskora /etc/nginx/sites-enabled/taskora
sudo nginx -t
sudo systemctl restart nginx

echo "==> Requesting SSL certificate"
sudo certbot --nginx -d "$DOMAIN" -d "$WWW_DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" || true

echo "==> Health check"
curl -fsS http://127.0.0.1:3000/api/health || true

echo
echo "Done."
echo "Open: https://$DOMAIN"
